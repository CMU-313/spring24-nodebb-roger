'use strict';

module.exports = function (module) {
	module.transaction = async function (perform, txClient) {
		let res;
		if (txClient) {
			await txClient.query('SAVEPOINT nodebb_subtx');
			try {
				res = await perform(txClient);
			} catch (error) {
				await txClient.query('ROLLBACK TO SAVEPOINT nodebb_subtx');
				throw error;
			}

			await txClient.query('RELEASE SAVEPOINT nodebb_subtx');
			return res;
		}

		// See https://node-postgres.com/features/transactions#a-pooled-client-with-async-await
		const client = await module.pool.connect();

		try {
			await client.query('BEGIN');
			res = await perform(client);
			await client.query('COMMIT');
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}

		return res;
	};
};
