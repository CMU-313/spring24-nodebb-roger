'use strict';

const user = require('../user');
const posts = require('../posts');
const flags = require('../flags');
const analytics = require('../analytics');
const plugins = require('../plugins');
const pagination = require('../pagination');
const privileges = require('../privileges');
const utils = require('../utils');
const helpers = require('./helpers');

const modsController = module.exports;
modsController.flags = {};

modsController.flags.list = async function (request, res) {
	const validFilters = ['assignee', 'state', 'reporterId', 'type', 'targetUid', 'cid', 'quick', 'page', 'perPage'];
	const validSorts = ['newest', 'oldest', 'reports', 'upvotes', 'downvotes', 'replies'];

	const results = await Promise.all([
		user.isAdminOrGlobalMod(request.uid),
		user.getModeratedCids(request.uid),
		plugins.hooks.fire('filter:flags.validateFilters', {filters: validFilters}),
		plugins.hooks.fire('filter:flags.validateSort', {sorts: validSorts}),
	]);
	const [isAdminOrGlobalModule, moderatedCids,, {sorts}] = results;
	let {filters} = results[2];

	if (!(isAdminOrGlobalModule || moderatedCids.length > 0)) {
		return helpers.notAllowed(request, res);
	}

	if (!isAdminOrGlobalModule && moderatedCids.length > 0) {
		res.locals.cids = moderatedCids.map(String);
	}

	// Parse query string params for filters, eliminate non-valid filters
	filters = filters.reduce((memo, current) => {
		if (request.query.hasOwnProperty(current)) {
			if (typeof request.query[current] === 'string' && request.query[current].trim() !== '') {
				memo[current] = request.query[current].trim();
			} else if (Array.isArray(request.query[current]) && request.query[current].length > 0) {
				memo[current] = request.query[current];
			}
		}

		return memo;
	}, {});

	let hasFilter = Object.keys(filters).length > 0;

	if (res.locals.cids) {
		if (!filters.cid) {
			// If mod and no cid filter, add filter for their modded categories
			filters.cid = res.locals.cids;
		} else if (Array.isArray(filters.cid)) {
			// Remove cids they do not moderate
			filters.cid = filters.cid.filter(cid => res.locals.cids.includes(String(cid)));
		} else if (!res.locals.cids.includes(String(filters.cid))) {
			filters.cid = res.locals.cids;
			hasFilter = false;
		}
	}

	// Pagination doesn't count as a filter
	if (
		(Object.keys(filters).length === 1 && filters.hasOwnProperty('page'))
        || (Object.keys(filters).length === 2 && filters.hasOwnProperty('page') && filters.hasOwnProperty('perPage'))
	) {
		hasFilter = false;
	}

	// Parse sort from query string
	let sort;
	if (request.query.sort) {
		sort = sorts.includes(request.query.sort) ? request.query.sort : null;
	}

	if (sort === 'newest') {
		sort = undefined;
	}

	hasFilter ||= Boolean(sort);

	const [flagsData, analyticsData, selectData] = await Promise.all([
		flags.list({
			filters,
			sort,
			uid: request.uid,
			query: request.query,
		}),
		analytics.getDailyStatsForSet('analytics:flags', Date.now(), 30),
		helpers.getSelectedCategory(filters.cid),
	]);

	res.render('flags/list', {
		flags: flagsData.flags,
		analytics: analyticsData,
		selectedCategory: selectData.selectedCategory,
		hasFilter,
		filters,
		expanded: Boolean(filters.assignee || filters.reporterId || filters.targetUid),
		sort: sort || 'newest',
		title: '[[pages:flags]]',
		pagination: pagination.create(flagsData.page, flagsData.pageCount, request.query),
		breadcrumbs: helpers.buildBreadcrumbs([{text: '[[pages:flags]]'}]),
	});
};

modsController.flags.detail = async function (request, res, next) {
	const results = await utils.promiseParallel({
		isAdminOrGlobalMod: user.isAdminOrGlobalMod(request.uid),
		moderatedCids: user.getModeratedCids(request.uid),
		flagData: flags.get(request.params.flagId),
		assignees: user.getAdminsandGlobalModsandModerators(),
		privileges: Promise.all(['global', 'admin'].map(async type => privileges[type].get(request.uid))),
	});
	results.privileges = {...results.privileges[0], ...results.privileges[1]};

	if (!results.flagData || (!(results.isAdminOrGlobalMod || results.moderatedCids.length > 0))) {
		return next(); // 404
	}

	results.flagData.history = results.isAdminOrGlobalMod ? (await flags.getHistory(request.params.flagId)) : null;

	if (results.flagData.type === 'user') {
		results.flagData.type_path = 'uid';
	} else if (results.flagData.type === 'post') {
		results.flagData.type_path = 'post';
	}

	res.render('flags/detail', Object.assign(results.flagData, {
		assignees: results.assignees,
		type_bool: ['post', 'user', 'empty'].reduce((memo, current) => {
			if (current === 'empty') {
				memo[current] = Object.keys(results.flagData.target).length === 0;
			} else {
				memo[current] = results.flagData.type === current && (
					!results.flagData.target
                    || Object.keys(results.flagData.target).length > 0
				);
			}

			return memo;
		}, {}),
		states: Object.fromEntries(flags._states),
		title: `[[pages:flag-details, ${request.params.flagId}]]`,
		privileges: results.privileges,
		breadcrumbs: helpers.buildBreadcrumbs([
			{text: '[[pages:flags]]', url: '/flags'},
			{text: `[[pages:flag-details, ${request.params.flagId}]]`},
		]),
	}));
};

modsController.postQueue = async function (request, res, next) {
	if (!request.loggedIn) {
		return next();
	}

	const {id} = request.params;
	const {cid} = request.query;
	const page = Number.parseInt(request.query.page, 10) || 1;
	const postsPerPage = 20;

	let postData = await posts.getQueuedPosts({id});
	const [isAdmin, isGlobalModule, moderatedCids, categoriesData] = await Promise.all([
		user.isAdministrator(request.uid),
		user.isGlobalModerator(request.uid),
		user.getModeratedCids(request.uid),
		helpers.getSelectedCategory(cid),
	]);

	postData = postData.filter(p => p
        && (categoriesData.selectedCids.length === 0 || categoriesData.selectedCids.includes(p.category.cid))
        && (isAdmin || isGlobalModule || moderatedCids.includes(Number(p.category.cid)) || request.uid === p.user.uid));

	({posts: postData} = await plugins.hooks.fire('filter:post-queue.get', {
		posts: postData,
		req: request,
	}));

	const pageCount = Math.max(1, Math.ceil(postData.length / postsPerPage));
	const start = (page - 1) * postsPerPage;
	const stop = start + postsPerPage - 1;
	postData = postData.slice(start, stop + 1);
	const crumbs = [{text: '[[pages:post-queue]]', url: id ? '/post-queue' : undefined}];
	if (id && postData.length > 0) {
		const text = postData[0].data.tid ? '[[post-queue:reply]]' : '[[post-queue:topic]]';
		crumbs.push({text});
	}

	res.render('post-queue', {
		title: '[[pages:post-queue]]',
		posts: postData,
		isAdmin,
		canAccept: isAdmin || isGlobalModule || moderatedCids.length > 0,
		...categoriesData,
		allCategoriesUrl: `post-queue${helpers.buildQueryString(request.query, 'cid', '')}`,
		pagination: pagination.create(page, pageCount),
		breadcrumbs: helpers.buildBreadcrumbs(crumbs),
		singlePost: Boolean(id),
	});
};
