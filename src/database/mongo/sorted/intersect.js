'use strict';

module.exports = function (module) {
	module.sortedSetIntersectCard = async function (keys) {
		if (!Array.isArray(keys) || keys.length === 0) {
			return 0;
		}

		const objects = module.client.collection('objects');
		const counts = await countSets(keys, 50_000);
		if (counts.minCount === 0) {
			return 0;
		}

		let items = await objects.find({_key: counts.smallestSet}, {
			projection: {_id: 0, value: 1},
		}).batchSize(counts.minCount + 1).toArray();

		const otherSets = keys.filter(s => s !== counts.smallestSet);
		for (let i = 0; i < otherSets.length; i++) {
			/* eslint-disable no-await-in-loop */
			const query = {_key: otherSets[i], value: {$in: items.map(i => i.value)}};
			if (i === otherSets.length - 1) {
				return await objects.countDocuments(query);
			}

			items = await objects.find(query, {projection: {_id: 0, value: 1}})
				.batchSize(items.length + 1).toArray();
		}
	};

	async function countSets(sets, limit) {
		const objects = module.client.collection('objects');
		const counts = await Promise.all(
			sets.map(s => objects.countDocuments({_key: s}, {
				limit: limit || 25_000,
			})),
		);
		const minCount = Math.min(...counts);
		const index = counts.indexOf(minCount);
		const smallestSet = sets[index];
		return {
			minCount,
			smallestSet,
		};
	}

	module.getSortedSetIntersect = async function (parameters) {
		parameters.sort = 1;
		return await getSortedSetRevIntersect(parameters);
	};

	module.getSortedSetRevIntersect = async function (parameters) {
		parameters.sort = -1;
		return await getSortedSetRevIntersect(parameters);
	};

	async function getSortedSetRevIntersect(parameters) {
		parameters.start = parameters.hasOwnProperty('start') ? parameters.start : 0;
		parameters.stop = parameters.hasOwnProperty('stop') ? parameters.stop : -1;
		parameters.weights = parameters.weights || [];

		parameters.limit = parameters.stop - parameters.start + 1;
		if (parameters.limit <= 0) {
			parameters.limit = 0;
		}

		parameters.counts = await countSets(parameters.sets);
		if (parameters.counts.minCount === 0) {
			return [];
		}

		const simple = parameters.weights.filter(w => w === 1).length === 1 && parameters.limit !== 0;
		if (parameters.counts.minCount < 25_000 && simple) {
			return await intersectSingle(parameters);
		}

		if (simple) {
			return await intersectBatch(parameters);
		}

		return await intersectAggregate(parameters);
	}

	async function intersectSingle(parameters) {
		const objects = module.client.collection('objects');
		const sortSet = parameters.sets[parameters.weights.indexOf(1)];
		if (sortSet === parameters.counts.smallestSet) {
			return await intersectBatch(parameters);
		}

		const cursorSmall = objects.find({_key: parameters.counts.smallestSet}, {
			projection: {_id: 0, value: 1},
		});
		if (parameters.counts.minCount > 1) {
			cursorSmall.batchSize(parameters.counts.minCount + 1);
		}

		let items = await cursorSmall.toArray();
		const project = {_id: 0, value: 1};
		if (parameters.withScores) {
			project.score = 1;
		}

		const otherSets = parameters.sets.filter(s => s !== parameters.counts.smallestSet);
		// Move sortSet to the end of array
		otherSets.push(otherSets.splice(otherSets.indexOf(sortSet), 1)[0]);
		for (let i = 0; i < otherSets.length; i++) {
			/* eslint-disable no-await-in-loop */
			const cursor = objects.find({_key: otherSets[i], value: {$in: items.map(i => i.value)}});
			cursor.batchSize(items.length + 1);
			// At the last step sort by sortSet
			if (i === otherSets.length - 1) {
				cursor.project(project).sort({score: parameters.sort}).skip(parameters.start).limit(parameters.limit);
			} else {
				cursor.project({_id: 0, value: 1});
			}

			items = await cursor.toArray();
		}

		if (!parameters.withScores) {
			items = items.map(i => i.value);
		}

		return items;
	}

	async function intersectBatch(parameters) {
		const project = {_id: 0, value: 1};
		if (parameters.withScores) {
			project.score = 1;
		}

		const sortSet = parameters.sets[parameters.weights.indexOf(1)];
		const batchSize = 10_000;
		const cursor = await module.client.collection('objects')
			.find({_key: sortSet}, {projection: project})
			.sort({score: parameters.sort})
			.batchSize(batchSize);

		const otherSets = parameters.sets.filter(s => s !== sortSet);
		let inters = [];
		let done = false;
		while (!done) {
			/* eslint-disable no-await-in-loop */
			const items = [];
			while (items.length < batchSize) {
				const nextItem = await cursor.next();
				if (!nextItem) {
					done = true;
					break;
				}

				items.push(nextItem);
			}

			const members = await Promise.all(otherSets.map(async s => {
				const data = await module.client.collection('objects').find({
					_key: s, value: {$in: items.map(i => i.value)},
				}, {
					projection: {_id: 0, value: 1},
				}).batchSize(items.length + 1).toArray();
				return new Set(data.map(i => i.value));
			}));
			inters = inters.concat(items.filter(item => members.every(array => array.has(item.value))));
			if (inters.length >= parameters.stop) {
				done = true;
				inters = inters.slice(parameters.start, parameters.stop + 1);
			}
		}

		if (!parameters.withScores) {
			inters = inters.map(item => item.value);
		}

		return inters;
	}

	async function intersectAggregate(parameters) {
		const aggregate = {};

		if (parameters.aggregate) {
			aggregate[`$${parameters.aggregate.toLowerCase()}`] = '$score';
		} else {
			aggregate.$sum = '$score';
		}

		const pipeline = [{$match: {_key: {$in: parameters.sets}}}];

		for (const [index, weight] of parameters.weights.entries()) {
			if (weight !== 1) {
				pipeline.push({
					$project: {
						value: 1,
						score: {
							$cond: {
								if: {
									$eq: ['$_key', parameters.sets[index]],
								},
								then: {
									$multiply: ['$score', weight],
								},
								else: '$score',
							},
						},
					},
				});
			}
		}

		pipeline.push({$group: {_id: {value: '$value'}, totalScore: aggregate, count: {$sum: 1}}}, {$match: {count: parameters.sets.length}}, {$sort: {totalScore: parameters.sort}});

		if (parameters.start) {
			pipeline.push({$skip: parameters.start});
		}

		if (parameters.limit > 0) {
			pipeline.push({$limit: parameters.limit});
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
