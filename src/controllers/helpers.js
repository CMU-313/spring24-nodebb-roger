'use strict';

const querystring = require('node:querystring');
const nconf = require('nconf');
const validator = require('validator');
const _ = require('lodash');
const chalk = require('chalk');
const translator = require('../translator');
const user = require('../user');
const privileges = require('../privileges');
const categories = require('../categories');
const plugins = require('../plugins');
const meta = require('../meta');
const middlewareHelpers = require('../middleware/helpers');
const utils = require('../utils');

const helpers = module.exports;

const relative_path = nconf.get('relative_path');
const url = nconf.get('url');

helpers.noScriptErrors = async function (request, res, error, httpStatus) {
	if (request.body.noscript !== 'true') {
		if (typeof error === 'string') {
			return res.status(httpStatus).send(error);
		}

		return res.status(httpStatus).json(error);
	}

	const middleware = require('../middleware');
	const httpStatusString = httpStatus.toString();
	await middleware.buildHeaderAsync(request, res);
	res.status(httpStatus).render(httpStatusString, {
		path: request.path,
		loggedIn: request.loggedIn,
		error,
		returnLink: true,
		title: `[[global:${httpStatusString}.title]]`,
	});
};

helpers.terms = {
	daily: 'day',
	weekly: 'week',
	monthly: 'month',
};

helpers.buildQueryString = function (query, key, value) {
	const queryObject = {...query};
	if (value) {
		queryObject[key] = value;
	} else {
		delete queryObject[key];
	}

	delete queryObject._;
	return Object.keys(queryObject).length > 0 ? `?${querystring.stringify(queryObject)}` : '';
};

helpers.addLinkTags = function (parameters) {
	parameters.res.locals.linkTags = parameters.res.locals.linkTags || [];
	parameters.res.locals.linkTags.push({
		rel: 'canonical',
		href: `${url}/${parameters.url}`,
	});

	for (const rel of parameters.tags) {
		rel.href = `${url}/${parameters.url}${rel.href}`;
		parameters.res.locals.linkTags.push(rel);
	}
};

helpers.buildFilters = function (url, filter, query) {
	return [{
		name: '[[unread:all-topics]]',
		url: url + helpers.buildQueryString(query, 'filter', ''),
		selected: filter === '',
		filter: '',
		icon: 'fa-book',
	}, {
		name: '[[unread:new-topics]]',
		url: url + helpers.buildQueryString(query, 'filter', 'new'),
		selected: filter === 'new',
		filter: 'new',
		icon: 'fa-clock-o',
	}, {
		name: '[[unread:watched-topics]]',
		url: url + helpers.buildQueryString(query, 'filter', 'watched'),
		selected: filter === 'watched',
		filter: 'watched',
		icon: 'fa-bell-o',
	}, {
		name: '[[unread:unreplied-topics]]',
		url: url + helpers.buildQueryString(query, 'filter', 'unreplied'),
		selected: filter === 'unreplied',
		filter: 'unreplied',
		icon: 'fa-reply',
	}];
};

helpers.buildTerms = function (url, term, query) {
	return [{
		name: '[[recent:alltime]]',
		url: url + helpers.buildQueryString(query, 'term', ''),
		selected: term === 'alltime',
		term: 'alltime',
	}, {
		name: '[[recent:day]]',
		url: url + helpers.buildQueryString(query, 'term', 'daily'),
		selected: term === 'day',
		term: 'day',
	}, {
		name: '[[recent:week]]',
		url: url + helpers.buildQueryString(query, 'term', 'weekly'),
		selected: term === 'week',
		term: 'week',
	}, {
		name: '[[recent:month]]',
		url: url + helpers.buildQueryString(query, 'term', 'monthly'),
		selected: term === 'month',
		term: 'month',
	}];
};

