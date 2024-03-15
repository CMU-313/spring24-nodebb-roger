'use strict';

const winston = require('winston');
const validator = require('validator');
const cronJob = require('cron').CronJob;
const db = require('../database');
const analytics = require('../analytics');

const Errors = module.exports;

let counters = {};

new cronJob('0 * * * * *', (() => {
	Errors.writeData();
}), null, true);

Errors.writeData = async function () {
	try {
		const _counters = {...counters};
		counters = {};
		const keys = Object.keys(_counters);
		if (keys.length === 0) {
			return;
		}

		for (const key of keys) {
			/* eslint-disable no-await-in-loop */
			await db.sortedSetIncrBy('errors:404', _counters[key], key);
		}
	} catch (error) {
		winston.error(error.stack);
	}
};

Errors.log404 = function (route) {
	if (!route) {
		return;
	}

	route = route.slice(0, 512).replace(/\/$/, ''); // Remove trailing slashes
	analytics.increment('errors:404');
	counters[route] = counters[route] || 0;
	counters[route] += 1;
};

Errors.get = async function (escape) {
	const data = await db.getSortedSetRevRangeWithScores('errors:404', 0, 199);
	for (const nfObject of data) {
		nfObject.value = escape ? validator.escape(String(nfObject.value || '')) : nfObject.value;
	}

	return data;
};

Errors.clear = async function () {
	await db.delete('errors:404');
};
