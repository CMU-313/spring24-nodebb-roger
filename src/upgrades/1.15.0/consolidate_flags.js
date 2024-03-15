'use strict';

const db = require('../../database');
const batch = require('../../batch');
const posts = require('../../posts');
const user = require('../../user');

module.exports = {
	name: 'Consolidate multiple flags reports, going forward',
	timestamp: Date.UTC(2020, 6, 16),
	async method() {
		const {progress} = this;

		let flags = await db.getSortedSetRange('flags:datetime', 0, -1);
		flags = flags.map(flagId => `flag:${flagId}`);
		flags = await db.getObjectsFields(flags, ['flagId', 'type', 'targetId', 'uid', 'description', 'datetime']);
		progress.total = flags.length;

		await batch.processArray(flags, async subset => {
			progress.incr(subset.length);

			await Promise.all(subset.map(async flagObject => {
				const methods = [];
				switch (flagObject.type) {
					case 'post': {
						methods.push(posts.setPostField.bind(posts, flagObject.targetId, 'flagId', flagObject.flagId));
						break;
					}

					case 'user': {
						methods.push(user.setUserField.bind(user, flagObject.targetId, 'flagId', flagObject.flagId));
						break;
					}
				}

				methods.push(
					db.sortedSetAdd.bind(db, `flag:${flagObject.flagId}:reports`, flagObject.datetime, String(flagObject.description).slice(0, 250)),
					db.sortedSetAdd.bind(db, `flag:${flagObject.flagId}:reporters`, flagObject.datetime, flagObject.uid),
				);

				await Promise.all(methods.map(async method => method()));
			}));
		}, {
			progress,
			batch: 500,
		});
	},
};
