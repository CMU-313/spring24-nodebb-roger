'use strict';

const async = require('async');
const winston = require('winston');
const db = require('../../database');

module.exports = {
	name: 'Creating user best post sorted sets',
	timestamp: Date.UTC(2016, 0, 14),
	method(callback) {
		const batch = require('../../batch');
		const {progress} = this;

		batch.processSortedSet('posts:pid', (ids, next) => {
			async.eachSeries(ids, (id, next) => {
				db.getObjectFields(`post:${id}`, ['pid', 'uid', 'votes'], (error, postData) => {
					if (error) {
						return next(error);
					}

					if (!postData || !Number.parseInt(postData.votes, 10) || !Number.parseInt(postData.uid, 10)) {
						return next();
					}

					winston.verbose(`processing pid: ${postData.pid} uid: ${postData.uid} votes: ${postData.votes}`);
					db.sortedSetAdd(`uid:${postData.uid}:posts:votes`, postData.votes, postData.pid, next);
					progress.incr();
				});
			}, next);
		}, {
			progress,
		}, callback);
	},
};
