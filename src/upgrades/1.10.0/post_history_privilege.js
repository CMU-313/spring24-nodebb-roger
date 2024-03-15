'use strict';

const async = require('async');
const privileges = require('../../privileges');
const db = require('../../database');

module.exports = {
	name: 'Give post history viewing privilege to registered-users on all categories',
	timestamp: Date.UTC(2018, 5, 7),
	method(callback) {
		db.getSortedSetRange('categories:cid', 0, -1, (error, cids) => {
			if (error) {
				return callback(error);
			}

			async.eachSeries(cids, (cid, next) => {
				privileges.categories.give(['groups:posts:history'], cid, 'registered-users', next);
			}, callback);
		});
	},
};
