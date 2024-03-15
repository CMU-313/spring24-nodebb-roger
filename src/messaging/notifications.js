'use strict';

const winston = require('winston');
const user = require('../user');
const notifications = require('../notifications');
const sockets = require('../socket.io');
const plugins = require('../plugins');
const meta = require('../meta');

module.exports = function (Messaging) {
	Messaging.notifyQueue = {}; // Only used to notify a user of a new chat message, see Messaging.notifyUser

	Messaging.notifyUsersInRoom = async (fromUid, roomId, messageObject) => {
		let uids = await Messaging.getUidsInRoom(roomId, 0, -1);
		uids = await user.blocks.filterUids(fromUid, uids);

		let data = {
			roomId,
			fromUid,
			message: messageObject,
			uids,
		};
		data = await plugins.hooks.fire('filter:messaging.notify', data);
		if (!data || !data.uids || data.uids.length === 0) {
			return;
		}

		uids = data.uids;
		for (const uid of uids) {
			data.self = Number.parseInt(uid, 10) === Number.parseInt(fromUid, 10) ? 1 : 0;
			Messaging.pushUnreadCount(uid);
			sockets.in(`uid_${uid}`).emit('event:chats.receive', data);
		}

		if (messageObject.system) {
			return;
		}

		// Delayed notifications
		let queueObject = Messaging.notifyQueue[`${fromUid}:${roomId}`];
		if (queueObject) {
			queueObject.message.content += `\n${messageObject.content}`;
			clearTimeout(queueObject.timeout);
		} else {
			queueObject = {
				message: messageObject,
			};
			Messaging.notifyQueue[`${fromUid}:${roomId}`] = queueObject;
		}

		queueObject.timeout = setTimeout(async () => {
			try {
				await sendNotifications(fromUid, uids, roomId, queueObject.message);
			} catch (error) {
				winston.error(`[messaging/notifications] Unabled to send notification\n${error.stack}`);
			}
		}, meta.config.notificationSendDelay * 1000);
	};

	async function sendNotifications(fromuid, uids, roomId, messageObject) {
		const isOnline = await user.isOnline(uids);
		uids = uids.filter((uid, index) => !isOnline[index] && Number.parseInt(fromuid, 10) !== Number.parseInt(uid, 10));
		if (uids.length === 0) {
			return;
		}

		const {displayname} = messageObject.fromUser;

		const isGroupChat = await Messaging.isGroupChat(roomId);
		const notification = await notifications.create({
			type: isGroupChat ? 'new-group-chat' : 'new-chat',
			subject: `[[email:notif.chat.subject, ${displayname}]]`,
			bodyShort: `[[notifications:new_message_from, ${displayname}]]`,
			bodyLong: messageObject.content,
			nid: `chat_${fromuid}_${roomId}`,
			from: fromuid,
			path: `/chats/${messageObject.roomId}`,
		});

		delete Messaging.notifyQueue[`${fromuid}:${roomId}`];
		notifications.push(notification, uids);
	}
};
