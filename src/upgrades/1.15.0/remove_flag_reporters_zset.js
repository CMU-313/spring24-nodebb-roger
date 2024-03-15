'use strict';

const db = require('../../database');
const batch = require('../../batch');

module.exports = {
	name: 'Remove flag reporters sorted set',
	timestamp: Date.UTC(2020, 6, 31),
	async method() {
		const {progress} = this;
		progress.total = await db.sortedSetCard('flags:datetime');

		await batch.processSortedSet('flags:datetime', async flagIds => {
			await Promise.all(flagIds.map(async flagId => {
				const [reports, reporterUids] = await Promise.all([
					db.getSortedSetRevRangeWithScores(`flag:${flagId}:reports`, 0, -1),
					db.getSortedSetRevRange(`flag:${flagId}:reporters`, 0, -1),
				]);

				const values = reports.reduce((memo, current, index) => {
					memo.push([`flag:${flagId}:reports`, current.score, [(reporterUids[index] || 0), current.value].join(';')]);
					return memo;
				}, []);

				await db.delete(`flag:${flagId}:reports`);
				await db.sortedSetAddBulk(values);
			}));
		}, {
			batch: 500,
			progress,
		});
	},
};
