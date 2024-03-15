'use strict';

const util = require('node:util');
const nconf = require('nconf');
const winston = require('winston');
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const user = require('../../user');
const languages = require('../../languages');
const meta = require('../../meta');
const plugins = require('../../plugins');
const notifications = require('../../notifications');
const db = require('../../database');
const helpers = require('../helpers');
const accountHelpers = require('./helpers');

const settingsController = module.exports;

settingsController.get = async function (request, res, next) {
	const userData = await accountHelpers.getUserDataByUserSlug(request.params.userslug, request.uid, request.query);
	if (!userData) {
		return next();
	}

	const [settings, languagesData] = await Promise.all([
		user.getSettings(userData.uid),
		languages.list(),
	]);

	userData.settings = settings;
	userData.languages = languagesData;
	if (userData.isAdmin && userData.isSelf) {
		userData.acpLanguages = _.cloneDeep(languagesData);
	}

	const data = await plugins.hooks.fire('filter:user.customSettings', {
		settings,
		customSettings: [],
		uid: request.uid,
	});

	const [notificationSettings, routes] = await Promise.all([
		getNotificationSettings(userData),
		getHomePageRoutes(userData),
	]);

	userData.customSettings = data.customSettings;
	userData.homePageRoutes = routes;
	userData.notificationSettings = notificationSettings;
	userData.disableEmailSubscriptions = meta.config.disableEmailSubscriptions;

	userData.dailyDigestFreqOptions = [
		{value: 'off', name: '[[user:digest_off]]', selected: userData.settings.dailyDigestFreq === 'off'},
		{value: 'day', name: '[[user:digest_daily]]', selected: userData.settings.dailyDigestFreq === 'day'},
		{value: 'week', name: '[[user:digest_weekly]]', selected: userData.settings.dailyDigestFreq === 'week'},
		{value: 'biweek', name: '[[user:digest_biweekly]]', selected: userData.settings.dailyDigestFreq === 'biweek'},
		{value: 'month', name: '[[user:digest_monthly]]', selected: userData.settings.dailyDigestFreq === 'month'},
	];

	userData.bootswatchSkinOptions = [
		{name: 'Default', value: ''},
		{name: 'Cerulean', value: 'cerulean'},
		{name: 'Cosmo', value: 'cosmo'},
		{name: 'Cyborg', value: 'cyborg'},
		{name: 'Darkly', value: 'darkly'},
		{name: 'Flatly', value: 'flatly'},
		{name: 'Journal', value: 'journal'},
		{name: 'Lumen', value: 'lumen'},
		{name: 'Paper', value: 'paper'},
		{name: 'Readable', value: 'readable'},
		{name: 'Sandstone', value: 'sandstone'},
		{name: 'Simplex', value: 'simplex'},
		{name: 'Slate', value: 'slate'},
		{name: 'Spacelab', value: 'spacelab'},
		{name: 'Superhero', value: 'superhero'},
		{name: 'United', value: 'united'},
		{name: 'Yeti', value: 'yeti'},
	];

	for (const skin of userData.bootswatchSkinOptions) {
		skin.selected = skin.value === userData.settings.bootswatchSkin;
	}

	for (const language of userData.languages) {
		language.selected = language.code === userData.settings.userLang;
	}

	if (userData.isAdmin && userData.isSelf) {
		for (const language of userData.acpLanguages) {
			language.selected = language.code === userData.settings.acpLang;
		}
	}

	const notificationFreqOptions = [
		'all',
		'first',
		'everyTen',
		'threshold',
		'logarithmic',
		'disabled',
	];

	userData.upvoteNotifFreq = notificationFreqOptions.map(
		name => ({name, selected: name === userData.settings.upvoteNotifFreq}),
	);

	userData.categoryWatchState = {[userData.settings.categoryWatchState]: true};

	userData.disableCustomUserSkins = meta.config.disableCustomUserSkins || 0;

	userData.allowUserHomePage = meta.config.allowUserHomePage === 1 ? 1 : 0;

	userData.hideFullname = meta.config.hideFullname || 0;
	userData.hideEmail = meta.config.hideEmail || 0;

	userData.inTopicSearchAvailable = plugins.hooks.hasListeners('filter:topic.search');

	userData.maxTopicsPerPage = meta.config.maxTopicsPerPage;
	userData.maxPostsPerPage = meta.config.maxPostsPerPage;

	userData.title = '[[pages:account/settings]]';
	userData.breadcrumbs = helpers.buildBreadcrumbs([{text: userData.username, url: `/user/${userData.userslug}`}, {text: '[[user:settings]]'}]);

	res.render('account/settings', userData);
};

