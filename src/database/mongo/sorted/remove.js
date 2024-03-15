'use strict';

module.exports = function (module) {
	const helpers = require('../helpers');

	module.sortedSetRemove = async function (key, value) {
		if (!key) {
			return;
		}

		const isValueArray = Array.isArray(value);
		if (!value || (isValueArray && value.length === 0)) {
			return;
		}

		value = isValueArray ? value.map(helpers.valueToString) : helpers.valueToString(value);

		await module.client.collection('objects').deleteMany({
			_key: Array.isArray(key) ? {$in: key} : key,
			value: isValueArray ? {$in: value} : value,
		});
	};

	module.sortedSetsRemove = async function (keys, value) {
		if (!Array.isArray(keys) || keys.length === 0) {
			return;
		}

		value = helpers.valueToString(value);

		await module.client.collection('objects').deleteMany({_key: {$in: keys}, value});
	};

	module.sortedSetsRemoveRangeByScore = async function (keys, min, max) {
		if (!Array.isArray(keys) || keys.length === 0) {
			return;
		}

		const query = {_key: {$in: keys}};
		if (keys.length === 1) {
			query._key = keys[0];
		}

		if (min !== '-inf') {
			query.score = {$gte: Number.parseFloat(min)};
		}

		if (max !== '+inf') {
			query.score = query.score || {};
			query.score.$lte = Number.parseFloat(max);
		}

		await module.client.collection('objects').deleteMany(query);
	};

	module.sortedSetRemoveBulk = async function (data) {
		if (!Array.isArray(data) || data.length === 0) {
			return;
		}

		const bulk = module.client.collection('objects').initializeUnorderedBulkOp();
		for (const item of data) {
			bulk.find({_key: item[0], value: String(item[1])}).delete();
		}

		await bulk.execute();
	};
};
