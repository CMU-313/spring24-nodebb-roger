'use strict';

const db = require('../../database');
const batch = require('../../batch');

module.exports = {
	name: 'Clean flag byCid zsets',
	timestamp: Date.UTC(2019, 8, 24),
	async method() {
		const {progress} = this;

		await batch.processSortedSet('flags:datetime', async flagIds => {
			progress.incr(flagIds.length);
			const flagData = await db.getObjects(flagIds.map(id => `flag:${id}`));
			const bulkRemove = [];
			for (const flagObject of flagData) {
				if (flagObject && flagObject.type === 'user' && flagObject.targetId && flagObject.flagId) {
					bulkRemove.push([`flags:byCid:${flagObject.targetId}`, flagObject.flagId]);
				}
			}

			await db.sortedSetRemoveBulk(bulkRemove);
		}, {
			progress,
		});
	},
};