const unsubscribable = new Set(['digest', 'notification']);
const jwtVerifyAsync = util.promisify((token, callback) => {
	jwt.verify(token, nconf.get('secret'), (error, payload) => callback(error, payload));
});
const doUnsubscribe = async payload => {
	if (payload.template === 'digest') {
		await Promise.all([
			user.setSetting(payload.uid, 'dailyDigestFreq', 'off'),
			user.updateDigestSetting(payload.uid, 'off'),
		]);
	} else if (payload.template === 'notification') {
		const current = await db.getObjectField(`user:${payload.uid}:settings`, `notificationType_${payload.type}`);
		await user.setSetting(payload.uid, `notificationType_${payload.type}`, (current === 'notificationemail' ? 'notification' : 'none'));
	}

	return true;
};

settingsController.unsubscribe = async (request, res) => {
	try {
		const payload = await jwtVerifyAsync(request.params.token);
		if (!payload || !unsubscribable.has(payload.template)) {
			return;
		}

		await doUnsubscribe(payload);
		res.render('unsubscribe', {
			payload,
		});
	} catch (error) {
		res.render('unsubscribe', {
			error: error.message,
		});
	}
};

settingsController.unsubscribePost = async function (request, res) {
	let payload;
	try {
		payload = await jwtVerifyAsync(request.params.token);
		if (!payload || !unsubscribable.has(payload.template)) {
			return res.sendStatus(404);
		}
	} catch {
		return res.sendStatus(403);
	}

	try {
		await doUnsubscribe(payload);
		res.sendStatus(200);
	} catch (error) {
		winston.error(`[settings/unsubscribe] One-click unsubscribe failed with error: ${error.message}`);
		res.sendStatus(500);
	}
};

async function getNotificationSettings(userData) {
	const privilegedTypes = [];

	const privileges = await user.getPrivileges(userData.uid);
	if (privileges.isAdmin) {
		privilegedTypes.push('notificationType_new-register');
	}

	if (privileges.isAdmin || privileges.isGlobalMod || privileges.isModeratorOfAnyCategory) {
		privilegedTypes.push('notificationType_post-queue', 'notificationType_new-post-flag');
	}

	if (privileges.isAdmin || privileges.isGlobalMod) {
		privilegedTypes.push('notificationType_new-user-flag');
	}

	const results = await plugins.hooks.fire('filter:user.notificationTypes', {
		types: notifications.baseTypes.slice(),
		privilegedTypes,
	});

	function modifyType(type) {
		const setting = userData.settings[type];
		return {
			name: type,
			label: `[[notifications:${type}]]`,
			none: setting === 'none',
			notification: setting === 'notification',
			email: setting === 'email',
			notificationemail: setting === 'notificationemail',
		};
	}

	if (meta.config.disableChat) {
		results.types = results.types.filter(type => type !== 'notificationType_new-chat');
	}

	return results.types.map(modifyType).concat(results.privilegedTypes.map(modifyType));
}

async function getHomePageRoutes(userData) {
	let routes = await helpers.getHomePageRoutes(userData.uid);

	// Set selected for each route
	let customIndex;
	let hasSelected = false;
	routes = routes.map((route, index) => {
		if (route.route === userData.settings.homePageRoute) {
			route.selected = true;
			hasSelected = true;
		} else {
			route.selected = false;
		}

		if (route.route === 'custom') {
			customIndex = index;
		}

		return route;
	});

	if (!hasSelected && customIndex && userData.settings.homePageRoute !== 'none') {
		routes[customIndex].selected = true;
	}

	return routes;
}
