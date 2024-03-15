'use strict';

const meta = require('../../meta');
const privileges = require('../../privileges');
const analytics = require('../../analytics');
const helpers = require('../helpers');

const Admin = module.exports;

Admin.updateSetting = async (request, res) => {
	const ok = await privileges.admin.can('admin:settings', request.uid);

	if (!ok) {
		return helpers.formatApiResponse(403, res);
	}

	await meta.configs.set(request.params.setting, request.body.value);
	helpers.formatApiResponse(200, res);
};

Admin.getAnalyticsKeys = async (request, res) => {
	let keys = await analytics.getKeys();

	// Sort keys alphabetically
	keys = keys.sort((a, b) => (a < b ? -1 : 1));

	helpers.formatApiResponse(200, res, {keys});
};

Admin.getAnalyticsData = async (request, res) => {
	// Default returns views from past 24 hours, by hour
	if (!request.query.amount) {
		request.query.amount = request.query.units === 'days' ? 30 : 24;
	}

	const getStats = request.query.units === 'days' ? analytics.getDailyStatsForSet : analytics.getHourlyStatsForSet;
	helpers.formatApiResponse(200, res, await getStats(`analytics:${request.params.set}`, Number.parseInt(request.query.until, 10) || Date.now(), request.query.amount));
};
