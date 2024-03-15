'use strict';

module.exports = function (module) {
	module.sortedSetUnionCard = async function (keys) {
		if (!Array.isArray(keys) || keys.length === 0) {
			return 0;
		}

		const data = await module.client.collection('objects').aggregate([
			{$match: {_key: {$in: keys}}},
			{$group: {_id: {value: '$value'}}},
			{$group: {_id: null, count: {$sum: 1}}},
		]).toArray();
		return Array.isArray(data) && data.length > 0 ? data[0].count : 0;
	};

	module.getSortedSetUnion = async function (parameters) {
		parameters.sort = 1;
		return await getSortedSetUnion(parameters);
	};

	module.getSortedSetRevUnion = async function (parameters) {
		parameters.sort = -1;
		return await getSortedSetUnion(parameters);
	};

	async function getSortedSetUnion(parameters) {
		if (!Array.isArray(parameters.sets) || parameters.sets.length === 0) {
			return;
		}

		let limit = parameters.stop - parameters.start + 1;
		if (limit <= 0) {
			limit = 0;
		}

		const aggregate = {};
		if (parameters.aggregate) {
			aggregate[`$${parameters.aggregate.toLowerCase()}`] = '$score';
		} else {
			aggregate.$sum = '$score';
		}

		const pipeline = [
			{$match: {_key: {$in: parameters.sets}}},
			{$group: {_id: {value: '$value'}, totalScore: aggregate}},
			{$sort: {totalScore: parameters.sort}},
		];

		if (parameters.start) {
			pipeline.push({$skip: parameters.start});
		}

		if (limit > 0) {
			pipeline.push({$limit: limit});
		}

		const project = {_id: 0, value: '$_id.value'};
		if (parameters.withScores) {
			project.score = '$totalScore';
		}

		pipeline.push({$project: project});

		let data = await module.client.collection('objects').aggregate(pipeline).toArray();
		if (!parameters.withScores) {
			data = data.map(item => item.value);
		}

		return data;
	}
};
