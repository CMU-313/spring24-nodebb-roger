'use strict';

const async = require('async');
const winston = require('winston');
const db = require('../../database');

module.exports = {
	name: 'Upgrading chats',
	timestamp: Date.UTC(2015, 11, 15),
	method(callback) {
		db.getObjectFields('global', ['nextMid', 'nextChatRoomId'], (error, globalData) => {
			if (error) {
				return callback(error);
			}

			const rooms = {};
			let roomId = globalData.nextChatRoomId || 1;
			let currentMid = 1;

			async.whilst(next => {
				next(null, currentMid <= globalData.nextMid);
			}, next => {
				db.getObject(`message:${currentMid}`, (error, message) => {
					if (error || !message) {
						winston.verbose('skipping chat message ', currentMid);
						currentMid += 1;
						return next(error);
					}

					const pairID = [Number.parseInt(message.fromuid, 10), Number.parseInt(message.touid, 10)].sort().join(':');
					const messageTime = Number.parseInt(message.timestamp, 10);

					function addMessageToUids(roomId, callback) {
						async.parallel([
							function (next) {
								db.sortedSetAdd(`uid:${message.fromuid}:chat:room:${roomId}:mids`, messageTime, currentMid, next);
							},
							function (next) {
								db.sortedSetAdd(`uid:${message.touid}:chat:room:${roomId}:mids`, messageTime, currentMid, next);
							},
						], callback);
					}

					if (rooms[pairID]) {
						winston.verbose(`adding message ${currentMid} to existing roomID ${roomId}`);
						addMessageToUids(rooms[pairID], error_ => {
							if (error_) {
								return next(error_);
							}

							currentMid += 1;
							next();
						});
					} else {
						winston.verbose(`adding message ${currentMid} to new roomID ${roomId}`);
						async.parallel([
							function (next) {
								db.sortedSetAdd(`uid:${message.fromuid}:chat:rooms`, messageTime, roomId, next);
							},
							function (next) {
								db.sortedSetAdd(`uid:${message.touid}:chat:rooms`, messageTime, roomId, next);
							},
							function (next) {
								db.sortedSetAdd(`chat:room:${roomId}:uids`, [messageTime, messageTime + 1], [message.fromuid, message.touid], next);
							},
							function (next) {
								addMessageToUids(roomId, next);
							},
						], error_ => {
							if (error_) {
								return next(error_);
							}

							rooms[pairID] = roomId;
							roomId += 1;
							currentMid += 1;
							db.setObjectField('global', 'nextChatRoomId', roomId, next);
						});
					}
				});
			}, callback);
		});
	},
};
