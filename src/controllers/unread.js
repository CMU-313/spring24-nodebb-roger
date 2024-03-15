
'use strict';

const querystring = require('node:querystring');
const nconf = require('nconf');
const meta = require('../meta');
const pagination = require('../pagination');
const user = require('../user');
const topics = require('../topics');
const helpers = require('./helpers');

const unreadController = module.exports;
const relative_path = nconf.get('relative_path');

unreadController.get = async function (request, res) {
	const {cid} = request.query;
	const filter = request.query.filter || '';

	const [categoryData, userSettings, isPrivileged] = await Promise.all([
		helpers.getSelectedCategory(cid),
		user.getSettings(request.uid),
		user.isPrivileged(request.uid),
	]);

	const page = Number.parseInt(request.query.page, 10) || 1;
	const start = Math.max(0, (page - 1) * userSettings.topicsPerPage);
	const stop = start + userSettings.topicsPerPage - 1;
	const data = await topics.getUnreadTopics({
		cid,
		uid: request.uid,
		start,
		stop,
		filter,
		query: request.query,
	});

	const isDisplayedAsHome = !(request.originalUrl.startsWith(`${relative_path}/api/unread`) || request.originalUrl.startsWith(`${relative_path}/unread`));
	const baseUrl = isDisplayedAsHome ? '' : 'unread';

	if (isDisplayedAsHome) {
		data.title = meta.config.homePageTitle || '[[pages:home]]';
	} else {
		data.title = '[[pages:unread]]';
		data.breadcrumbs = helpers.buildBreadcrumbs([{text: '[[unread:title]]'}]);
	}

	data.pageCount = Math.max(1, Math.ceil(data.topicCount / userSettings.topicsPerPage));
	data.pagination = pagination.create(page, data.pageCount, request.query);
	helpers.addLinkTags({url: 'unread', res: request.res, tags: data.pagination.rel});

	if (userSettings.usePagination && (page < 1 || page > data.pageCount)) {
		request.query.page = Math.max(1, Math.min(data.pageCount, page));
		return helpers.redirect(res, `/unread?${querystring.stringify(request.query)}`);
	}

	data.showSelect = true;
	data.showTopicTools = isPrivileged;
	data.allCategoriesUrl = `${baseUrl}${helpers.buildQueryString(request.query, 'cid', '')}`;
	data.selectedCategory = categoryData.selectedCategory;
	data.selectedCids = categoryData.selectedCids;
	data.selectCategoryLabel = '[[unread:mark_as_read]]';
	data.selectCategoryIcon = 'fa-inbox';
	data.showCategorySelectLabel = true;
	data.filters = helpers.buildFilters(baseUrl, filter, request.query);
	data.selectedFilter = data.filters.find(filter => filter && filter.selected);

	res.render('unread', data);
};

unreadController.unreadTotal = async function (request, res, next) {
	const filter = request.query.filter || '';
	try {
		const unreadCount = await topics.getTotalUnread(request.uid, filter);
		res.json(unreadCount);
	} catch (error) {
		next(error);
	}
};
