'use strict';

const async = require('async');
const db = require('../../database');

module.exports = {
	name: 'Chat room hashes',
	timestamp: Date.UTC(2015, 11, 23),
	method(callback) {
		db.getObjectField('global', 'nextChatRoomId', (error, nextChatRoomId) => {
			if (error) {
				return callback(error);
			}

			let currentChatRoomId = 1;
			async.whilst(next => {
				next(null, currentChatRoomId <= nextChatRoomId);
			}, next => {
				db.getSortedSetRange(`chat:room:${currentChatRoomId}:uids`, 0, 0, (error, uids) => {
					if (error) {
						return next(error);
					}

					if (!Array.isArray(uids) || uids.length === 0 || !uids[0]) {
						currentChatRoomId += 1;
						return next();
					}

					db.setObject(`chat:room:${currentChatRoomId}`, {owner: uids[0], roomId: currentChatRoomId}, error_ => {
						if (error_) {
							return next(error_);
						}

						currentChatRoomId += 1;
						next();
					});
				});
			}, callback);
		});
	},
};
