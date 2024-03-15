'use strict';

const api = require('../../api');
const messaging = require('../../messaging');
const helpers = require('../helpers');

const Chats = module.exports;

Chats.list = async (request, res) => {
	const page = (isFinite(request.query.page) && Number.parseInt(request.query.page, 10)) || 1;
	const perPage = (isFinite(request.query.perPage) && Number.parseInt(request.query.perPage, 10)) || 20;
	const start = Math.max(0, page - 1) * perPage;
	const stop = start + perPage;
	const {rooms} = await messaging.getRecentChats(request.uid, request.uid, start, stop);

	helpers.formatApiResponse(200, res, {rooms});
};

Chats.create = async (request, res) => {
	const roomObject = await api.chats.create(request, request.body);
	helpers.formatApiResponse(200, res, roomObject);
};

Chats.exists = async (request, res) => {
	helpers.formatApiResponse(200, res);
};

Chats.get = async (request, res) => {
	const roomObject = await messaging.loadRoom(request.uid, {
		uid: request.query.uid || request.uid,
		roomId: request.params.roomId,
	});

	helpers.formatApiResponse(200, res, roomObject);
};

Chats.post = async (request, res) => {
	const messageObject = await api.chats.post(request, {
		...request.body,
		roomId: request.params.roomId,
	});

	helpers.formatApiResponse(200, res, messageObject);
};

Chats.rename = async (request, res) => {
	const roomObject = await api.chats.rename(request, {
		...request.body,
		roomId: request.params.roomId,
	});

	helpers.formatApiResponse(200, res, roomObject);
};

Chats.users = async (request, res) => {
	const users = await api.chats.users(request, {
		...request.params,
	});
	helpers.formatApiResponse(200, res, users);
};

Chats.invite = async (request, res) => {
	const users = await api.chats.invite(request, {
		...request.body,
		roomId: request.params.roomId,
	});

	helpers.formatApiResponse(200, res, users);
};

Chats.kick = async (request, res) => {
	const users = await api.chats.kick(request, {
		...request.body,
		roomId: request.params.roomId,
	});

	helpers.formatApiResponse(200, res, users);
};

Chats.kickUser = async (request, res) => {
	request.body.uids = [request.params.uid];
	const users = await api.chats.kick(request, {
		...request.body,
		roomId: request.params.roomId,
	});

	helpers.formatApiResponse(200, res, users);
};

Chats.messages = {};
Chats.messages.list = async (request, res) => {
	const messages = await messaging.getMessages({
		callerUid: request.uid,
		uid: request.query.uid || request.uid,
		roomId: request.params.roomId,
		start: Number.parseInt(request.query.start, 10) || 0,
		count: 50,
	});

	helpers.formatApiResponse(200, res, {messages});
};

Chats.messages.get = async (request, res) => {
	const messages = await messaging.getMessagesData([request.params.mid], request.uid, request.params.roomId, false);
	helpers.formatApiResponse(200, res, messages.pop());
};

Chats.messages.edit = async (request, res) => {
	await messaging.canEdit(request.params.mid, request.uid);
	await messaging.editMessage(request.uid, request.params.mid, request.params.roomId, request.body.message);

	const messages = await messaging.getMessagesData([request.params.mid], request.uid, request.params.roomId, false);
	helpers.formatApiResponse(200, res, messages.pop());
};

Chats.messages.delete = async (request, res) => {
	await messaging.canDelete(request.params.mid, request.uid);
	await messaging.deleteMessage(request.params.mid, request.uid);

	helpers.formatApiResponse(200, res);
};

Chats.messages.restore = async (request, res) => {
	await messaging.canDelete(request.params.mid, request.uid);
	await messaging.restoreMessage(request.params.mid, request.uid);

	helpers.formatApiResponse(200, res);
};
