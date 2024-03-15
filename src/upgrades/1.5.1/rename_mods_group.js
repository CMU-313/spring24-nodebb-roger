'use strict';

const async = require('async');
const winston = require('winston');
const batch = require('../../batch');
const groups = require('../../groups');

module.exports = {
	name: 'rename user mod privileges group',
	timestamp: Date.UTC(2017, 4, 26),
	method(callback) {
		const {progress} = this;
		batch.processSortedSet('categories:cid', (cids, next) => {
			async.eachSeries(cids, (cid, next) => {
				const groupName = `cid:${cid}:privileges:mods`;
				const newName = `cid:${cid}:privileges:moderate`;
				groups.exists(groupName, (error, exists) => {
					if (error || !exists) {
						progress.incr();
						return next(error);
					}

					winston.verbose(`renaming ${groupName} to ${newName}`);
					progress.incr();
					groups.renameGroup(groupName, newName, next);
				});
			}, next);
		}, {
			progress,
		}, callback);
	},
};
