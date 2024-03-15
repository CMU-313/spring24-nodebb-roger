'use strict';

// For JS requirement
const assert = require('node:assert');
const qs = require('node:querystring');
const nconf = require('nconf');
const user = require('../user');
const meta = require('../meta');
const topics = require('../topics');
const categories = require('../categories');
const posts = require('../posts');
const privileges = require('../privileges');
const pagination = require('../pagination');
const utils = require('../utils');
const analytics = require('../analytics');
const helpers = require('./helpers');

const topicsController = module.exports;

const url = nconf.get('url');
const relative_path = nconf.get('relative_path');
const upload_url = nconf.get('upload_url');

topicsController.get = async function getTopic(request, res, next) {
	const tid = request.params.topic_id;

	if (
		(request.params.post_index && !utils.isNumber(request.params.post_index) && request.params.post_index !== 'unread')
        || !utils.isNumber(tid)
	) {
		return next();
	}

	let postIndex = Number.parseInt(request.params.post_index, 10) || 1;
	const [
		userPrivileges,
		settings,
		topicData,
		rssToken,
	] = await Promise.all([
		privileges.topics.get(tid, request.uid),
		user.getSettings(request.uid),
		topics.getTopicData(tid),
		user.auth.getFeedToken(request.uid),
	]);

	let currentPage = Number.parseInt(request.query.page, 10) || 1;
	const pageCount = Math.max(1, Math.ceil((topicData && topicData.postcount) / settings.postsPerPage));
	const invalidPagination = (settings.usePagination && (currentPage < 1 || currentPage > pageCount));
	if (
		!topicData
        || userPrivileges.disabled
        || invalidPagination
        || (topicData.scheduled && !userPrivileges.view_scheduled)
	) {
		return next();
	}

	if (!userPrivileges['topics:read'] || (!topicData.scheduled && topicData.deleted && !userPrivileges.view_deleted)) {
		return helpers.notAllowed(request, res);
	}

	if (request.params.post_index === 'unread') {
		postIndex = await topics.getUserBookmark(tid, request.uid);
	}

	if (!res.locals.isAPI && (!request.params.slug || topicData.slug !== `${tid}/${request.params.slug}`) && (topicData.slug && topicData.slug !== `${tid}/`)) {
		return helpers.redirect(res, `/topic/${topicData.slug}${postIndex ? `/${postIndex}` : ''}${generateQueryString(request.query)}`, true);
	}

	if (utils.isNumber(postIndex) && topicData.postcount > 0 && (postIndex < 1 || postIndex > topicData.postcount)) {
		return helpers.redirect(res, `/topic/${tid}/${request.params.slug}${postIndex > topicData.postcount ? `/${topicData.postcount}` : ''}${generateQueryString(request.query)}`);
	}

	postIndex = Math.max(1, postIndex);
	const sort = request.query.sort || settings.topicPostSort;
	const set = sort === 'most_votes' ? `tid:${tid}:posts:votes` : `tid:${tid}:posts`;
	const reverse = sort === 'newest_to_oldest' || sort === 'most_votes';
	if (settings.usePagination && !request.query.page) {
		currentPage = calculatePageFromIndex(postIndex, settings);
	}

	const {start, stop} = calculateStartStop(currentPage, postIndex, settings);

	await topics.getTopicWithPosts(topicData, set, request.uid, start, stop, reverse);

	if (currentPage !== 1) {
		// Pinned posts should only appear on the first page.
		topicData.pinnedPosts = [];
	}

	topics.modifyPostsByPrivilege(topicData, userPrivileges);
	topicData.tagWhitelist = categories.filterTagWhitelist(topicData.tagWhitelist, userPrivileges.isAdminOrMod);

	topicData.privileges = userPrivileges;
	topicData.topicStaleDays = meta.config.topicStaleDays;
	topicData['reputation:disabled'] = meta.config['reputation:disabled'];
	topicData['downvote:disabled'] = meta.config['downvote:disabled'];
	topicData['feeds:disableRSS'] = meta.config['feeds:disableRSS'] || 0;
	topicData['signatures:hideDuplicates'] = meta.config['signatures:hideDuplicates'];
	topicData.bookmarkThreshold = meta.config.bookmarkThreshold;
	topicData.necroThreshold = meta.config.necroThreshold;
	topicData.postEditDuration = meta.config.postEditDuration;
	topicData.postDeleteDuration = meta.config.postDeleteDuration;
	topicData.scrollToMyPost = settings.scrollToMyPost;
	topicData.updateUrlWithPostIndex = settings.updateUrlWithPostIndex;
	topicData.allowMultipleBadges = meta.config.allowMultipleBadges === 1;
	topicData.privateUploads = meta.config.privateUploads === 1;
	topicData.showPostPreviewsOnHover = meta.config.showPostPreviewsOnHover === 1;
	topicData.rssFeedUrl = `${relative_path}/topic/${topicData.tid}.rss`;
	if (request.loggedIn) {
		topicData.rssFeedUrl += `?uid=${request.uid}&token=${rssToken}`;
	}

	topicData.postIndex = postIndex;

	await Promise.all([
		buildBreadcrumbs(topicData),
		addOldCategory(topicData, userPrivileges),
		addTags(topicData, request, res),
		incrementViewCount(request, tid),
		markAsRead(request, tid),
		analytics.increment([`pageviews:byCid:${topicData.category.cid}`]),
	]);

	topicData.pagination = pagination.create(currentPage, pageCount, request.query);
	for (const rel of topicData.pagination.rel) {
		rel.href = `${url}/topic/${topicData.slug}${rel.href}`;
		res.locals.linkTags.push(rel);
	}

	// Ensure that pinned posts are added as a list to the result in some form
	assert(topicData.hasOwnProperty('pinnedPosts'), 'topicData does not have a pinned posts field');
	assert(typeof (topicData.pinnedPosts) === typeof ([]));

	res.render('topic', topicData);
};

