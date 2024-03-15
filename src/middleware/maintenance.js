'use strict';

const util = require('node:util');
const nconf = require('nconf');
const meta = require('../meta');
const user = require('../user');
const groups = require('../groups');
const helpers = require('./helpers');

module.exports = function (middleware) {
	middleware.maintenanceMode = helpers.try(async (request, res, next) => {
		if (!meta.config.maintenanceMode) {
			return next();
		}

		const hooksAsync = util.promisify(middleware.pluginHooks);
		await hooksAsync(request, res);

		const url = request.url.replace(nconf.get('relative_path'), '');
		if (url.startsWith('/login') || url.startsWith('/api/login')) {
			return next();
		}

		const [isAdmin, isMemberOfExempt] = await Promise.all([
			user.isAdministrator(request.uid),
			groups.isMemberOfAny(request.uid, meta.config.groupsExemptFromMaintenanceMode),
		]);

		if (isAdmin || isMemberOfExempt) {
			return next();
		}

		res.status(meta.config.maintenanceModeStatus);

		const data = {
			site_title: meta.config.title || 'NodeBB',
			message: meta.config.maintenanceModeMessage,
		};

		if (res.locals.isAPI) {
			return res.json(data);
		}

		await middleware.buildHeaderAsync(request, res);
		res.render('503', data);
	});
};
