
'use strict';

module.exports = function (module) {
	const helpers = require('../helpers');
	module.sortedSetUnionCard = async function (keys) {
		const temporarySetName = `temp_${Date.now()}`;
		if (keys.length === 0) {
			return 0;
		}

		const multi = module.client.multi();
		multi.zunionstore([temporarySetName, keys.length].concat(keys));
		multi.zcard(temporarySetName);
		multi.del(temporarySetName);
		const results = await helpers.execBatch(multi);
		return Array.isArray(results) && results.length > 0 ? results[1] : 0;
	};

	module.getSortedSetUnion = async function (parameters) {
		parameters.method = 'zrange';
		return await module.sortedSetUnion(parameters);
	};

	module.getSortedSetRevUnion = async function (parameters) {
		parameters.method = 'zrevrange';
		return await module.sortedSetUnion(parameters);
	};

	module.sortedSetUnion = async function (parameters) {
		if (parameters.sets.length === 0) {
			return [];
		}

		const temporarySetName = `temp_${Date.now()}`;

		const rangeParameters = [temporarySetName, parameters.start, parameters.stop];
		if (parameters.withScores) {
			rangeParameters.push('WITHSCORES');
		}

		const multi = module.client.multi();
		multi.zunionstore([temporarySetName, parameters.sets.length].concat(parameters.sets));
		multi[parameters.method](rangeParameters);
		multi.del(temporarySetName);
		let results = await helpers.execBatch(multi);
		if (!parameters.withScores) {
			return results ? results[1] : null;
		}

		results = results[1] || [];
		return helpers.zsetToObjectArray(results);
	};
};