function generateQueryString(query) {
	const qString = qs.stringify(query);
	return qString.length > 0 ? `?${qString}` : '';
}

function calculatePageFromIndex(postIndex, settings) {
	return 1 + Math.floor((postIndex - 1) / settings.postsPerPage);
}

function calculateStartStop(page, postIndex, settings) {
	let startSkip = 0;

	if (!settings.usePagination) {
		if (postIndex > 1) {
			page = 1;
		}

		startSkip = Math.max(0, postIndex - Math.ceil(settings.postsPerPage / 2));
	}

	const start = ((page - 1) * settings.postsPerPage) + startSkip;
	const stop = start + settings.postsPerPage - 1;
	return {start: Math.max(0, start), stop: Math.max(0, stop)};
}

async function incrementViewCount(request, tid) {
	const allow = request.uid > 0 || (meta.config.guestsIncrementTopicViews && request.uid === 0);
	if (allow) {
		request.session.tids_viewed = request.session.tids_viewed || {};
		const now = Date.now();
		const interval = meta.config.incrementTopicViewsInterval * 60_000;
		if (!request.session.tids_viewed[tid] || request.session.tids_viewed[tid] < now - interval) {
			await topics.increaseViewCount(tid);
			request.session.tids_viewed[tid] = now;
		}
	}
}

async function markAsRead(request, tid) {
	if (request.loggedIn) {
		const markedRead = await topics.markAsRead([tid], request.uid);
		const promises = [topics.markTopicNotificationsRead([tid], request.uid)];
		if (markedRead) {
			promises.push(topics.pushUnreadCount(request.uid));
		}

		await Promise.all(promises);
	}
}

async function buildBreadcrumbs(topicData) {
	const breadcrumbs = [
		{
			text: topicData.category.name,
			url: `${relative_path}/category/${topicData.category.slug}`,
			cid: topicData.category.cid,
		},
		{
			text: topicData.title,
		},
	];
	const parentCrumbs = await helpers.buildCategoryBreadcrumbs(topicData.category.parentCid);
	topicData.breadcrumbs = parentCrumbs.concat(breadcrumbs);
}

async function addOldCategory(topicData, userPrivileges) {
	if (userPrivileges.isAdminOrMod && topicData.oldCid) {
		topicData.oldCategory = await categories.getCategoryFields(
			topicData.oldCid, ['cid', 'name', 'icon', 'bgColor', 'color', 'slug'],
		);
	}
}

