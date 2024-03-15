'use strict';

const cronJob = require('cron').CronJob;
const winston = require('winston');
const nconf = require('nconf');
const crypto = require('node:crypto');
const util = require('node:util');
const _ = require('lodash');

const sleep = util.promisify(setTimeout);

const db = require('./database');
const utils = require('./utils');
const plugins = require('./plugins');
const meta = require('./meta');
const pubsub = require('./pubsub');
const cacheCreate = require('./cache/lru');

const Analytics = module.exports;

const secret = nconf.get('secret');

let local = {
	counters: {},
	pageViews: 0,
	pageViewsRegistered: 0,
	pageViewsGuest: 0,
	pageViewsBot: 0,
	uniqueIPCount: 0,
	uniquevisitors: 0,
};
const empty = _.cloneDeep(local);
const total = _.cloneDeep(local);

let ipCache;

const runJobs = nconf.get('runJobs');

Analytics.init = async function () {
	ipCache = cacheCreate({
		max: Number.parseInt(meta.config['analytics:maxCache'], 10) || 500,
		ttl: 0,
	});

	new cronJob('*/10 * * * * *', (async () => {
		publishLocalAnalytics();
		if (runJobs) {
			await sleep(2000);
			await Analytics.writeData();
		}
	}), null, true);

	if (runJobs) {
		pubsub.on('analytics:publish', data => {
			incrementProperties(total, data.local);
		});
	}
};

function publishLocalAnalytics() {
	pubsub.publish('analytics:publish', {
		local,
	});
	local = _.cloneDeep(empty);
}

function incrementProperties(object1, object2) {
	for (const [key, value] of Object.entries(object2)) {
		if (typeof value === 'object') {
			incrementProperties(object1[key], value);
		} else if (utils.isNumber(value)) {
			object1[key] = object1[key] || 0;
			object1[key] += object2[key];
		}
	}
}

Analytics.increment = function (keys, callback) {
	keys = Array.isArray(keys) ? keys : [keys];

	plugins.hooks.fire('action:analytics.increment', {keys});

	for (const key of keys) {
		local.counters[key] = local.counters[key] || 0;
		local.counters[key] += 1;
	}

	if (typeof callback === 'function') {
		callback();
	}
};

Analytics.getKeys = async () => db.getSortedSetRange('analyticsKeys', 0, -1);

Analytics.pageView = async function (payload) {
	local.pageViews += 1;

	if (payload.uid > 0) {
		local.pageViewsRegistered += 1;
	} else if (payload.uid < 0) {
		local.pageViewsBot += 1;
	} else {
		local.pageViewsGuest += 1;
	}

	if (payload.ip) {
		// Retrieve hash or calculate if not present
		let hash = ipCache.get(payload.ip + secret);
		if (!hash) {
			hash = crypto.createHash('sha1').update(payload.ip + secret).digest('hex');
			ipCache.set(payload.ip + secret, hash);
		}

		const score = await db.sortedSetScore('ip:recent', hash);
		if (!score) {
			local.uniqueIPCount += 1;
		}

		const today = new Date();
		today.setHours(today.getHours(), 0, 0, 0);
		if (!score || score < today.getTime()) {
			local.uniquevisitors += 1;
			await db.sortedSetAdd('ip:recent', Date.now(), hash);
		}
	}
};

Analytics.writeData = async function () {
	const today = new Date();
	const month = new Date();
	const databaseQueue = [];
	const incrByBulk = [];

	// Build list of metrics that were updated
	let metrics = [
		'pageviews',
		'pageviews:month',
	];
	for (const metric of metrics) {
		const toAdd = ['registered', 'guest', 'bot'].map(type => `${metric}:${type}`);
		metrics = [...metrics, ...toAdd];
	}

	metrics.push('uniquevisitors');

	today.setHours(today.getHours(), 0, 0, 0);
	month.setMonth(month.getMonth(), 1);
	month.setHours(0, 0, 0, 0);

	if (total.pageViews > 0) {
		incrByBulk.push(['analytics:pageviews', total.pageViews, today.getTime()]);
		incrByBulk.push(['analytics:pageviews:month', total.pageViews, month.getTime()]);
		total.pageViews = 0;
	}

	if (total.pageViewsRegistered > 0) {
		incrByBulk.push(['analytics:pageviews:registered', total.pageViewsRegistered, today.getTime()]);
		incrByBulk.push(['analytics:pageviews:month:registered', total.pageViewsRegistered, month.getTime()]);
		total.pageViewsRegistered = 0;
	}

	if (total.pageViewsGuest > 0) {
		incrByBulk.push(['analytics:pageviews:guest', total.pageViewsGuest, today.getTime()]);
		incrByBulk.push(['analytics:pageviews:month:guest', total.pageViewsGuest, month.getTime()]);
		total.pageViewsGuest = 0;
	}

	if (total.pageViewsBot > 0) {
		incrByBulk.push(['analytics:pageviews:bot', total.pageViewsBot, today.getTime()]);
		incrByBulk.push(['analytics:pageviews:month:bot', total.pageViewsBot, month.getTime()]);
		total.pageViewsBot = 0;
	}

	if (total.uniquevisitors > 0) {
		incrByBulk.push(['analytics:uniquevisitors', total.uniquevisitors, today.getTime()]);
		total.uniquevisitors = 0;
	}

	if (total.uniqueIPCount > 0) {
		databaseQueue.push(db.incrObjectFieldBy('global', 'uniqueIPCount', total.uniqueIPCount));
		total.uniqueIPCount = 0;
	}

	for (const [key, value] of Object.entries(total.counters)) {
		incrByBulk.push([`analytics:${key}`, value, today.getTime()]);
		metrics.push(key);
		delete total.counters[key];
	}

	if (incrByBulk.length > 0) {
		databaseQueue.push(db.sortedSetIncrByBulk(incrByBulk));
	}

	// Update list of tracked metrics
	databaseQueue.push(db.sortedSetAdd('analyticsKeys', metrics.map(() => Number(Date.now())), metrics));

	try {
		await Promise.all(databaseQueue);
	} catch (error) {
		winston.error(`[analytics] Encountered error while writing analytics to data store\n${error.stack}`);
	}
};

