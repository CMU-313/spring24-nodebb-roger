'use strict';

module.exports = function (module) {
	const helpers = require('../helpers');
	const utils = require('../../../utils');

	module.sortedSetAdd = async function (key, score, value) {
		if (!key) {
			return;
		}

		if (Array.isArray(score) && Array.isArray(value)) {
			return await sortedSetAddBulk(key, score, value);
		}

		if (!utils.isNumber(score)) {
			throw new TypeError(`[[error:invalid-score, ${score}]]`);
		}

		value = helpers.valueToString(value);

		try {
			await module.client.collection('objects').updateOne({_key: key, value}, {$set: {score: Number.parseFloat(score)}}, {upsert: true});
		} catch (error) {
			if (error && error.message.startsWith('E11000 duplicate key error')) {
				return await module.sortedSetAdd(key, score, value);
			}

			throw error;
		}
	};

	async function sortedSetAddBulk(key, scores, values) {
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

		values = values.map(helpers.valueToString);

		const bulk = module.client.collection('objects').initializeUnorderedBulkOp();
		for (const [i, score] of scores.entries()) {
			bulk.find({_key: key, value: values[i]}).upsert().updateOne({$set: {score: Number.parseFloat(score)}});
		}

		await bulk.execute();
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

		value = helpers.valueToString(value);

		const bulk = module.client.collection('objects').initializeUnorderedBulkOp();
		for (const [i, key] of keys.entries()) {
			bulk
				.find({_key: key, value})
				.upsert()
				.updateOne({$set: {score: Number.parseFloat(isArrayOfScores ? scores[i] : scores)}});
		}

		await bulk.execute();
	};

	module.sortedSetAddBulk = async function (data) {
		if (!Array.isArray(data) || data.length === 0) {
			return;
		}

		const bulk = module.client.collection('objects').initializeUnorderedBulkOp();
		for (const item of data) {
			if (!utils.isNumber(item[1])) {
				throw new TypeError(`[[error:invalid-score, ${item[1]}]]`);
			}

			bulk.find({_key: item[0], value: String(item[2])})
				.upsert()
				.updateOne({$set: {score: Number.parseFloat(item[1])}});
		}

		await bulk.execute();
	};
};
