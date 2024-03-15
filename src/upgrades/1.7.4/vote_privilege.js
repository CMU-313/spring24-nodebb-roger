'use strict';

const async = require('async');
const privileges = require('../../privileges');
const db = require('../../database');

module.exports = {
	name: 'Give vote privilege to registered-users on all categories',
	timestamp: Date.UTC(2018, 0, 9),
	method(callback) {
		db.getSortedSetRange('categories:cid', 0, -1, (error, cids) => {
			if (error) {
				return callback(error);
			}

			async.eachSeries(cids, (cid, next) => {
				privileges.categories.give(['groups:posts:upvote', 'groups:posts:downvote'], cid, 'registered-users', next);
			}, callback);
		});
	},
};
