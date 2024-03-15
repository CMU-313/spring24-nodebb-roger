'use strict';

const crypto = require('node:crypto');
const nconf = require('nconf');
const request = require('request');
const winston = require('winston');
const cronJob = require('cron').CronJob;
const pkg = require('../../package.json');
const meta = require('../meta');

module.exports = function (Plugins) {
	Plugins.startJobs = function () {
		new cronJob('0 0 0 * * *', (() => {
			Plugins.submitUsageData();
		}), null, true);
	};

	Plugins.submitUsageData = function (callback) {
		callback ||= function () {};
		if (!meta.config.submitPluginUsage || Plugins.loadedPlugins.length === 0 || global.env !== 'production') {
			return callback();
		}

		const hash = crypto.createHash('sha256');
		hash.update(nconf.get('url'));
		request.post(`${nconf.get('registry') || 'https://packages.nodebb.org'}/api/v1/plugin/usage`, {
			form: {
				id: hash.digest('hex'),
				version: pkg.version,
				plugins: Plugins.loadedPlugins,
			},
			timeout: 5000,
		}, (error, res, body) => {
			if (error) {
				winston.error(error.stack);
				return callback(error);
			}

			if (res.statusCode === 200) {
				callback();
			} else {
				winston.error(`[plugins.submitUsageData] received ${res.statusCode} ${body}`);
				callback(new Error(`[[error:nbbpm-${res.statusCode}]]`));
			}
		});
	};
};
