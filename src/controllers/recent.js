
'use strict';

const nconf = require('nconf');
const user = require('../user');
const categories = require('../categories');
const topics = require('../topics');
const meta = require('../meta');
const pagination = require('../pagination');
const privileges = require('../privileges');
const helpers = require('./helpers');

const recentController = module.exports;
const relative_path = nconf.get('relative_path');

recentController.get = async function (request, res, next) {
	const data = await recentController.getData(request, 'recent', 'recent');
	if (!data) {
		return next();
	}

	res.render('recent', data);
};

recentController.getData = async function (request, url, sort) {
	const page = Number.parseInt(request.query.page, 10) || 1;
	let term = helpers.terms[request.query.term];
	const {cid, tags} = request.query;
	const filter = request.query.filter || '';

	if (!term && request.query.term) {
		return null;
	}

	term ||= 'alltime';

	const [settings, categoryData, rssToken, canPost, isPrivileged] = await Promise.all([
		user.getSettings(request.uid),
		helpers.getSelectedCategory(cid),
		user.auth.getFeedToken(request.uid),
		canPostTopic(request.uid),
		user.isPrivileged(request.uid),
	]);

	const start = Math.max(0, (page - 1) * settings.topicsPerPage);
	const stop = start + settings.topicsPerPage - 1;

	const data = await topics.getSortedTopics({
		cids: cid,
		tags,
		uid: request.uid,
		start,
		stop,
		filter,
		term,
		sort,
		floatPinned: request.query.pinned,
		query: request.query,
	});

	const isDisplayedAsHome = !(request.originalUrl.startsWith(`${relative_path}/api/${url}`) || request.originalUrl.startsWith(`${relative_path}/${url}`));
	const baseUrl = isDisplayedAsHome ? '' : url;

	if (isDisplayedAsHome) {
		data.title = meta.config.homePageTitle || '[[pages:home]]';
	} else {
		data.title = `[[pages:${url}]]`;
		data.breadcrumbs = helpers.buildBreadcrumbs([{text: `[[${url}:title]]`}]);
	}

	data.canPost = canPost;
	data.showSelect = isPrivileged;
	data.showTopicTools = isPrivileged;
	data.allCategoriesUrl = baseUrl + helpers.buildQueryString(request.query, 'cid', '');
	data.selectedCategory = categoryData.selectedCategory;
	data.selectedCids = categoryData.selectedCids;
	data['feeds:disableRSS'] = meta.config['feeds:disableRSS'] || 0;
	data.rssFeedUrl = `${relative_path}/${url}.rss`;
	if (request.loggedIn) {
		data.rssFeedUrl += `?uid=${request.uid}&token=${rssToken}`;
	}

	data.filters = helpers.buildFilters(baseUrl, filter, request.query);
	data.selectedFilter = data.filters.find(filter => filter && filter.selected);
	data.terms = helpers.buildTerms(baseUrl, term, request.query);
	data.selectedTerm = data.terms.find(term => term && term.selected);

	const pageCount = Math.max(1, Math.ceil(data.topicCount / settings.topicsPerPage));
	data.pagination = pagination.create(page, pageCount, request.query);
	helpers.addLinkTags({url, res: request.res, tags: data.pagination.rel});
	return data;
};

async function canPostTopic(uid) {
	let cids = await categories.getAllCidsFromSet('categories:cid');
	cids = await privileges.categories.filterCids('topics:create', cids, uid);
	return cids.length > 0;
}

require('../promisify')(recentController, ['get']);