helpers.notAllowed = async function (request, res, error) {
	({error} = await plugins.hooks.fire('filter:helpers.notAllowed', {req: request, res, error}));

	await plugins.hooks.fire('response:helpers.notAllowed', {req: request, res, error});
	if (res.headersSent) {
		return;
	}

	if (request.loggedIn || request.uid === -1) {
		if (res.locals.isAPI) {
			if (request.originalUrl.startsWith(`${relative_path}/api/v3`)) {
				helpers.formatApiResponse(403, res, error);
			} else {
				res.status(403).json({
					path: request.path.replace(/^\/api/, ''),
					loggedIn: request.loggedIn,
					error,
					title: '[[global:403.title]]',
					bodyClass: middlewareHelpers.buildBodyClass(request, res),
				});
			}
		} else {
			const middleware = require('../middleware');
			await middleware.buildHeaderAsync(request, res);
			res.status(403).render('403', {
				path: request.path,
				loggedIn: request.loggedIn,
				error,
				title: '[[global:403.title]]',
			});
		}
	} else if (res.locals.isAPI) {
		request.session.returnTo = request.url.replace(/^\/api/, '');
		helpers.formatApiResponse(401, res, error);
	} else {
		request.session.returnTo = request.url;
		res.redirect(`${relative_path}/login${request.path.startsWith('/admin') ? '?local=1' : ''}`);
	}
};

helpers.redirect = function (res, url, permanent) {
	// This is used by sso plugins to redirect to the auth route
	// { external: '/auth/sso' } or { external: 'https://domain/auth/sso' }
	if (url.hasOwnProperty('external')) {
		const redirectUrl = encodeURI(prependRelativePath(url.external));
		if (res.locals.isAPI) {
			res.set('X-Redirect', redirectUrl).status(200).json({external: redirectUrl});
		} else {
			res.redirect(permanent ? 308 : 307, redirectUrl);
		}

		return;
	}

	if (res.locals.isAPI) {
		url = encodeURI(url);
		res.set('X-Redirect', url).status(200).json(url);
	} else {
		res.redirect(permanent ? 308 : 307, encodeURI(prependRelativePath(url)));
	}
};

function prependRelativePath(url) {
	return url.startsWith('http://') || url.startsWith('https://')
		? url : relative_path + url;
}

helpers.buildCategoryBreadcrumbs = async function (cid) {
	const breadcrumbs = [];

	while (Number.parseInt(cid, 10)) {
		/* eslint-disable no-await-in-loop */
		const data = await categories.getCategoryFields(cid, ['name', 'slug', 'parentCid', 'disabled', 'isSection']);
		if (!data.disabled && !data.isSection) {
			breadcrumbs.unshift({
				text: String(data.name),
				url: `${relative_path}/category/${data.slug}`,
				cid,
			});
		}

		cid = data.parentCid;
	}

	if (meta.config.homePageRoute && meta.config.homePageRoute !== 'categories') {
		breadcrumbs.unshift({
			text: '[[global:header.categories]]',
			url: `${relative_path}/categories`,
		});
	}

	breadcrumbs.unshift({
		text: '[[global:home]]',
		url: `${relative_path}/`,
	});

	return breadcrumbs;
};

helpers.buildBreadcrumbs = function (crumbs) {
	const breadcrumbs = [
		{
			text: '[[global:home]]',
			url: `${relative_path}/`,
		},
	];

	for (const crumb of crumbs) {
		if (crumb) {
			crumb.url &&= `${utils.isRelativeUrl(crumb.url) ? relative_path : ''}${crumb.url}`;

			breadcrumbs.push(crumb);
		}
	}

	return breadcrumbs;
};

helpers.buildTitle = function (pageTitle) {
	const titleLayout = meta.config.titleLayout || '{pageTitle} | {browserTitle}';

	const browserTitle = validator.escape(String(meta.config.browserTitle || meta.config.title || 'NodeBB'));
	pageTitle ||= '';
	const title = titleLayout.replace('{pageTitle}', () => pageTitle).replace('{browserTitle}', () => browserTitle);
	return title;
};

helpers.getCategories = async function (set, uid, privilege, selectedCid) {
	const cids = await categories.getCidsByPrivilege(set, uid, privilege);
	return await getCategoryData(cids, uid, selectedCid, Object.values(categories.watchStates), privilege);
};

helpers.getCategoriesByStates = async function (uid, selectedCid, states, privilege = 'topics:read') {
	const cids = await categories.getAllCidsFromSet('categories:cid');
	return await getCategoryData(cids, uid, selectedCid, states, privilege);
};

