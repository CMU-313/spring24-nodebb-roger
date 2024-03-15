'use strict';

const rss = require('rss');
const nconf = require('nconf');
const validator = require('validator');
const posts = require('../posts');
const topics = require('../topics');
const user = require('../user');
const categories = require('../categories');
const meta = require('../meta');
const helpers = require('../controllers/helpers');
const privileges = require('../privileges');
const db = require('../database');
const utils = require('../utils');
const controllers404 = require('../controllers/404');

const terms = {
	daily: 'day',
	weekly: 'week',
	monthly: 'month',
	alltime: 'alltime',
};

module.exports = function (app, middleware) {
	app.get('/topic/:topic_id.rss', middleware.maintenanceMode, generateForTopic);
	app.get('/category/:category_id.rss', middleware.maintenanceMode, generateForCategory);
	app.get('/topics.rss', middleware.maintenanceMode, generateForTopics);
	app.get('/recent.rss', middleware.maintenanceMode, generateForRecent);
	app.get('/top.rss', middleware.maintenanceMode, generateForTop);
	app.get('/top/:term.rss', middleware.maintenanceMode, generateForTop);
	app.get('/popular.rss', middleware.maintenanceMode, generateForPopular);
	app.get('/popular/:term.rss', middleware.maintenanceMode, generateForPopular);
	app.get('/recentposts.rss', middleware.maintenanceMode, generateForRecentPosts);
	app.get('/category/:category_id/recentposts.rss', middleware.maintenanceMode, generateForCategoryRecentPosts);
	app.get('/user/:userslug/topics.rss', middleware.maintenanceMode, generateForUserTopics);
	app.get('/tags/:tag.rss', middleware.maintenanceMode, generateForTag);
};

async function validateTokenIfRequiresLogin(requiresLogin, cid, request, res) {
	const uid = Number.parseInt(request.query.uid, 10) || 0;
	const {token} = request.query;

	if (!requiresLogin) {
		return true;
	}

	if (uid <= 0 || !token) {
		return helpers.notAllowed(request, res);
	}

	const userToken = await db.getObjectField(`user:${uid}`, 'rss_token');
	if (userToken !== token) {
		await user.auth.logAttempt(uid, request.ip);
		return helpers.notAllowed(request, res);
	}

	const userPrivileges = await privileges.categories.get(cid, uid);
	if (!userPrivileges.read) {
		return helpers.notAllowed(request, res);
	}

	return true;
}

async function generateForTopic(request, res, next) {
	if (meta.config['feeds:disableRSS']) {
		return next();
	}

	const tid = request.params.topic_id;

	const [userPrivileges, topic] = await Promise.all([
		privileges.topics.get(tid, request.uid),
		topics.getTopicData(tid),
	]);

	if (!privileges.topics.canViewDeletedScheduled(topic, userPrivileges)) {
		return next();
	}

	if (await validateTokenIfRequiresLogin(!userPrivileges['topics:read'], topic.cid, request, res)) {
		const topicData = await topics.getTopicWithPosts(topic, `tid:${tid}:posts`, request.uid || request.query.uid || 0, 0, 24, true);

		topics.modifyPostsByPrivilege(topicData, userPrivileges);

		const feed = new rss({
			title: utils.stripHTMLTags(topicData.title, utils.tags),
			description: topicData.posts.length > 0 ? topicData.posts[0].content : '',
			feed_url: `${nconf.get('url')}/topic/${tid}.rss`,
			site_url: `${nconf.get('url')}/topic/${topicData.slug}`,
			image_url: topicData.posts.length > 0 ? topicData.posts[0].picture : '',
			author: topicData.posts.length > 0 ? topicData.posts[0].username : '',
			ttl: 60,
		});

		if (topicData.posts.length > 0) {
			feed.pubDate = new Date(Number.parseInt(topicData.posts[0].timestamp, 10)).toUTCString();
		}

		const replies = topicData.posts.slice(1);
		for (const postData of replies) {
			if (!postData.deleted) {
				const dateStamp = new Date(
					Number.parseInt(Number.parseInt(postData.edited, 10) === 0 ? postData.timestamp : postData.edited, 10),
				).toUTCString();

				feed.item({
					title: `Reply to ${utils.stripHTMLTags(topicData.title, utils.tags)} on ${dateStamp}`,
					description: postData.content,
					url: `${nconf.get('url')}/post/${postData.pid}`,
					author: postData.user ? postData.user.username : '',
					date: dateStamp,
				});
			}
		}

		sendFeed(feed, res);
	}
}