async function addTags(topicData, request, res) {
	const postIndex = Number.parseInt(request.params.post_index, 10) || 0;
	const postAtIndex = topicData.posts.find(p => Number.parseInt(p.index, 10) === Number.parseInt(Math.max(0, postIndex - 1), 10));
	let description = '';
	if (postAtIndex && postAtIndex.content) {
		description = utils.stripHTMLTags(utils.decodeHTMLEntities(postAtIndex.content));
	}

	if (description.length > 255) {
		description = `${description.slice(0, 255)}...`;
	}

	description = description.replaceAll('\n', ' ');

	res.locals.metaTags = [
		{
			name: 'title',
			content: topicData.titleRaw,
		},
		{
			name: 'description',
			content: description,
		},
		{
			property: 'og:title',
			content: topicData.titleRaw,
		},
		{
			property: 'og:description',
			content: description,
		},
		{
			property: 'og:type',
			content: 'article',
		},
		{
			property: 'article:published_time',
			content: utils.toISOString(topicData.timestamp),
		},
		{
			property: 'article:modified_time',
			content: utils.toISOString(topicData.lastposttime),
		},
		{
			property: 'article:section',
			content: topicData.category ? topicData.category.name : '',
		},
	];

	await addOGImageTags(res, topicData, postAtIndex);

	res.locals.linkTags = [
		{
			rel: 'canonical',
			href: `${url}/topic/${topicData.slug}`,
		},
	];

	if (!topicData['feeds:disableRSS']) {
		res.locals.linkTags.push({
			rel: 'alternate',
			type: 'application/rss+xml',
			href: topicData.rssFeedUrl,
		});
	}

	if (topicData.category) {
		res.locals.linkTags.push({
			rel: 'up',
			href: `${url}/category/${topicData.category.slug}`,
		});
	}
}

async function addOGImageTags(res, topicData, postAtIndex) {
	const uploads = postAtIndex ? await posts.uploads.listWithSizes(postAtIndex.pid) : [];
	const images = uploads.map(upload => {
		upload.name = `${url + upload_url}/${upload.name}`;
		return upload;
	});
	if (topicData.thumbs) {
		const path = require('node:path');
		const thumbs = topicData.thumbs.filter(
			t => t && images.every(img => path.normalize(img.name) !== path.normalize(url + t.url)),
		);
		images.push(...thumbs.map(thumbObject => ({name: url + thumbObject.url})));
	}

	if (topicData.category.backgroundImage && (!postAtIndex || !postAtIndex.index)) {
		images.push(topicData.category.backgroundImage);
	}

	if (postAtIndex && postAtIndex.user && postAtIndex.user.picture) {
		images.push(postAtIndex.user.picture);
	}

	for (const path of images) {
		addOGImageTag(res, path);
	}
}

function addOGImageTag(res, image) {
	let imageUrl;
	if (typeof image === 'string' && !image.startsWith('http')) {
		imageUrl = url + image.replace(new RegExp(`^${relative_path}`), '');
	} else if (typeof image === 'object') {
		imageUrl = image.name;
	} else {
		imageUrl = image;
	}

	res.locals.metaTags.push({
		property: 'og:image',
		content: imageUrl,
		noEscape: true,
	}, {
		property: 'og:image:url',
		content: imageUrl,
		noEscape: true,
	});

	if (typeof image === 'object' && image.width && image.height) {
		res.locals.metaTags.push({
			property: 'og:image:width',
			content: String(image.width),
		}, {
			property: 'og:image:height',
			content: String(image.height),
		});
	}
}

topicsController.teaser = async function (request, res, next) {
	const tid = request.params.topic_id;
	if (!utils.isNumber(tid)) {
		return next();
	}

	const canRead = await privileges.topics.can('topics:read', tid, request.uid);
	if (!canRead) {
		return res.status(403).json('[[error:no-privileges]]');
	}

	const pid = await topics.getLatestUndeletedPid(tid);
	if (!pid) {
		return res.status(404).json('not-found');
	}

	const postData = await posts.getPostSummaryByPids([pid], request.uid, {stripTags: false});
	if (postData.length === 0) {
		return res.status(404).json('not-found');
	}

	res.json(postData[0]);
};

topicsController.pagination = async function (request, res, next) {
	const tid = request.params.topic_id;
	const currentPage = Number.parseInt(request.query.page, 10) || 1;

	if (!utils.isNumber(tid)) {
		return next();
	}

	const [userPrivileges, settings, topic] = await Promise.all([
		privileges.topics.get(tid, request.uid),
		user.getSettings(request.uid),
		topics.getTopicData(tid),
	]);

	if (!topic) {
		return next();
	}

	if (!userPrivileges.read || !privileges.topics.canViewDeletedScheduled(topic, userPrivileges)) {
		return helpers.notAllowed(request, res);
	}

	const postCount = topic.postcount;
	const pageCount = Math.max(1, Math.ceil(postCount / settings.postsPerPage));

	const paginationData = pagination.create(currentPage, pageCount);
	for (const rel of paginationData.rel) {
		rel.href = `${url}/topic/${topic.slug}${rel.href}`;
	}

	res.json({pagination: paginationData});
};
