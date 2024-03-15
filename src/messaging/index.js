'use strict';

const validator = require('validator');
const db = require('../database');
const user = require('../user');
const privileges = require('../privileges');
const plugins = require('../plugins');
const meta = require('../meta');
const utils = require('../utils');

const Messaging = module.exports;

require('./data')(Messaging);
require('./create')(Messaging);
require('./delete')(Messaging);
require('./edit')(Messaging);
require('./rooms')(Messaging);
require('./unread')(Messaging);
require('./notifications')(Messaging);

Messaging.messageExists = async mid => db.exists(`message:${mid}`);

Messaging.getMessages = async parameters => {
	const isNew = parameters.isNew || false;
	const start = parameters.hasOwnProperty('start') ? parameters.start : 0;
	const stop = Number.parseInt(start, 10) + ((parameters.count || 50) - 1);

	const indices = {};
	const ok = await canGet('filter:messaging.canGetMessages', parameters.callerUid, parameters.uid);
	if (!ok) {
		return;
	}

	const mids = await db.getSortedSetRevRange(`uid:${parameters.uid}:chat:room:${parameters.roomId}:mids`, start, stop);
	if (mids.length === 0) {
		return [];
	}

	for (const [index, mid] of mids.entries()) {
		indices[mid] = start + index;
	}

	mids.reverse();

	const messageData = await Messaging.getMessagesData(mids, parameters.uid, parameters.roomId, isNew);
	messageData.forEach(messageData => {
		messageData.index = indices[messageData.messageId.toString()];
		messageData.isOwner = messageData.fromuid === Number.parseInt(parameters.uid, 10);
		if (messageData.deleted && !messageData.isOwner) {
			messageData.content = '[[modules:chat.message-deleted]]';
			messageData.cleanedContent = messageData.content;
		}
	});

	return messageData;
};

async function canGet(hook, callerUid, uid) {
	const data = await plugins.hooks.fire(hook, {
		callerUid,
		uid,
		canGet: Number.parseInt(callerUid, 10) === Number.parseInt(uid, 10),
	});

	return data ? data.canGet : false;
}

Messaging.parse = async (message, fromuid, uid, roomId, isNew) => {
	const parsed = await plugins.hooks.fire('filter:parse.raw', String(message || ''));
	let messageData = {
		message,
		parsed,
		fromuid,
		uid,
		roomId,
		isNew,
		parsedMessage: parsed,
	};

	messageData = await plugins.hooks.fire('filter:messaging.parse', messageData);
	return messageData ? messageData.parsedMessage : '';
};

Messaging.isNewSet = async (uid, roomId, timestamp) => {
	const setKey = `uid:${uid}:chat:room:${roomId}:mids`;
	const messages = await db.getSortedSetRevRangeWithScores(setKey, 0, 0);
	if (messages && messages.length > 0) {
		return Number.parseInt(timestamp, 10) > Number.parseInt(messages[0].score, 10) + Messaging.newMessageCutoff;
	}

	return true;
};

Messaging.getRecentChats = async (callerUid, uid, start, stop) => {
	const ok = await canGet('filter:messaging.canGetRecentChats', callerUid, uid);
	if (!ok) {
		return null;
	}

	const roomIds = await db.getSortedSetRevRange(`uid:${uid}:chat:rooms`, start, stop);
	const results = await utils.promiseParallel({
		roomData: Messaging.getRoomsData(roomIds),
		unread: db.isSortedSetMembers(`uid:${uid}:chat:rooms:unread`, roomIds),
		users: Promise.all(roomIds.map(async roomId => {
			let uids = await db.getSortedSetRevRange(`chat:room:${roomId}:uids`, 0, 9);
			uids = uids.filter(_uid => _uid && Number.parseInt(_uid, 10) !== Number.parseInt(uid, 10));
			return await user.getUsersFields(uids, ['uid', 'username', 'userslug', 'picture', 'status', 'lastonline']);
		})),
		teasers: Promise.all(roomIds.map(async roomId => Messaging.getTeaser(uid, roomId))),
	});

	for (const [index, room] of results.roomData.entries()) {
		if (room) {
			room.users = results.users[index];
			room.groupChat = room.hasOwnProperty('groupChat') ? room.groupChat : room.users.length > 2;
			room.unread = results.unread[index];
			room.teaser = results.teasers[index];

			for (const userData of room.users) {
				if (userData && Number.parseInt(userData.uid, 10)) {
					userData.status = user.getStatus(userData);
				}
			}

			room.users = room.users.filter(user => user && Number.parseInt(user.uid, 10));
			room.lastUser = room.users[0];

			room.usernames = Messaging.generateUsernames(room.users, uid);
		}
	}

	results.roomData = results.roomData.filter(Boolean);
	const reference = {rooms: results.roomData, nextStart: stop + 1};
	return await plugins.hooks.fire('filter:messaging.getRecentChats', {
		rooms: reference.rooms,
		nextStart: reference.nextStart,
		uid,
		callerUid,
	});
};

Messaging.generateUsernames = (users, excludeUid) => users.filter(user => user && Number.parseInt(user.uid, 10) !== excludeUid)
	.map(user => user.username).join(', ');

