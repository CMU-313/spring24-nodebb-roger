'use strict';

const async = require('async');
const db = require('../../database');

module.exports = {
	name: 'Category recent tids',
	timestamp: Date.UTC(2016, 8, 22),
	method(callback) {
		db.getSortedSetRange('categories:cid', 0, -1, (error, cids) => {
			if (error) {
				return callback(error);
			}

			async.eachSeries(cids, (cid, next) => {
				db.getSortedSetRevRange(`cid:${cid}:pids`, 0, 0, (error, pid) => {
					if (error || !pid) {
						return next(error);
					}

					db.getObjectFields(`post:${pid}`, ['tid', 'timestamp'], (error, postData) => {
						if (error || !postData || !postData.tid) {
							return next(error);
						}

						db.sortedSetAdd(`cid:${cid}:recent_tids`, postData.timestamp, postData.tid, next);
					});
				});
			}, callback);
		});
	},
};
