'use strict';

const async = require('async');
const winston = require('winston');
const db = require('../../database');

module.exports = {
	name: 'Users post count per tid',
	timestamp: Date.UTC(2016, 3, 19),
	method(callback) {
		const batch = require('../../batch');
		const topics = require('../../topics');
		let count = 0;
		batch.processSortedSet('topics:tid', (tids, next) => {
			winston.verbose(`upgraded ${count} topics`);
			count += tids.length;
			async.each(tids, (tid, next) => {
				db.delete(`tid:${tid}:posters`, error => {
					if (error) {
						return next(error);
					}

					topics.getPids(tid, (error, pids) => {
						if (error) {
							return next(error);
						}

						if (pids.length === 0) {
							return next();
						}

						async.eachSeries(pids, (pid, next) => {
							db.getObjectField(`post:${pid}`, 'uid', (error, uid) => {
								if (error) {
									return next(error);
								}

								if (!Number.parseInt(uid, 10)) {
									return next();
								}

								db.sortedSetIncrBy(`tid:${tid}:posters`, 1, uid, next);
							});
						}, next);
					});
				});
			}, next);
		}, {}, callback);
	},
};
