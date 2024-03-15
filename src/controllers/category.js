'use strict';

const qs = require('node:querystring');
const validator = require('validator');
const nconf = require('nconf');
const db = require('../database');
const privileges = require('../privileges');
const user = require('../user');
const categories = require('../categories');
const meta = require('../meta');
const pagination = require('../pagination');
const utils = require('../utils');
const translator = require('../translator');
const analytics = require('../analytics');
const helpers = require('./helpers');

const categoryController = module.exports;

const url = nconf.get('url');
const relative_path = nconf.get('relative_path');

categoryController.get = async function (request, res, next) {
	const cid = request.params.category_id;

	let currentPage = Number.parseInt(request.query.page, 10) || 1;
	let topicIndex = utils.isNumber(request.params.topic_index) ? Number.parseInt(request.params.topic_index, 10) - 1 : 0;
	if ((request.params.topic_index && !utils.isNumber(request.params.topic_index)) || !utils.isNumber(cid)) {
		return next();
	}

	const [categoryFields, userPrivileges, userSettings, rssToken] = await Promise.all([
		categories.getCategoryFields(cid, ['slug', 'disabled', 'link']),
		privileges.categories.get(cid, request.uid),
		user.getSettings(request.uid),
		user.auth.getFeedToken(request.uid),
	]);

	if (!categoryFields.slug
        || (categoryFields && categoryFields.disabled)
        || (userSettings.usePagination && currentPage < 1)) {
		return next();
	}

	if (topicIndex < 0) {
		return helpers.redirect(res, `/category/${categoryFields.slug}?${qs.stringify(request.query)}`);
	}

	if (!userPrivileges.read) {
		return helpers.notAllowed(request, res);
	}

	if (!res.locals.isAPI && !request.params.slug && (categoryFields.slug && categoryFields.slug !== `${cid}/`)) {
		return helpers.redirect(res, `/category/${categoryFields.slug}?${qs.stringify(request.query)}`, true);
	}

	if (categoryFields.link) {
		await db.incrObjectField(`category:${cid}`, 'timesClicked');
		return helpers.redirect(res, validator.unescape(categoryFields.link));
	}

	if (!userSettings.usePagination) {
		topicIndex = Math.max(0, topicIndex - (Math.ceil(userSettings.topicsPerPage / 2) - 1));
	} else if (!request.query.page) {
		const index = Math.max(Number.parseInt((topicIndex || 0), 10), 0);
		currentPage = Math.ceil((index + 1) / userSettings.topicsPerPage);
		topicIndex = 0;
	}

	const targetUid = await user.getUidByUserslug(request.query.author);
	const start = ((currentPage - 1) * userSettings.topicsPerPage) + topicIndex;
	const stop = start + userSettings.topicsPerPage - 1;

	const categoryData = await categories.getCategoryById({
		uid: request.uid,
		cid,
		start,
		stop,
		sort: request.query.sort || userSettings.categoryTopicSort,
		settings: userSettings,
		query: request.query,
		tag: request.query.tag,
		targetUid,
	});
	if (!categoryData) {
		return next();
	}

	if (topicIndex > Math.max(categoryData.topic_count - 1, 0)) {
		return helpers.redirect(res, `/category/${categoryData.slug}/${categoryData.topic_count}?${qs.stringify(request.query)}`);
	}

	const pageCount = Math.max(1, Math.ceil(categoryData.topic_count / userSettings.topicsPerPage));
	if (userSettings.usePagination && currentPage > pageCount) {
		return next();
	}

	categories.modifyTopicsByPrivilege(categoryData.topics, userPrivileges);
	categoryData.tagWhitelist = categories.filterTagWhitelist(categoryData.tagWhitelist, userPrivileges.isAdminOrMod);

	await buildBreadcrumbs(request, categoryData);
	if (categoryData.children.length > 0) {
		const allCategories = [];
		categories.flattenCategories(allCategories, categoryData.children);
		await categories.getRecentTopicReplies(allCategories, request.uid, request.query);
		categoryData.subCategoriesLeft = Math.max(0, categoryData.children.length - categoryData.subCategoriesPerPage);
		categoryData.hasMoreSubCategories = categoryData.children.length > categoryData.subCategoriesPerPage;
		categoryData.nextSubCategoryStart = categoryData.subCategoriesPerPage;
		categoryData.children = categoryData.children.slice(0, categoryData.subCategoriesPerPage);
		for (const child of categoryData.children) {
			if (child) {
				helpers.trimChildren(child);
				helpers.setCategoryTeaser(child);
			}
		}
	}

	categoryData.title = translator.escape(categoryData.name);
	categoryData.selectCategoryLabel = '[[category:subcategories]]';
	categoryData.description = translator.escape(categoryData.description);
	categoryData.privileges = userPrivileges;
	categoryData.showSelect = userPrivileges.editable;
	categoryData.showTopicTools = userPrivileges.editable;
	categoryData.topicIndex = topicIndex;
	categoryData.rssFeedUrl = `${url}/category/${categoryData.cid}.rss`;
	if (Number.parseInt(request.uid, 10)) {
		categories.markAsRead([cid], request.uid);
		categoryData.rssFeedUrl += `?uid=${request.uid}&token=${rssToken}`;
	}

	addTags(categoryData, res);

	categoryData['feeds:disableRSS'] = meta.config['feeds:disableRSS'] || 0;
	categoryData['reputation:disabled'] = meta.config['reputation:disabled'];
	categoryData.pagination = pagination.create(currentPage, pageCount, request.query);
	for (const rel of categoryData.pagination.rel) {
		rel.href = `${url}/category/${categoryData.slug}${rel.href}`;
		res.locals.linkTags.push(rel);
	}

	analytics.increment([`pageviews:byCid:${categoryData.cid}`]);

	res.render('category', categoryData);
};

async function buildBreadcrumbs(request, categoryData) {
	const breadcrumbs = [
		{
			text: categoryData.name,
			url: `${relative_path}/category/${categoryData.slug}`,
			cid: categoryData.cid,
		},
	];
	const crumbs = await helpers.buildCategoryBreadcrumbs(categoryData.parentCid);
	if (request.originalUrl.startsWith(`${relative_path}/api/category`) || request.originalUrl.startsWith(`${relative_path}/category`)) {
		categoryData.breadcrumbs = crumbs.concat(breadcrumbs);
	}
}

function addTags(categoryData, res) {
	res.locals.metaTags = [
		{
			name: 'title',
			content: categoryData.name,
			noEscape: true,
		},
		{
			property: 'og:title',
			content: categoryData.name,
			noEscape: true,
		},
		{
			name: 'description',
			content: categoryData.description,
			noEscape: true,
		},
		{
			property: 'og:type',
			content: 'website',
		},
	];

	if (categoryData.backgroundImage) {
		if (!categoryData.backgroundImage.startsWith('http')) {
			categoryData.backgroundImage = url + categoryData.backgroundImage;
		}

		res.locals.metaTags.push({
			property: 'og:image',
			content: categoryData.backgroundImage,
		});
	}

	res.locals.linkTags = [
		{
			rel: 'up',
			href: url,
		},
	];

	if (!categoryData['feeds:disableRSS']) {
		res.locals.linkTags.push({
			rel: 'alternate',
			type: 'application/rss+xml',
			href: categoryData.rssFeedUrl,
		});
	}
}
