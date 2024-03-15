'use strict';

const db = require('../../database');

module.exports = {
	name: 'Rename privileges:downvote and privileges:flag to min:rep:downvote, min:rep:flag respectively',
	timestamp: Date.UTC(2018, 0, 12),
	method(callback) {
		db.getObjectFields('config', ['privileges:downvote', 'privileges:flag'], (error, config) => {
			if (error) {
				return callback(error);
			}

			db.setObject('config', {
				'min:rep:downvote': Number.parseInt(config['privileges:downvote'], 10) || 0,
				'min:rep:flag': Number.parseInt(config['privileges:downvote'], 10) || 0,
			}, error_ => {
				if (error_) {
					return callback(error_);
				}

				db.deleteObjectFields('config', ['privileges:downvote', 'privileges:flag'], callback);
			});
		});
	},
};
