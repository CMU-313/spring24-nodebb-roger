'use strict';

const db = require('../../database');
const batch = require('../../batch');
const posts = require('../../posts');

module.exports = {
	name: 'Add target uid to flag objects',
	timestamp: Date.UTC(2020, 7, 22),
	async method() {
		const {progress} = this;

		await batch.processSortedSet('flags:datetime', async flagIds => {
			progress.incr(flagIds.length);
			const flagData = await db.getObjects(flagIds.map(id => `flag:${id}`));
			for (const flagObject of flagData) {
				/* eslint-disable no-await-in-loop */
				if (flagObject) {
					const {targetId} = flagObject;
					if (targetId) {
						if (flagObject.type === 'post') {
							const targetUid = await posts.getPostField(targetId, 'uid');
							if (targetUid) {
								await db.setObjectField(`flag:${flagObject.flagId}`, 'targetUid', targetUid);
							}
						} else if (flagObject.type === 'user') {
							await db.setObjectField(`flag:${flagObject.flagId}`, 'targetUid', targetId);
						}
					}
				}
			}
		}, {
			progress,
			batch: 500,
		});
	},
};
