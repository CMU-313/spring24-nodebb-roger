'use strict';

const user = require('../user');
const meta = require('../meta');
const analytics = require('../analytics');
const usersController = require('./admin/users');
const helpers = require('./helpers');

const globalModsController = module.exports;

globalModsController.ipBlacklist = async function (request, res, next) {
	const isAdminOrGlobalModule = await user.isAdminOrGlobalMod(request.uid);
	if (!isAdminOrGlobalModule) {
		return next();
	}

	const [rules, analyticsData] = await Promise.all([
		meta.blacklist.get(),
		analytics.getBlacklistAnalytics(),
	]);
	res.render('ip-blacklist', {
		title: '[[pages:ip-blacklist]]',
		rules,
		analytics: analyticsData,
		breadcrumbs: helpers.buildBreadcrumbs([{text: '[[pages:ip-blacklist]]'}]),
	});
};

globalModsController.registrationQueue = async function (request, res, next) {
	const isAdminOrGlobalModule = await user.isAdminOrGlobalMod(request.uid);
	if (!isAdminOrGlobalModule) {
		return next();
	}

	await usersController.registrationQueue(request, res);
};
