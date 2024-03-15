
'use strict';

module.exports = function (module) {
	const helpers = require('../helpers');
	module.sortedSetIntersectCard = async function (keys) {
		if (!Array.isArray(keys) || keys.length === 0) {
			return 0;
		}

		const temporarySetName = `temp_${Date.now()}`;

		const interParameters = [temporarySetName, keys.length].concat(keys);

		const multi = module.client.multi();
		multi.zinterstore(interParameters);
		multi.zcard(temporarySetName);
		multi.del(temporarySetName);
		const results = await helpers.execBatch(multi);
		return results[1] || 0;
	};

	module.getSortedSetIntersect = async function (parameters) {
		parameters.method = 'zrange';
		return await getSortedSetRevIntersect(parameters);
	};

	module.getSortedSetRevIntersect = async function (parameters) {
		parameters.method = 'zrevrange';
		return await getSortedSetRevIntersect(parameters);
	};

	async function getSortedSetRevIntersect(parameters) {
		const {sets} = parameters;
		const start = parameters.hasOwnProperty('start') ? parameters.start : 0;
		const stop = parameters.hasOwnProperty('stop') ? parameters.stop : -1;
		const weights = parameters.weights || [];

		const temporarySetName = `temp_${Date.now()}`;

		let interParameters = [temporarySetName, sets.length].concat(sets);
		if (weights.length > 0) {
			interParameters = interParameters.concat(['WEIGHTS'].concat(weights));
		}

		if (parameters.aggregate) {
			interParameters = interParameters.concat(['AGGREGATE', parameters.aggregate]);
		}

		const rangeParameters = [temporarySetName, start, stop];
		if (parameters.withScores) {
			rangeParameters.push('WITHSCORES');
		}

		const multi = module.client.multi();
		multi.zinterstore(interParameters);
		multi[parameters.method](rangeParameters);
		multi.del(temporarySetName);
		let results = await helpers.execBatch(multi);

		if (!parameters.withScores) {
			return results ? results[1] : null;
		}

		results = results[1] || [];
		return helpers.zsetToObjectArray(results);
	}
};