Analytics.getHourlyStatsForSet = async function (set, hour, numberHours) {
	// Guard against accidental ommission of `analytics:` prefix
	if (!set.startsWith('analytics:')) {
		set = `analytics:${set}`;
	}

	const terms = {};
	const hoursArray = [];

	hour = new Date(hour);
	hour.setHours(hour.getHours(), 0, 0, 0);

	for (let i = 0, ii = numberHours; i < ii; i += 1) {
		hoursArray.push(hour.getTime() - (i * 3600 * 1000));
	}

	const counts = await db.sortedSetScores(set, hoursArray);

	for (const [index, term] of hoursArray.entries()) {
		terms[term] = Number.parseInt(counts[index], 10) || 0;
	}

	const termsArray = [];

	hoursArray.reverse();
	for (const hour of hoursArray) {
		termsArray.push(terms[hour]);
	}

	return termsArray;
};

Analytics.getDailyStatsForSet = async function (set, day, numberDays) {
	// Guard against accidental ommission of `analytics:` prefix
	if (!set.startsWith('analytics:')) {
		set = `analytics:${set}`;
	}

	const daysArray = [];
	day = new Date(day);
	// Set the date to tomorrow, because getHourlyStatsForSet steps *backwards* 24 hours to sum up the values
	day.setDate(day.getDate() + 1);
	day.setHours(0, 0, 0, 0);

	while (numberDays > 0) {
		/* eslint-disable no-await-in-loop */
		const dayData = await Analytics.getHourlyStatsForSet(
			set,
			day.getTime() - (1000 * 60 * 60 * 24 * (numberDays - 1)),
			24,
		);
		daysArray.push(dayData.reduce((current, next) => current + next));
		numberDays -= 1;
	}

	return daysArray;
};

Analytics.getUnwrittenPageviews = function () {
	return local.pageViews;
};

Analytics.getSummary = async function () {
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const [seven, thirty] = await Promise.all([
		Analytics.getDailyStatsForSet('analytics:pageviews', today, 7),
		Analytics.getDailyStatsForSet('analytics:pageviews', today, 30),
	]);

	return {
		seven: seven.reduce((sum, current) => sum + current, 0),
		thirty: thirty.reduce((sum, current) => sum + current, 0),
	};
};

Analytics.getCategoryAnalytics = async function (cid) {
	return await utils.promiseParallel({
		'pageviews:hourly': Analytics.getHourlyStatsForSet(`analytics:pageviews:byCid:${cid}`, Date.now(), 24),
		'pageviews:daily': Analytics.getDailyStatsForSet(`analytics:pageviews:byCid:${cid}`, Date.now(), 30),
		'topics:daily': Analytics.getDailyStatsForSet(`analytics:topics:byCid:${cid}`, Date.now(), 7),
		'posts:daily': Analytics.getDailyStatsForSet(`analytics:posts:byCid:${cid}`, Date.now(), 7),
	});
};

Analytics.getErrorAnalytics = async function () {
	return await utils.promiseParallel({
		'not-found': Analytics.getDailyStatsForSet('analytics:errors:404', Date.now(), 7),
		toobusy: Analytics.getDailyStatsForSet('analytics:errors:503', Date.now(), 7),
	});
};

Analytics.getBlacklistAnalytics = async function () {
	return await utils.promiseParallel({
		daily: Analytics.getDailyStatsForSet('analytics:blacklist', Date.now(), 7),
		hourly: Analytics.getHourlyStatsForSet('analytics:blacklist', Date.now(), 24),
	});
};

require('./promisify')(Analytics);
