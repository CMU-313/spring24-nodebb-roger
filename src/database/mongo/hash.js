'use strict';

module.exports = function (module) {
	const helpers = require('./helpers');

	const cache = require('../cache').create('mongo');

	module.objectCache = cache;

	module.setObject = async function (key, data) {
		const isArray = Array.isArray(key);
		if (!key || !data || (isArray && key.length === 0)) {
			return;
		}

		const writeData = helpers.serializeData(data);
		if (Object.keys(writeData).length === 0) {
			return;
		}

		try {
			if (isArray) {
				const bulk = module.client.collection('objects').initializeUnorderedBulkOp();
				key.forEach(key => bulk.find({_key: key}).upsert().updateOne({$set: writeData}));
				await bulk.execute();
			} else {
				await module.client.collection('objects').updateOne({_key: key}, {$set: writeData}, {upsert: true});
			}
		} catch (error) {
			if (error && error.message.startsWith('E11000 duplicate key error')) {
				return await module.setObject(key, data);
			}

			throw error;
		}

		cache.del(key);
	};

	module.setObjectBulk = async function (...arguments_) {
		let data = arguments_[0];
		if (!Array.isArray(data) || data.length === 0) {
			return;
		}

		if (Array.isArray(arguments_[1])) {
			console.warn('[deprecated] db.setObjectBulk(keys, data) usage is deprecated, please use db.setObjectBulk(data)');
			// Conver old format to new format for backwards compatibility
			data = arguments_[0].map((key, i) => [key, arguments_[1][i]]);
		}

		try {
			let bulk;
			for (const item of data) {
				const writeData = helpers.serializeData(item[1]);
				if (Object.keys(writeData).length > 0) {
					bulk ||= module.client.collection('objects').initializeUnorderedBulkOp();

					bulk.find({_key: item[0]}).upsert().updateOne({$set: writeData});
				}
			}

			if (bulk) {
				await bulk.execute();
			}
		} catch (error) {
			if (error && error.message.startsWith('E11000 duplicate key error')) {
				return await module.setObjectBulk(data);
			}

			throw error;
		}

		cache.del(data.map(item => item[0]));
	};

	module.setObjectField = async function (key, field, value) {
		if (!field) {
			return;
		}

		const data = {};
		data[field] = value;
		await module.setObject(key, data);
	};

	module.getObject = async function (key, fields = []) {
		if (!key) {
			return null;
		}

		const data = await module.getObjects([key], fields);
		return data && data.length > 0 ? data[0] : null;
	};

	module.getObjects = async function (keys, fields = []) {
		return await module.getObjectsFields(keys, fields);
	};

	module.getObjectField = async function (key, field) {
		if (!key) {
			return null;
		}

		const cachedData = {};
		cache.getUnCachedKeys([key], cachedData);
		if (cachedData[key]) {
			return cachedData[key].hasOwnProperty(field) ? cachedData[key][field] : null;
		}

		field = helpers.fieldToString(field);
		const item = await module.client.collection('objects').findOne({_key: key}, {projection: {_id: 0, [field]: 1}});
		if (!item) {
			return null;
		}

		return item.hasOwnProperty(field) ? item[field] : null;
	};

	module.getObjectFields = async function (key, fields) {
		if (!key) {
			return null;
		}

		const data = await module.getObjectsFields([key], fields);
		return data ? data[0] : null;
	};

	module.getObjectsFields = async function (keys, fields) {
		if (!Array.isArray(keys) || keys.length === 0) {
			return [];
		}

		const cachedData = {};
		const unCachedKeys = cache.getUnCachedKeys(keys, cachedData);
		let data = [];
		if (unCachedKeys.length > 0) {
			data = await module.client.collection('objects').find(
				{_key: unCachedKeys.length === 1 ? unCachedKeys[0] : {$in: unCachedKeys}},
				{projection: {_id: 0}},
			).toArray();
			data = data.map(helpers.deserializeData);
		}

		const map = helpers.toMap(data);
		for (const key of unCachedKeys) {
			cachedData[key] = map[key] || null;
			cache.set(key, cachedData[key]);
		}

		if (!Array.isArray(fields) || fields.length === 0) {
			return keys.map(key => (cachedData[key] ? {...cachedData[key]} : null));
		}

		return keys.map(key => {
			const item = cachedData[key] || {};
			const result = {};
			for (const field of fields) {
				result[field] = item[field] === undefined ? null : item[field];
			}

			return result;
		});
	};

	module.getObjectKeys = async function (key) {
		const data = await module.getObject(key);
		return data ? Object.keys(data) : [];
	};

	module.getObjectValues = async function (key) {
		const data = await module.getObject(key);
		return data ? Object.values(data) : [];
	};

	module.isObjectField = async function (key, field) {
		const data = await module.isObjectFields(key, [field]);
		return Array.isArray(data) && data.length > 0 ? data[0] : false;
	};

	module.isObjectFields = async function (key, fields) {
		if (!key) {
			return;
		}

		const data = {};
		for (let field of fields) {
			field = helpers.fieldToString(field);
			if (field) {
				data[field] = 1;
			}
		}

		const item = await module.client.collection('objects').findOne({_key: key}, {projection: data});
		const results = fields.map(f => Boolean(item) && item[f] !== undefined && item[f] !== null);
		return results;
	};

	module.deleteObjectField = async function (key, field) {
		await module.deleteObjectFields(key, [field]);
	};

	module.deleteObjectFields = async function (key, fields) {
		if (!key || (Array.isArray(key) && key.length === 0) || !Array.isArray(fields) || fields.length === 0) {
			return;
		}

		fields = fields.filter(Boolean);
		if (fields.length === 0) {
			return;
		}

		const data = {};
		for (let field of fields) {
			field = helpers.fieldToString(field);
			data[field] = '';
		}

		await (Array.isArray(key) ? module.client.collection('objects').updateMany({_key: {$in: key}}, {$unset: data}) : module.client.collection('objects').updateOne({_key: key}, {$unset: data}));

		cache.del(key);
	};

	module.incrObjectField = async function (key, field) {
		return await module.incrObjectFieldBy(key, field, 1);
	};

	module.decrObjectField = async function (key, field) {
		return await module.incrObjectFieldBy(key, field, -1);
	};

	module.incrObjectFieldBy = async function (key, field, value) {
		value = Number.parseInt(value, 10);
		if (!key || isNaN(value)) {
			return null;
		}

		const increment = {};
		field = helpers.fieldToString(field);
		increment[field] = value;

		if (Array.isArray(key)) {
			const bulk = module.client.collection('objects').initializeUnorderedBulkOp();
			key.forEach(key => {
				bulk.find({_key: key}).upsert().update({$inc: increment});
			});
			await bulk.execute();
			cache.del(key);
			const result = await module.getObjectsFields(key, [field]);
			return result.map(data => data && data[field]);
		}

		try {
			const result = await module.client.collection('objects').findOneAndUpdate({
				_key: key,
			}, {
				$inc: increment,
			}, {
				returnDocument: 'after',
				upsert: true,
			});
			cache.del(key);
			return result && result.value ? result.value[field] : null;
		} catch (error) {
			// If there is duplicate key error retry the upsert
			// https://github.com/NodeBB/NodeBB/issues/4467
			// https://jira.mongodb.org/browse/SERVER-14322
			// https://docs.mongodb.org/manual/reference/command/findAndModify/#upsert-and-unique-index
			if (error && error.message.startsWith('E11000 duplicate key error')) {
				return await module.incrObjectFieldBy(key, field, value);
			}

			throw error;
		}
	};

	module.incrObjectFieldByBulk = async function (data) {
		if (!Array.isArray(data) || data.length === 0) {
			return;
		}

		const bulk = module.client.collection('objects').initializeUnorderedBulkOp();

		for (const item of data) {
			const increment = {};
			for (const [field, value] of Object.entries(item[1])) {
				increment[helpers.fieldToString(field)] = value;
			}

			bulk.find({_key: item[0]}).upsert().update({$inc: increment});
		}

		await bulk.execute();
		cache.del(data.map(item => item[0]));
	};
};
