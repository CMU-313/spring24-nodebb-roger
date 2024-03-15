'use strict';

const db = require('../../database');

module.exports = {
	name: 'Migrating flags to new schema',
	timestamp: Date.UTC(2016, 11, 7),
	async method() {
		const batch = require('../../batch');
		const posts = require('../../posts');
		const flags = require('../../flags');
		const {progress} = this;

		await batch.processSortedSet('posts:pid', async ids => {
			let postData = await posts.getPostsByPids(ids, 1);
			postData = postData.filter(post => post.hasOwnProperty('flags'));
			await Promise.all(postData.map(async post => {
				progress.incr();

				const [uids, reasons] = await Promise.all([
					db.getSortedSetRangeWithScores(`pid:${post.pid}:flag:uids`, 0, -1),
					db.getSortedSetRange(`pid:${post.pid}:flag:uid:reason`, 0, -1),
				]);

				// Adding in another check here in case a post was improperly dismissed
				// (flag count > 1 but no flags in db)
				if (uids.length > 0 && reasons.length > 0) {
					// Just take the first entry
					const datetime = uids[0].score;
					const reason = reasons[0].split(':')[1];

					try {
						const flagObject = await flags.create('post', post.pid, uids[0].value, reason, datetime);
						if (post['flag:state'] || post['flag:assignee']) {
							await flags.update(flagObject.flagId, 1, {
								state: post['flag:state'],
								assignee: post['flag:assignee'],
								datetime,
							});
						}

						if (post.hasOwnProperty('flag:notes') && post['flag:notes'].length > 0) {
							let history = JSON.parse(post['flag:history']);
							history = history.find(event => event.type === 'notes');
							await flags.appendNote(flagObject.flagId, history.uid, post['flag:notes'], history.timestamp);
						}
					} catch (error) {
						if (error.message !== '[[error:post-already-flagged]]') {
							throw error;
						}
					}
				}
			}));
		}, {
			progress: this.progress,
		});
	},
};
