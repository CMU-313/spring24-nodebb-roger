'use strict';

const async = require('async');
const groups = require('../../groups');
const privileges = require('../../privileges');
const db = require('../../database');

module.exports = {
	name: 'Give category access privileges to spiders system group',
	timestamp: Date.UTC(2018, 0, 31),
	method(callback) {
		db.getSortedSetRange('categories:cid', 0, -1, (error, cids) => {
			if (error) {
				return callback(error);
			}

			async.eachSeries(cids, (cid, next) => {
				getGroupPrivileges(cid, (error, groupPrivileges) => {
					if (error) {
						return next(error);
					}

					const privs = [];
					if (groupPrivileges['groups:find']) {
						privs.push('groups:find');
					}

					if (groupPrivileges['groups:read']) {
						privs.push('groups:read');
					}

					if (groupPrivileges['groups:topics:read']) {
						privs.push('groups:topics:read');
					}

					privileges.categories.give(privs, cid, 'spiders', next);
				});
			}, callback);
		});
	},
};

function getGroupPrivileges(cid, callback) {
	const tasks = {};

	for (const privilege of ['groups:find', 'groups:read', 'groups:topics:read']) {
		tasks[privilege] = async.apply(groups.isMember, 'guests', `cid:${cid}:privileges:${privilege}`);
	}

	async.parallel(tasks, callback);
}
