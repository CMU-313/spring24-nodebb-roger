'use strict';

module.exports = function (module) {
	const utils = require('../../utils');
	const helpers = require('./helpers');
	const dbHelpers = require('../helpers');

	require('./sorted/add')(module);
	require('./sorted/remove')(module);
	require('./sorted/union')(module);
	require('./sorted/intersect')(module);

	module.getSortedSetRange = async function (key, start, stop) {
		return await sortedSetRange('zrange', key, start, stop, '-inf', '+inf', false);
	};

	module.getSortedSetRevRange = async function (key, start, stop) {
		return await sortedSetRange('zrevrange', key, start, stop, '-inf', '+inf', false);
	};

	module.getSortedSetRangeWithScores = async function (key, start, stop) {
		return await sortedSetRange('zrange', key, start, stop, '-inf', '+inf', true);
	};

	module.getSortedSetRevRangeWithScores = async function (key, start, stop) {
		return await sortedSetRange('zrevrange', key, start, stop, '-inf', '+inf', true);
	};

	async function sortedSetRange(method, key, start, stop, min, max, withScores) {
		if (Array.isArray(key)) {
			if (key.length === 0) {
				return [];
			}

			const batch = module.client.batch();
			key.forEach(key => batch[method](genParams(method, key, 0, stop, min, max, true)));
			const data = await helpers.execBatch(batch);

			const batchData = data.map(setData => helpers.zsetToObjectArray(setData));

			let objects = dbHelpers.mergeBatch(batchData, 0, stop, method === 'zrange' ? 1 : -1);

			if (start > 0) {
				objects = objects.slice(start, stop === -1 ? undefined : stop + 1);
			}

			if (!withScores) {
				objects = objects.map(item => item.value);
			}

			return objects;
		}

		const parameters = genParams(method, key, start, stop, min, max, withScores);
		const data = await module.client[method](parameters);
		if (!withScores) {
			return data;
		}

		const objects = helpers.zsetToObjectArray(data);
		return objects;
	}

	function genParams(method, key, start, stop, min, max, withScores) {
		const parameters = {
			zrevrange: [key, start, stop],
			zrange: [key, start, stop],
			zrangebyscore: [key, min, max],
			zrevrangebyscore: [key, max, min],
		};
		if (withScores) {
			parameters[method].push('WITHSCORES');
		}

		if (method === 'zrangebyscore' || method === 'zrevrangebyscore') {
			const count = stop === -1 ? stop : stop - start + 1;
			parameters[method].push('LIMIT', start, count);
		}

		return parameters[method];
	}

	module.getSortedSetRangeByScore = async function (key, start, count, min, max) {
		return await sortedSetRangeByScore('zrangebyscore', key, start, count, min, max, false);
	};

	module.getSortedSetRevRangeByScore = async function (key, start, count, max, min) {
		return await sortedSetRangeByScore('zrevrangebyscore', key, start, count, min, max, false);
	};

	module.getSortedSetRangeByScoreWithScores = async function (key, start, count, min, max) {
		return await sortedSetRangeByScore('zrangebyscore', key, start, count, min, max, true);
	};

	module.getSortedSetRevRangeByScoreWithScores = async function (key, start, count, max, min) {
		return await sortedSetRangeByScore('zrevrangebyscore', key, start, count, min, max, true);
	};

	async function sortedSetRangeByScore(method, key, start, count, min, max, withScores) {
		if (Number.parseInt(count, 10) === 0) {
			return [];
		}

		const stop = (Number.parseInt(count, 10) === -1) ? -1 : (start + count - 1);
		return await sortedSetRange(method, key, start, stop, min, max, withScores);
	}

	module.sortedSetCount = async function (key, min, max) {
		return await module.client.zcount(key, min, max);
	};

	module.sortedSetCard = async function (key) {
		return await module.client.zcard(key);
	};

	module.sortedSetsCard = async function (keys) {
		if (!Array.isArray(keys) || keys.length === 0) {
			return [];
		}

		const batch = module.client.batch();
		for (const k of keys) {
			batch.zcard(String(k));
		}

		return await helpers.execBatch(batch);
	};

	module.sortedSetsCardSum = async function (keys) {
		if (!keys || (Array.isArray(keys) && keys.length === 0)) {
			return 0;
		}

		if (!Array.isArray(keys)) {
			keys = [keys];
		}

		const counts = await module.sortedSetsCard(keys);
		const sum = counts.reduce((accumulator, value) => accumulator + value, 0);
		return sum;
	};

	module.sortedSetRank = async function (key, value) {
		return await module.client.zrank(key, value);
	};

	module.sortedSetRevRank = async function (key, value) {
		return await module.client.zrevrank(key, value);
	};

	module.sortedSetsRanks = async function (keys, values) {
		const batch = module.client.batch();
		for (const [i, value] of values.entries()) {
			batch.zrank(keys[i], String(value));
		}

		return await helpers.execBatch(batch);
	};

	module.sortedSetsRevRanks = async function (keys, values) {
		const batch = module.client.batch();
		for (const [i, value] of values.entries()) {
			batch.zrevrank(keys[i], String(value));
		}

		return await helpers.execBatch(batch);
	};

	module.sortedSetRanks = async function (key, values) {
		const batch = module.client.batch();
		for (const value of values) {
			batch.zrank(key, String(value));
		}

		return await helpers.execBatch(batch);
	};

	module.sortedSetRevRanks = async function (key, values) {
		const batch = module.client.batch();
		for (const value of values) {
			batch.zrevrank(key, String(value));
		}

		return await helpers.execBatch(batch);
	};

	module.sortedSetScore = async function (key, value) {
		if (!key || value === undefined) {
			return null;
		}

		const score = await module.client.zscore(key, value);
		return score === null ? score : Number.parseFloat(score);
	};

	module.sortedSetsScore = async function (keys, value) {
		if (!Array.isArray(keys) || keys.length === 0) {
			return [];
		}

		const batch = module.client.batch();
		for (const key of keys) {
			batch.zscore(String(key), String(value));
		}

		const scores = await helpers.execBatch(batch);
		return scores.map(d => (d === null ? d : Number.parseFloat(d)));
	};

	module.sortedSetScores = async function (key, values) {
		if (values.length === 0) {
			return [];
		}

		const batch = module.client.batch();
		for (const value of values) {
			batch.zscore(String(key), String(value));
		}

		const scores = await helpers.execBatch(batch);
		return scores.map(d => (d === null ? d : Number.parseFloat(d)));
	};

	module.isSortedSetMember = async function (key, value) {
		const score = await module.sortedSetScore(key, value);
		return utils.isNumber(score);
	};

	module.isSortedSetMembers = async function (key, values) {
		if (values.length === 0) {
			return [];
		}

		const batch = module.client.batch();
		for (const v of values) {
			batch.zscore(key, String(v));
		}

		const results = await helpers.execBatch(batch);
		return results.map(utils.isNumber);
	};

	module.isMemberOfSortedSets = async function (keys, value) {
		if (!Array.isArray(keys) || keys.length === 0) {
			return [];
		}

		const batch = module.client.batch();
		for (const k of keys) {
			batch.zscore(k, String(value));
		}

		const results = await helpers.execBatch(batch);
		return results.map(utils.isNumber);
	};

	module.getSortedSetMembers = async function (key) {
		return await module.client.zrange(key, 0, -1);
	};

	module.getSortedSetsMembers = async function (keys) {
		if (!Array.isArray(keys) || keys.length === 0) {
			return [];
		}

		const batch = module.client.batch();
		for (const k of keys) {
			batch.zrange(k, 0, -1);
		}

		return await helpers.execBatch(batch);
	};

	module.sortedSetIncrBy = async function (key, increment, value) {
		const newValue = await module.client.zincrby(key, increment, value);
		return Number.parseFloat(newValue);
	};

	module.sortedSetIncrByBulk = async function (data) {
		const multi = module.client.multi();
		for (const item of data) {
			multi.zincrby(item[0], item[1], item[2]);
		}

		const result = await multi.exec();
		return result.map(item => item && Number.parseFloat(item[1]));
	};

	module.getSortedSetRangeByLex = async function (key, min, max, start, count) {
		return await sortedSetLex('zrangebylex', false, key, min, max, start, count);
	};

	module.getSortedSetRevRangeByLex = async function (key, max, min, start, count) {
		return await sortedSetLex('zrevrangebylex', true, key, max, min, start, count);
	};

	module.sortedSetRemoveRangeByLex = async function (key, min, max) {
		await sortedSetLex('zremrangebylex', false, key, min, max);
	};

	module.sortedSetLexCount = async function (key, min, max) {
		return await sortedSetLex('zlexcount', false, key, min, max);
	};

	async function sortedSetLex(method, reverse, key, min, max, start, count) {
		let minmin;
		let maxmax;
		if (reverse) {
			minmin = '+';
			maxmax = '-';
		} else {
			minmin = '-';
			maxmax = '+';
		}

		if (min !== minmin && !/^[[(]/.test(min)) {
			min = `[${min}`;
		}

		if (max !== maxmax && !/^[[(]/.test(max)) {
			max = `[${max}`;
		}

		const arguments_ = [key, min, max];
		if (count) {
			arguments_.push('LIMIT', start, count);
		}

		return await module.client[method](arguments_);
	}

	module.getSortedSetScan = async function (parameters) {
		let cursor = '0';

		const returnData = [];
		let done = false;
		const seen = {};
		do {
			/* eslint-disable no-await-in-loop */
			const res = await module.client.zscan(parameters.key, cursor, 'MATCH', parameters.match, 'COUNT', 5000);
			cursor = res[0];
			done = cursor === '0';
			const data = res[1];

			for (let i = 0; i < data.length; i += 2) {
				const value = data[i];
				if (!seen[value]) {
					seen[value] = 1;

					if (parameters.withScores) {
						returnData.push({value, score: Number.parseFloat(data[i + 1])});
					} else {
						returnData.push(value);
					}

					if (parameters.limit && returnData.length >= parameters.limit) {
						done = true;
						break;
					}
				}
			}
		} while (!done);

		return returnData;
	};
};