async function generateForCategory(request, res, next) {
	const cid = request.params.category_id;
	if (meta.config['feeds:disableRSS'] || !Number.parseInt(cid, 10)) {
		return next();
	}

	const uid = request.uid || request.query.uid || 0;
	const [userPrivileges, category, tids] = await Promise.all([
		privileges.categories.get(cid, request.uid),
		categories.getCategoryData(cid),
		db.getSortedSetRevIntersect({
			sets: ['topics:tid', `cid:${cid}:tids:lastposttime`],
			start: 0,
			stop: 25,
			weights: [1, 0],
		}),
	]);

	if (!category || !category.name) {
		return next();
	}

	if (await validateTokenIfRequiresLogin(!userPrivileges.read, cid, request, res)) {
		let topicsData = await topics.getTopicsByTids(tids, uid);
		topicsData = await user.blocks.filter(uid, topicsData);
		const feed = await generateTopicsFeed({
			uid,
			title: category.name,
			description: category.description,
			feed_url: `/category/${cid}.rss`,
			site_url: `/category/${category.cid}`,
		}, topicsData, 'timestamp');

		sendFeed(feed, res);
	}
}

async function generateForTopics(request, res, next) {
	if (meta.config['feeds:disableRSS']) {
		return next();
	}

	let token = null;
	if (request.query.token && request.query.uid) {
		token = await db.getObjectField(`user:${request.query.uid}`, 'rss_token');
	}

	await sendTopicsFeed({
		uid: token && token === request.query.token ? request.query.uid : request.uid,
		title: 'Most recently created topics',
		description: 'A list of topics that have been created recently',
		feed_url: '/topics.rss',
		useMainPost: true,
	}, 'topics:tid', res);
}

async function generateForRecent(request, res, next) {
	await generateSorted({
		title: 'Recently Active Topics',
		description: 'A list of topics that have been active within the past 24 hours',
		feed_url: '/recent.rss',
		site_url: '/recent',
		sort: 'recent',
		timestampField: 'lastposttime',
		term: 'alltime',
	}, request, res, next);
}

async function generateForTop(request, res, next) {
	await generateSorted({
		title: 'Top Voted Topics',
		description: 'A list of topics that have received the most votes',
		feed_url: `/top/${request.params.term || 'daily'}.rss`,
		site_url: `/top/${request.params.term || 'daily'}`,
		sort: 'votes',
		timestampField: 'timestamp',
		term: 'day',
	}, request, res, next);
}

async function generateForPopular(request, res, next) {
	await generateSorted({
		title: 'Popular Topics',
		description: 'A list of topics that are sorted by post count',
		feed_url: `/popular/${request.params.term || 'daily'}.rss`,
		site_url: `/popular/${request.params.term || 'daily'}`,
		sort: 'posts',
		timestampField: 'timestamp',
		term: 'day',
	}, request, res, next);
}

async function generateSorted(options, request, res, next) {
	if (meta.config['feeds:disableRSS']) {
		return next();
	}

	const term = terms[request.params.term] || options.term;

	let token = null;
	if (request.query.token && request.query.uid) {
		token = await db.getObjectField(`user:${request.query.uid}`, 'rss_token');
	}

	const uid = token && token === request.query.token ? request.query.uid : request.uid;

	const parameters = {
		uid,
		start: 0,
		stop: 19,
		term,
		sort: options.sort,
	};

	const {cid} = request.query;
	if (cid) {
		if (!await privileges.categories.can('topics:read', cid, uid)) {
			return helpers.notAllowed(request, res);
		}

		parameters.cids = [cid];
	}

	const result = await topics.getSortedTopics(parameters);
	const feed = await generateTopicsFeed({
		uid,
		title: options.title,
		description: options.description,
		feed_url: options.feed_url,
		site_url: options.site_url,
	}, result.topics, options.timestampField);

	sendFeed(feed, res);
}

async function sendTopicsFeed(options, set, res, timestampField) {
	const start = options.hasOwnProperty('start') ? options.start : 0;
	const stop = options.hasOwnProperty('stop') ? options.stop : 19;
	const topicData = await topics.getTopicsFromSet(set, options.uid, start, stop);
	const feed = await generateTopicsFeed(options, topicData.topics, timestampField);
	sendFeed(feed, res);
}

async function generateTopicsFeed(feedOptions, feedTopics, timestampField) {
	feedOptions.ttl = 60;
	feedOptions.feed_url = nconf.get('url') + feedOptions.feed_url;
	feedOptions.site_url = nconf.get('url') + feedOptions.site_url;

	feedTopics = feedTopics.filter(Boolean);

	const feed = new rss(feedOptions);

	if (feedTopics.length > 0) {
		feed.pubDate = new Date(feedTopics[0][timestampField]).toUTCString();
	}

	async function addFeedItem(topicData) {
		const feedItem = {
			title: utils.stripHTMLTags(topicData.title, utils.tags),
			url: `${nconf.get('url')}/topic/${topicData.slug}`,
			date: new Date(topicData[timestampField]).toUTCString(),
		};

		if (topicData.deleted) {
			return;
		}

		if (topicData.teaser && topicData.teaser.user && !feedOptions.useMainPost) {
			feedItem.description = topicData.teaser.content;
			feedItem.author = topicData.teaser.user.username;
			feed.item(feedItem);
			return;
		}

		const mainPost = await topics.getMainPost(topicData.tid, feedOptions.uid);
		if (!mainPost) {
			feed.item(feedItem);
			return;
		}

		feedItem.description = mainPost.content;
		feedItem.author = mainPost.user && mainPost.user.username;
		feed.item(feedItem);
	}

	for (const topicData of feedTopics) {
		/* eslint-disable no-await-in-loop */
		await addFeedItem(topicData);
	}

	return feed;
}

