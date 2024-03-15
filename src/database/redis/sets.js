'use strict';

module.exports = function (module) {
	const helpers = require('./helpers');

	module.setAdd = async function (key, value) {
		if (!Array.isArray(value)) {
			value = [value];
		}

		if (value.length === 0) {
			return;
		}

		await module.client.sadd(key, value);
	};

	module.setsAdd = async function (keys, value) {
		if (!Array.isArray(keys) || keys.length === 0) {
			return;
		}

		const batch = module.client.batch();
		for (const k of keys) {
			batch.sadd(String(k), String(value));
		}

		await helpers.execBatch(batch);
	};

	module.setRemove = async function (key, value) {
		if (!Array.isArray(value)) {
			value = [value];
		}

		if (!Array.isArray(key)) {
			key = [key];
		}

		if (value.length === 0) {
			return;
		}

		const batch = module.client.batch();
		for (const k of key) {
			batch.srem(String(k), value);
		}

		await helpers.execBatch(batch);
	};

	module.setsRemove = async function (keys, value) {
		const batch = module.client.batch();
		for (const k of keys) {
			batch.srem(String(k), value);
		}

		await helpers.execBatch(batch);
	};

	module.isSetMember = async function (key, value) {
		const result = await module.client.sismember(key, value);
		return result === 1;
	};

	module.isSetMembers = async function (key, values) {
		const batch = module.client.batch();
		for (const v of values) {
			batch.sismember(String(key), String(v));
		}

		const results = await helpers.execBatch(batch);
		return results ? helpers.resultsToBool(results) : null;
	};

	module.isMemberOfSets = async function (sets, value) {
		const batch = module.client.batch();
		for (const s of sets) {
			batch.sismember(String(s), String(value));
		}

		const results = await helpers.execBatch(batch);
		return results ? helpers.resultsToBool(results) : null;
	};

	module.getSetMembers = async function (key) {
		return await module.client.smembers(key);
	};

	module.getSetsMembers = async function (keys) {
		const batch = module.client.batch();
		for (const k of keys) {
			batch.smembers(String(k));
		}

		return await helpers.execBatch(batch);
	};

	module.setCount = async function (key) {
		return await module.client.scard(key);
	};

	module.setsCount = async function (keys) {
		const batch = module.client.batch();
		for (const k of keys) {
			batch.scard(String(k));
		}

		return await helpers.execBatch(batch);
	};

	module.setRemoveRandom = async function (key) {
		return await module.client.spop(key);
	};

	return module;
};