async function getCategoryData(cids, uid, selectedCid, states, privilege) {
	const [visibleCategories, selectData] = await Promise.all([
		helpers.getVisibleCategories({
			cids, uid, states, privilege, showLinks: false,
		}),
		helpers.getSelectedCategory(selectedCid),
	]);

	const categoriesData = categories.buildForSelectCategories(visibleCategories, ['disabledClass']);

	for (const category of categoriesData) {
		category.selected = selectData.selectedCids.includes(category.cid);
	}

	selectData.selectedCids.sort((a, b) => a - b);
	return {
		categories: categoriesData,
		selectedCategory: selectData.selectedCategory,
		selectedCids: selectData.selectedCids,
	};
}

helpers.getVisibleCategories = async function (parameters) {
	const {cids, uid, privilege} = parameters;
	const states = parameters.states || [categories.watchStates.watching, categories.watchStates.notwatching];
	const showLinks = Boolean(parameters.showLinks);

	let [allowed, watchState, categoriesData, isAdmin, isModerator] = await Promise.all([
		privileges.categories.isUserAllowedTo(privilege, cids, uid),
		categories.getWatchState(cids, uid),
		categories.getCategoriesData(cids),
		user.isAdministrator(uid),
		user.isModerator(uid, cids),
	]);

	const filtered = await plugins.hooks.fire('filter:helpers.getVisibleCategories', {
		uid,
		allowed,
		watchState,
		categoriesData,
		isModerator,
		isAdmin,
	});
	({allowed, watchState, categoriesData, isModerator, isAdmin} = filtered);

	categories.getTree(categoriesData, parameters.parentCid);

	const cidToAllowed = _.zipObject(cids, allowed.map((allowed, i) => isAdmin || isModerator[i] || allowed));
	const cidToCategory = _.zipObject(cids, categoriesData);
	const cidToWatchState = _.zipObject(cids, watchState);

	return categoriesData.filter(c => {
		if (!c) {
			return false;
		}

		const hasVisibleChildren = checkVisibleChildren(c, cidToAllowed, cidToWatchState, states);
		const isCategoryVisible = (
			cidToAllowed[c.cid]
            && (showLinks || !c.link)
            && !c.disabled
            && states.includes(cidToWatchState[c.cid])
		);
		const shouldBeRemoved = !hasVisibleChildren && !isCategoryVisible;
		const shouldBeDisaplayedAsDisabled = hasVisibleChildren && !isCategoryVisible;

		if (shouldBeDisaplayedAsDisabled) {
			c.disabledClass = true;
		}

		if (shouldBeRemoved && c.parent && c.parent.cid && cidToCategory[c.parent.cid]) {
			cidToCategory[c.parent.cid].children
                = cidToCategory[c.parent.cid].children.filter(child => child.cid !== c.cid);
		}

		return !shouldBeRemoved;
	});
};

helpers.getSelectedCategory = async function (cids) {
	if (cids && !Array.isArray(cids)) {
		cids = [cids];
	}

	cids &&= cids.map(cid => Number.parseInt(cid, 10));
	let selectedCategories = await categories.getCategoriesData(cids);
	const selectedCids = selectedCategories.map(c => c && c.cid).filter(Boolean);
	if (selectedCategories.length > 1) {
		selectedCategories = {
			icon: 'fa-plus',
			name: '[[unread:multiple-categories-selected]]',
			bgColor: '#ddd',
		};
	} else if (selectedCategories.length === 1 && selectedCategories[0]) {
		selectedCategories = selectedCategories[0];
	} else {
		selectedCategories = null;
	}

	return {
		selectedCids,
		selectedCategory: selectedCategories,
	};
};

helpers.trimChildren = function (category) {
	if (category && Array.isArray(category.children)) {
		category.children = category.children.slice(0, category.subCategoriesPerPage);
		for (const child of category.children) {
			if (category.isSection) {
				helpers.trimChildren(child);
			} else {
				child.children = undefined;
			}
		}
	}
};

helpers.setCategoryTeaser = function (category) {
	if (Array.isArray(category.posts) && category.posts.length > 0 && category.posts[0]) {
		category.teaser = {
			url: `${nconf.get('relative_path')}/post/${category.posts[0].pid}`,
			timestampISO: category.posts[0].timestampISO,
			pid: category.posts[0].pid,
			topic: category.posts[0].topic,
		};
	}
};

function checkVisibleChildren(c, cidToAllowed, cidToWatchState, states) {
	if (!c || !Array.isArray(c.children)) {
		return false;
	}

	return c.children.some(c => !c.disabled && (
		(cidToAllowed[c.cid] && states.includes(cidToWatchState[c.cid]))
        || checkVisibleChildren(c, cidToAllowed, cidToWatchState, states)
	));
}