async function generateForRecentPosts(request, res, next) {
	if (meta.config['feeds:disableRSS']) {
		return next();
	}

	const page = Number.parseInt(request.query.page, 10) || 1;
	const postsPerPage = 20;
	const start = Math.max(0, (page - 1) * postsPerPage);
	const stop = start + postsPerPage - 1;
	const postData = await posts.getRecentPosts(request.uid, start, stop, 'month');
	const feed = generateForPostsFeed({
		title: 'Recent Posts',
		description: 'A list of recent posts',
		feed_url: '/recentposts.rss',
		site_url: '/recentposts',
	}, postData);

	sendFeed(feed, res);
}

async function generateForCategoryRecentPosts(request, res) {
	if (meta.config['feeds:disableRSS']) {
		return controllers404.handle404(request, res);
	}

	const cid = request.params.category_id;
	const page = Number.parseInt(request.query.page, 10) || 1;
	const topicsPerPage = 20;
	const start = Math.max(0, (page - 1) * topicsPerPage);
	const stop = start + topicsPerPage - 1;
	const [userPrivileges, category, postData] = await Promise.all([
		privileges.categories.get(cid, request.uid),
		categories.getCategoryData(cid),
		categories.getRecentReplies(cid, request.uid || request.query.uid || 0, start, stop),
	]);

	if (!category) {
		return controllers404.handle404(request, res);
	}

	if (await validateTokenIfRequiresLogin(!userPrivileges.read, cid, request, res)) {
		const feed = generateForPostsFeed({
			title: `${category.name} Recent Posts`,
			description: `A list of recent posts from ${category.name}`,
			feed_url: `/category/${cid}/recentposts.rss`,
			site_url: `/category/${cid}/recentposts`,
		}, postData);

		sendFeed(feed, res);
	}
}

function generateForPostsFeed(feedOptions, posts) {
	feedOptions.ttl = 60;
	feedOptions.feed_url = nconf.get('url') + feedOptions.feed_url;
	feedOptions.site_url = nconf.get('url') + feedOptions.site_url;

	const feed = new rss(feedOptions);

	if (posts.length > 0) {
		feed.pubDate = new Date(Number.parseInt(posts[0].timestamp, 10)).toUTCString();
	}

	for (const postData of posts) {
		feed.item({
			title: postData.topic ? postData.topic.title : '',
			description: postData.content,
			url: `${nconf.get('url')}/post/${postData.pid}`,
			author: postData.user ? postData.user.username : '',
			date: new Date(Number.parseInt(postData.timestamp, 10)).toUTCString(),
		});
	}

	return feed;
}

async function generateForUserTopics(request, res, next) {
	if (meta.config['feeds:disableRSS']) {
		return next();
	}

	const {userslug} = request.params;
	const uid = await user.getUidByUserslug(userslug);
	if (!uid) {
		return next();
	}

	const userData = await user.getUserFields(uid, ['uid', 'username']);
	await sendTopicsFeed({
		uid: request.uid,
		title: `Topics by ${userData.username}`,
		description: `A list of topics that are posted by ${userData.username}`,
		feed_url: `/user/${userslug}/topics.rss`,
		site_url: `/user/${userslug}/topics`,
	}, `uid:${userData.uid}:topics`, res);
}

async function generateForTag(request, res) {
	if (meta.config['feeds:disableRSS']) {
		return controllers404.handle404(request, res);
	}

	const tag = validator.escape(String(request.params.tag));
	const page = Number.parseInt(request.query.page, 10) || 1;
	const topicsPerPage = meta.config.topicsPerPage || 20;
	const start = Math.max(0, (page - 1) * topicsPerPage);
	const stop = start + topicsPerPage - 1;
	await sendTopicsFeed({
		uid: request.uid,
		title: `Topics tagged with ${tag}`,
		description: `A list of topics that have been tagged with ${tag}`,
		feed_url: `/tags/${tag}.rss`,
		site_url: `/tags/${tag}`,
		start,
		stop,
	}, `tag:${tag}:topics`, res);
}

function sendFeed(feed, res) {
	const xml = feed.xml();
	res.type('xml').set('Content-Length', Buffer.byteLength(xml)).send(xml);
}
