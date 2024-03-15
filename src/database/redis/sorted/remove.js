
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

		if (!isValueArray) {
			value = [value];
		}

		if (Array.isArray(key)) {
			const batch = module.client.batch();
			for (const k of key) {
				batch.zrem(k, value);
			}

			await helpers.execBatch(batch);
		} else {
			await module.client.zrem(key, value);
		}
	};

	module.sortedSetsRemove = async function (keys, value) {
		await module.sortedSetRemove(keys, value);
	};

	module.sortedSetsRemoveRangeByScore = async function (keys, min, max) {
		const batch = module.client.batch();
		for (const k of keys) {
			batch.zremrangebyscore(k, min, max);
		}

		await helpers.execBatch(batch);
	};

	module.sortedSetRemoveBulk = async function (data) {
		if (!Array.isArray(data) || data.length === 0) {
			return;
		}

		const batch = module.client.batch();
		for (const item of data) {
			batch.zrem(item[0], item[1]);
		}

		await helpers.execBatch(batch);
	};
};