helpers.getHomePageRoutes = async function (uid) {
	const routes = [
		{
			route: 'categories',
			name: 'Categories',
		},
		{
			route: 'unread',
			name: 'Unread',
		},
		{
			route: 'recent',
			name: 'Recent',
		},
		{
			route: 'top',
			name: 'Top',
		},
		{
			route: 'popular',
			name: 'Popular',
		},
		{
			route: 'custom',
			name: 'Custom',
		},
	];
	const data = await plugins.hooks.fire('filter:homepage.get', {
		uid,
		routes,
	});
	return data.routes;
};

helpers.formatApiResponse = async (statusCode, res, payload) => {
	if (res.req.method === 'HEAD') {
		return res.sendStatus(statusCode);
	}

	if (String(statusCode).startsWith('2')) {
		if (res.req.loggedIn) {
			res.set('cache-control', 'private');
		}

		let code = 'ok';
		let message = 'OK';
		switch (statusCode) {
			case 202: {
				code = 'accepted';
				message = 'Accepted';
				break;
			}

			case 204: {
				code = 'no-content';
				message = 'No Content';
				break;
			}
		}

		res.status(statusCode).json({
			status: {code, message},
			response: payload || {},
		});
	} else if (payload instanceof Error) {
		const {message} = payload;
		const response = {};

		// Update status code based on some common error codes
		switch (message) {
			case '[[error:user-banned]]': {
				Object.assign(response, await generateBannedResponse(res));
			}
			// Intentional fall through

			case '[[error:no-privileges]]': {
				statusCode = 403;
				break;
			}

			case '[[error:invalid-uid]]': {
				statusCode = 401;
				break;
			}
		}

		if (message.startsWith('[[error:required-parameters-missing, ')) {
			const parameters = message.slice('[[error:required-parameters-missing, '.length, -2).split(' ');
			Object.assign(response, {params: parameters});
		}

		const returnPayload = await helpers.generateError(statusCode, message, res);
		returnPayload.response = response;

		if (global.env === 'development') {
			returnPayload.stack = payload.stack;
			process.stdout.write(`[${chalk.yellow('api')}] Exception caught, error with stack trace follows:\n`);
			process.stdout.write(payload.stack);
		}

		res.status(statusCode).json(returnPayload);
	} else if (!payload) {
		// Non-2xx statusCode, generate predefined error
		const returnPayload = await helpers.generateError(statusCode, null, res);
		res.status(statusCode).json(returnPayload);
	}
};

async function generateBannedResponse(res) {
	const response = {};
	const [reason, expiry] = await Promise.all([
		user.bans.getReason(res.req.uid),
		user.getUserField(res.req.uid, 'banned:expire'),
	]);

	response.reason = reason;
	if (expiry) {
		Object.assign(response, {
			expiry,
			expiryISO: new Date(expiry).toISOString(),
			expiryLocaleString: new Date(expiry).toLocaleString(),
		});
	}

	return response;
}

helpers.generateError = async (statusCode, message, res) => {
	async function translateMessage(message) {
		const {req} = res;
		const settings = req.query.lang ? null : await user.getSettings(req.uid);
		const language = String(req.query.lang || settings.userLang || meta.config.defaultLang);
		return await translator.translate(message, language);
	}

	if (message && message.startsWith('[[')) {
		message = await translateMessage(message);
	}

	const payload = {
		status: {
			code: 'internal-server-error',
			message: message || await translateMessage(`[[error:api.${statusCode}]]`),
		},
		response: {},
	};

	switch (statusCode) {
		case 400: {
			payload.status.code = 'bad-request';
			break;
		}

		case 401: {
			payload.status.code = 'not-authorised';
			break;
		}

		case 403: {
			payload.status.code = 'forbidden';
			break;
		}

		case 404: {
			payload.status.code = 'not-found';
			break;
		}

		case 426: {
			payload.status.code = 'upgrade-required';
			break;
		}

		case 429: {
			payload.status.code = 'too-many-requests';
			break;
		}

		case 500: {
			payload.status.code = 'internal-server-error';
			break;
		}

		case 501: {
			payload.status.code = 'not-implemented';
			break;
		}

		case 503: {
			payload.status.code = 'service-unavailable';
			break;
		}
	}

	return payload;
};

require('../promisify')(helpers);
