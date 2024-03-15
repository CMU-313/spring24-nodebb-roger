'use strict';

const _ = require('lodash');
const db = require('../database');
const plugins = require('../plugins');
const pubsub = require('../pubsub');
const cache = require('../cache');
const Meta = require('./index');

const Settings = module.exports;

Settings.get = async function (hash) {
	const cached = cache.get(`settings:${hash}`);
	if (cached) {
		return _.cloneDeep(cached);
	}

	const [data, sortedLists] = await Promise.all([
		db.getObject(`settings:${hash}`),
		db.getSetMembers(`settings:${hash}:sorted-lists`),
	]);
	const values = data || {};
	await Promise.all(sortedLists.map(async list => {
		const members = await db.getSortedSetRange(`settings:${hash}:sorted-list:${list}`, 0, -1);
		const keys = members.map(order => `settings:${hash}:sorted-list:${list}:${order}`);

		values[list] = [];

		const objects = await db.getObjects(keys);
		for (const object of objects) {
			values[list].push(object);
		}
	}));

	const result = await plugins.hooks.fire('filter:settings.get', {plugin: hash, values});
	cache.set(`settings:${hash}`, result.values);
	return _.cloneDeep(result.values);
};

Settings.getOne = async function (hash, field) {
	const data = await Settings.get(hash);
	return data[field] === undefined ? null : data[field];
};

Settings.set = async function (hash, values, quiet) {
	quiet ||= false;

	({plugin: hash, settings: values, quiet} = await plugins.hooks.fire('filter:settings.set', {plugin: hash, settings: values, quiet}));

	const sortedListData = {};
	for (const [key, value] of Object.entries(values)) {
		if (Array.isArray(value) && typeof value[0] !== 'string') {
			sortedListData[key] = value;
			delete values[key];
		}
	}

	const sortedLists = Object.keys(sortedListData);

	if (sortedLists.length > 0) {
		// Remove provided (but empty) sorted lists from the hash set
		await db.setRemove(`settings:${hash}:sorted-lists`, sortedLists.filter(list => sortedListData[list].length === 0));
		await db.setAdd(`settings:${hash}:sorted-lists`, sortedLists);

		await Promise.all(sortedLists.map(async list => {
			const numberItems = await db.sortedSetCard(`settings:${hash}:sorted-list:${list}`);
			const deleteKeys = [`settings:${hash}:sorted-list:${list}`];
			for (let x = 0; x < numberItems; x++) {
				deleteKeys.push(`settings:${hash}:sorted-list:${list}:${x}`);
			}

			await db.deleteAll(deleteKeys);
		}));

		const sortedSetData = [];
		const objectData = [];
		for (const list of sortedLists) {
			const array = sortedListData[list];
			for (const [order, data] of array.entries()) {
				sortedSetData.push([`settings:${hash}:sorted-list:${list}`, order, order]);
				objectData.push([`settings:${hash}:sorted-list:${list}:${order}`, data]);
			}
		}

		await Promise.all([
			db.sortedSetAddBulk(sortedSetData),
			db.setObjectBulk(objectData),
		]);
	}

	if (Object.keys(values).length > 0) {
		await db.setObject(`settings:${hash}`, values);
	}

	cache.del(`settings:${hash}`);

	plugins.hooks.fire('action:settings.set', {
		plugin: hash,
		settings: {...values, ...sortedListData}, // Add back sorted list data to values hash
		quiet,
	});

	pubsub.publish(`action:settings.set.${hash}`, values);
	if (!Meta.reloadRequired && !quiet) {
		Meta.reloadRequired = true;
	}
};

Settings.setOne = async function (hash, field, value) {
	const data = {};
	data[field] = value;
	await Settings.set(hash, data);
};

Settings.setOnEmpty = async function (hash, values) {
	const settings = await Settings.get(hash) || {};
	const empty = {};

	for (const key of Object.keys(values)) {
		if (!settings.hasOwnProperty(key)) {
			empty[key] = values[key];
		}
	}

	if (Object.keys(empty).length > 0) {
		await Settings.set(hash, empty);
	}
};
