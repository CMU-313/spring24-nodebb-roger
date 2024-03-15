'use strict';

const validator = require('validator');
const nconf = require('nconf');
const meta = require('../meta');
const user = require('../user');
const categories = require('../categories');
const topics = require('../topics');
const privileges = require('../privileges');
const pagination = require('../pagination');
const utils = require('../utils');
const helpers = require('./helpers');

const tagsController = module.exports;

tagsController.getTag = async function (request, res) {
	const tag = validator.escape(utils.cleanUpTag(request.params.tag, meta.config.maximumTagLength));
	const page = Number.parseInt(request.query.page, 10) || 1;
	const cid = Array.isArray(request.query.cid) || !request.query.cid ? request.query.cid : [request.query.cid];

	const templateData = {
		topics: [],
		tag,
		breadcrumbs: helpers.buildBreadcrumbs([{text: '[[tags:tags]]', url: '/tags'}, {text: tag}]),
		title: `[[pages:tag, ${tag}]]`,
	};
	const [settings, cids, categoryData, isPrivileged] = await Promise.all([
		user.getSettings(request.uid),
		cid || categories.getCidsByPrivilege('categories:cid', request.uid, 'topics:read'),
		helpers.getSelectedCategory(cid),
		user.isPrivileged(request.uid),
	]);
	const start = Math.max(0, (page - 1) * settings.topicsPerPage);
	const stop = start + settings.topicsPerPage - 1;

	const [topicCount, tids] = await Promise.all([
		topics.getTagTopicCount(tag, cids),
		topics.getTagTidsByCids(tag, cids, start, stop),
	]);

	templateData.topics = await topics.getTopics(tids, request.uid);
	templateData.showSelect = isPrivileged;
	templateData.showTopicTools = isPrivileged;
	templateData.allCategoriesUrl = `tags/${tag}${helpers.buildQueryString(request.query, 'cid', '')}`;
	templateData.selectedCategory = categoryData.selectedCategory;
	templateData.selectedCids = categoryData.selectedCids;
	topics.calculateTopicIndices(templateData.topics, start);
	res.locals.metaTags = [
		{
			name: 'title',
			content: tag,
		},
		{
			property: 'og:title',
			content: tag,
		},
	];

	const pageCount = Math.max(1, Math.ceil(topicCount / settings.topicsPerPage));
	templateData.pagination = pagination.create(page, pageCount, request.query);
	helpers.addLinkTags({url: `tags/${tag}`, res: request.res, tags: templateData.pagination.rel});

	templateData['feeds:disableRSS'] = meta.config['feeds:disableRSS'];
	templateData.rssFeedUrl = `${nconf.get('relative_path')}/tags/${tag}.rss`;
	res.render('tag', templateData);
};

tagsController.getTags = async function (request, res) {
	const cids = await categories.getCidsByPrivilege('categories:cid', request.uid, 'topics:read');
	const [canSearch, tags] = await Promise.all([
		privileges.global.can('search:tags', request.uid),
		topics.getCategoryTagsData(cids, 0, 99),
	]);

	res.render('tags', {
		tags: tags.filter(Boolean),
		displayTagSearch: canSearch,
		nextStart: 100,
		breadcrumbs: helpers.buildBreadcrumbs([{text: '[[tags:tags]]'}]),
		title: '[[pages:tags]]',
	});
};
