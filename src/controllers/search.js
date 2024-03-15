
'use strict';

const validator = require('validator');
const db = require('../database');
const meta = require('../meta');
const plugins = require('../plugins');
const search = require('../search');
const categories = require('../categories');
const pagination = require('../pagination');
const privileges = require('../privileges');
const utils = require('../utils');
const helpers = require('./helpers');

const searchController = module.exports;

searchController.search = async function (request, res, next) {
	if (!plugins.hooks.hasListeners('filter:search.query')) {
		return next();
	}

	const page = Math.max(1, Number.parseInt(request.query.page, 10)) || 1;

	const searchOnly = Number.parseInt(request.query.searchOnly, 10) === 1;

	const userPrivileges = await utils.promiseParallel({
		'search:users': privileges.global.can('search:users', request.uid),
		'search:content': privileges.global.can('search:content', request.uid),
		'search:tags': privileges.global.can('search:tags', request.uid),
	});
	request.query.in = request.query.in || meta.config.searchDefaultIn || 'titlesposts';
	let allowed = (request.query.in === 'users' && userPrivileges['search:users'])
                    || (request.query.in === 'tags' && userPrivileges['search:tags'])
                    || (request.query.in === 'categories')
                    || (['titles', 'titlesposts', 'posts'].includes(request.query.in) && userPrivileges['search:content']);
	({allowed} = await plugins.hooks.fire('filter:search.isAllowed', {
		uid: request.uid,
		query: request.query,
		allowed,
	}));
	if (!allowed) {
		return helpers.notAllowed(request, res);
	}

	if (request.query.categories && !Array.isArray(request.query.categories)) {
		request.query.categories = [request.query.categories];
	}

	if (request.query.hasTags && !Array.isArray(request.query.hasTags)) {
		request.query.hasTags = [request.query.hasTags];
	}

	const data = {
		query: request.query.term,
		searchIn: request.query.in,
		matchWords: request.query.matchWords || 'all',
		postedBy: request.query.by,
		categories: request.query.categories,
		searchChildren: request.query.searchChildren,
		hasTags: request.query.hasTags,
		replies: request.query.replies,
		repliesFilter: request.query.repliesFilter,
		topicName: request.query.topicName,
		timeRange: request.query.timeRange,
		timeFilter: request.query.timeFilter,
		sortBy: request.query.sortBy || meta.config.searchDefaultSortBy || '',
		sortDirection: request.query.sortDirection,
		page,
		itemsPerPage: request.query.itemsPerPage,
		uid: request.uid,
		qs: request.query,
	};

	const [searchData, categoriesData] = await Promise.all([
		search.search(data),
		buildCategories(request.uid, searchOnly),
		recordSearch(data),
	]);

	searchData.pagination = pagination.create(page, searchData.pageCount, request.query);
	searchData.multiplePages = searchData.pageCount > 1;
	searchData.search_query = validator.escape(String(request.query.term || ''));
	searchData.term = request.query.term;

	if (searchOnly) {
		return res.json(searchData);
	}

	searchData.allCategories = categoriesData;
	searchData.allCategoriesCount = Math.max(10, Math.min(20, categoriesData.length));

	searchData.breadcrumbs = helpers.buildBreadcrumbs([{text: '[[global:search]]'}]);
	searchData.expandSearch = !request.query.term;

	searchData.showAsPosts = !request.query.showAs || request.query.showAs === 'posts';
	searchData.showAsTopics = request.query.showAs === 'topics';
	searchData.title = '[[global:header.search]]';

	searchData.searchDefaultSortBy = meta.config.searchDefaultSortBy || '';
	searchData.searchDefaultIn = meta.config.searchDefaultIn || 'titlesposts';
	searchData.privileges = userPrivileges;

	res.render('search', searchData);
};

const searches = {};

async function recordSearch(data) {
	const {query, searchIn} = data;
	if (query) {
		const cleanedQuery = String(query).trim().toLowerCase().slice(0, 255);
		if (['titles', 'titlesposts', 'posts'].includes(searchIn) && cleanedQuery.length > 2) {
			searches[data.uid] = searches[data.uid] || {timeoutId: 0, queries: []};
			searches[data.uid].queries.push(cleanedQuery);
			if (searches[data.uid].timeoutId) {
				clearTimeout(searches[data.uid].timeoutId);
			}

			searches[data.uid].timeoutId = setTimeout(async () => {
				if (searches[data.uid] && searches[data.uid].queries) {
					const copy = searches[data.uid].queries.slice();
					const filtered = searches[data.uid].queries.filter(
						q => !copy.find(query => query.startsWith(q) && query.length > q.length),
					);
					delete searches[data.uid];
					await Promise.all(filtered.map(query => db.sortedSetIncrBy('searches:all', 1, query)));
				}
			}, 5000);
		}
	}
}

async function buildCategories(uid, searchOnly) {
	if (searchOnly) {
		return [];
	}

	const cids = await categories.getCidsByPrivilege('categories:cid', uid, 'read');
	let categoriesData = await categories.getCategoriesData(cids);
	categoriesData = categoriesData.filter(category => category && !category.link);
	categoriesData = categories.getTree(categoriesData);
	categoriesData = categories.buildForSelectCategories(categoriesData, ['text', 'value']);

	return [
		{value: 'all', text: '[[unread:all_categories]]'},
		{value: 'watched', text: '[[category:watched-categories]]'},
	].concat(categoriesData);
}
