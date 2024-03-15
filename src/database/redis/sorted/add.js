'use strict';

module.exports = function (module) {
	const helpers = require('../helpers');
	const utils = require('../../../utils');

	module.sortedSetAdd = async function (key, score, value) {
		if (!key) {
			return;
		}

		if (Array.isArray(score) && Array.isArray(value)) {
			return await sortedSetAddMulti(key, score, value);
		}

		if (!utils.isNumber(score)) {
			throw new TypeError(`[[error:invalid-score, ${score}]]`);
		}

		await module.client.zadd(key, score, String(value));
	};

	async function sortedSetAddMulti(key, scores, values) {
		if (scores.length === 0 || values.length === 0) {
			return;
		}

		if (scores.length !== values.length) {
			throw new Error('[[error:invalid-data]]');
		}

		for (const score of scores) {
			if (!utils.isNumber(score)) {
				throw new TypeError(`[[error:invalid-score, ${score}]]`);
			}
		}

		const arguments_ = [key];
		for (const [i, score] of scores.entries()) {
			arguments_.push(score, String(values[i]));
		}

		await module.client.zadd(arguments_);
	}

	module.sortedSetsAdd = async function (keys, scores, value) {
		if (!Array.isArray(keys) || keys.length === 0) {
			return;
		}

		const isArrayOfScores = Array.isArray(scores);
		if ((!isArrayOfScores && !utils.isNumber(scores))
            || (isArrayOfScores && scores.map(s => utils.isNumber(s)).includes(false))) {
			throw new Error(`[[error:invalid-score, ${scores}]]`);
		}

		if (isArrayOfScores && scores.length !== keys.length) {
			throw new Error('[[error:invalid-data]]');
		}

		const batch = module.client.batch();
		for (const [i, key] of keys.entries()) {
			if (key) {
				batch.zadd(key, isArrayOfScores ? scores[i] : scores, String(value));
			}
		}

		await helpers.execBatch(batch);
	};

	module.sortedSetAddBulk = async function (data) {
		if (!Array.isArray(data) || data.length === 0) {
			return;
		}

		const batch = module.client.batch();
		for (const item of data) {
			if (!utils.isNumber(item[1])) {
				throw new TypeError(`[[error:invalid-score, ${item[1]}]]`);
			}

			batch.zadd(item[0], item[1], item[2]);
		}

		await helpers.execBatch(batch);
	};
};
