'use strict';

module.exports = function (module) {
	module.sortedSetUnionCard = async function (keys) {
		if (!Array.isArray(keys) || keys.length === 0) {
			return 0;
		}

		const res = await module.pool.query({
			name: 'sortedSetUnionCard',
			text: `
SELECT COUNT(DISTINCT z."value") c
  FROM "legacy_object_live" o
 INNER JOIN "legacy_zset" z
         ON o."_key" = z."_key"
        AND o."type" = z."type"
 WHERE o."_key" = ANY($1::TEXT[])`,
			values: [keys],
		});
		return res.rows[0].c;
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
		const {sets} = parameters;
		const start = parameters.hasOwnProperty('start') ? parameters.start : 0;
		const stop = parameters.hasOwnProperty('stop') ? parameters.stop : -1;
		let weights = parameters.weights || [];
		const aggregate = parameters.aggregate || 'SUM';

		if (sets.length < weights.length) {
			weights = weights.slice(0, sets.length);
		}

		while (sets.length > weights.length) {
			weights.push(1);
		}

		let limit = stop - start + 1;
		if (limit <= 0) {
			limit = null;
		}

		const res = await module.pool.query({
			name: `getSortedSetUnion${aggregate}${parameters.sort > 0 ? 'Asc' : 'Desc'}WithScores`,
			text: `
WITH A AS (SELECT z."value",
                  ${aggregate}(z."score" * k."weight") "score"
             FROM UNNEST($1::TEXT[], $2::NUMERIC[]) k("_key", "weight")
            INNER JOIN "legacy_object_live" o
                    ON o."_key" = k."_key"
            INNER JOIN "legacy_zset" z
                    ON o."_key" = z."_key"
                   AND o."type" = z."type"
            GROUP BY z."value")
SELECT A."value",
       A."score"
  FROM A
 ORDER BY A."score" ${parameters.sort > 0 ? 'ASC' : 'DESC'}
 LIMIT $4::INTEGER
OFFSET $3::INTEGER`,
			values: [sets, weights, start, limit],
		});

		if (parameters.withScores) {
			res.rows = res.rows.map(r => ({
				value: r.value,
				score: Number.parseFloat(r.score),
			}));
		} else {
			res.rows = res.rows.map(r => r.value);
		}

		return res.rows;
	}
};