Messaging.getTeaser = async (uid, roomId) => {
	const mid = await Messaging.getLatestUndeletedMessage(uid, roomId);
	if (!mid) {
		return null;
	}

	const teaser = await Messaging.getMessageFields(mid, ['fromuid', 'content', 'timestamp']);
	if (!teaser.fromuid) {
		return null;
	}

	const blocked = await user.blocks.is(teaser.fromuid, uid);
	if (blocked) {
		return null;
	}

	teaser.user = await user.getUserFields(teaser.fromuid, ['uid', 'username', 'userslug', 'picture', 'status', 'lastonline']);
	if (teaser.content) {
		teaser.content = utils.stripHTMLTags(utils.decodeHTMLEntities(teaser.content));
		teaser.content = validator.escape(String(teaser.content));
	}

	const payload = await plugins.hooks.fire('filter:messaging.getTeaser', {teaser});
	return payload.teaser;
};

Messaging.getLatestUndeletedMessage = async (uid, roomId) => {
	let done = false;
	let latestMid = null;
	let index = 0;
	let mids;

	while (!done) {
		/* eslint-disable no-await-in-loop */
		mids = await db.getSortedSetRevRange(`uid:${uid}:chat:room:${roomId}:mids`, index, index);
		if (mids.length > 0) {
			const states = await Messaging.getMessageFields(mids[0], ['deleted', 'system']);
			done = !states.deleted && !states.system;
			if (done) {
				latestMid = mids[0];
			}

			index += 1;
		} else {
			done = true;
		}
	}

	return latestMid;
};

Messaging.canMessageUser = async (uid, toUid) => {
	if (meta.config.disableChat || uid <= 0) {
		throw new Error('[[error:chat-disabled]]');
	}

	if (Number.parseInt(uid, 10) === Number.parseInt(toUid, 10)) {
		throw new Error('[[error:cant-chat-with-yourself]]');
	}

	const [exists, canChat] = await Promise.all([
		user.exists(toUid),
		privileges.global.can('chat', uid),
		checkReputation(uid),
	]);

	if (!exists) {
		throw new Error('[[error:no-user]]');
	}

	if (!canChat) {
		throw new Error('[[error:no-privileges]]');
	}

	const [settings, isAdmin, isModerator, isFollowing, isBlocked] = await Promise.all([
		user.getSettings(toUid),
		user.isAdministrator(uid),
		user.isModeratorOfAnyCategory(uid),
		user.isFollowing(toUid, uid),
		user.blocks.is(uid, toUid),
	]);

	if (isBlocked || (settings.restrictChat && !isAdmin && !isModerator && !isFollowing)) {
		throw new Error('[[error:chat-restricted]]');
	}

	await plugins.hooks.fire('static:messaging.canMessageUser', {
		uid,
		toUid,
	});
};

Messaging.canMessageRoom = async (uid, roomId) => {
	if (meta.config.disableChat || uid <= 0) {
		throw new Error('[[error:chat-disabled]]');
	}

	const [inRoom, canChat] = await Promise.all([
		Messaging.isUserInRoom(uid, roomId),
		privileges.global.can('chat', uid),
		checkReputation(uid),
	]);

	if (!inRoom) {
		throw new Error('[[error:not-in-room]]');
	}

	if (!canChat) {
		throw new Error('[[error:no-privileges]]');
	}

	await plugins.hooks.fire('static:messaging.canMessageRoom', {
		uid,
		roomId,
	});
};

async function checkReputation(uid) {
	if (meta.config['min:rep:chat'] > 0) {
		const reputation = await user.getUserField(uid, 'reputation');
		if (meta.config['min:rep:chat'] > reputation) {
			throw new Error(`[[error:not-enough-reputation-to-chat, ${meta.config['min:rep:chat']}]]`);
		}
	}
}

Messaging.hasPrivateChat = async (uid, withUid) => {
	if (Number.parseInt(uid, 10) === Number.parseInt(withUid, 10)) {
		return 0;
	}

	const results = await utils.promiseParallel({
		myRooms: db.getSortedSetRevRange(`uid:${uid}:chat:rooms`, 0, -1),
		theirRooms: db.getSortedSetRevRange(`uid:${withUid}:chat:rooms`, 0, -1),
	});
	const roomIds = results.myRooms.filter(roomId => roomId && results.theirRooms.includes(roomId));

	if (roomIds.length === 0) {
		return 0;
	}

	let index = 0;
	let roomId = 0;
	while (index < roomIds.length && !roomId) {
		/* eslint-disable no-await-in-loop */
		const count = await Messaging.getUserCountInRoom(roomIds[index]);
		if (count === 2) {
			roomId = roomIds[index];
		} else {
			index += 1;
		}
	}

	return roomId;
};

Messaging.canViewMessage = async (mids, roomId, uid) => {
	let single = false;
	if (!Array.isArray(mids) && isFinite(mids)) {
		mids = [mids];
		single = true;
	}

	const canView = await db.isSortedSetMembers(`uid:${uid}:chat:room:${roomId}:mids`, mids);
	return single ? canView.pop() : canView;
};

require('../promisify')(Messaging);
