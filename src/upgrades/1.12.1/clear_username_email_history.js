'use strict';

const async = require('async');
const db = require('../../database');
const user = require('../../user');

module.exports = {
	name: 'Delete username email history for deleted users',
	timestamp: Date.UTC(2019, 2, 25),
	method(callback) {
		const {progress} = this;
		let currentUid = 1;
		db.getObjectField('global', 'nextUid', (error, nextUid) => {
			if (error) {
				return callback(error);
			}

			progress.total = nextUid;
			async.whilst(next => {
				next(null, currentUid < nextUid);
			},
			next => {
				progress.incr();
				user.exists(currentUid, (error, exists) => {
					if (error) {
						return next(error);
					}

					if (exists) {
						currentUid += 1;
						return next();
					}

					db.deleteAll([`user:${currentUid}:usernames`, `user:${currentUid}:emails`], error_ => {
						if (error_) {
							return next(error_);
						}

						currentUid += 1;
						next();
					});
				});
			},
			error => {
				callback(error);
			});
		});
	},
};
