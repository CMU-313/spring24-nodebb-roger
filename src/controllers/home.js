'use strict';

const url = require('node:url');
const plugins = require('../plugins');
const meta = require('../meta');
const user = require('../user');

function adminHomePageRoute() {
	return ((meta.config.homePageRoute === 'custom' ? meta.config.homePageCustom : meta.config.homePageRoute) || 'categories').replace(/^\//, '');
}

async function getUserHomeRoute(uid) {
	const settings = await user.getSettings(uid);
	let route = adminHomePageRoute();

	if (settings.homePageRoute !== 'undefined' && settings.homePageRoute !== 'none') {
		route = (settings.homePageRoute || route).replace(/^\/+/, '');
	}

	return route;
}

async function rewrite(request, res, next) {
	if (request.path !== '/' && request.path !== '/api/' && request.path !== '/api') {
		return next();
	}

	let route = adminHomePageRoute();
	if (meta.config.allowUserHomePage) {
		route = await getUserHomeRoute(request.uid, next);
	}

	let parsedUrl;
	try {
		parsedUrl = url.parse(route, true);
	} catch (error) {
		return next(error);
	}

	const {pathname} = parsedUrl;
	const hook = `action:homepage.get:${pathname}`;
	if (plugins.hooks.hasListeners(hook)) {
		res.locals.homePageRoute = pathname;
	} else {
		request.url = request.path + (request.path.endsWith('/') ? '' : '/') + pathname;
	}

	request.query = Object.assign(parsedUrl.query, request.query);

	next();
}

exports.rewrite = rewrite;

function pluginHook(request, res, next) {
	const hook = `action:homepage.get:${res.locals.homePageRoute}`;

	plugins.hooks.fire(hook, {
		req: request,
		res,
		next,
	});
}

exports.pluginHook = pluginHook;
