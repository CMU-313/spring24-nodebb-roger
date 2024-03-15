'use strict';

const validator = require('validator');
const db = require('../../database');
const api = require('../../api');
const topics = require('../../topics');
const privileges = require('../../privileges');
const helpers = require('../helpers');
const middleware = require('../../middleware');
const uploadsController = require('../uploads');

const Topics = module.exports;

Topics.get = async (request, res) => {
	helpers.formatApiResponse(200, res, await api.topics.get(request, request.params));
};

Topics.create = async (request, res) => {
	const id = await lockPosting(request, '[[error:already-posting]]');
	try {
		const payload = await api.topics.create(request, request.body);
		if (payload.queued) {
			helpers.formatApiResponse(202, res, payload);
		} else {
			helpers.formatApiResponse(200, res, payload);
		}
	} finally {
		await db.deleteObjectField('locks', id);
	}
};

Topics.reply = async (request, res) => {
	const id = await lockPosting(request, '[[error:already-posting]]');
	try {
		const payload = await api.topics.reply(request, {...request.body, tid: request.params.tid});
		helpers.formatApiResponse(200, res, payload);
	} finally {
		await db.deleteObjectField('locks', id);
	}
};

async function lockPosting(request, error) {
	const id = request.uid > 0 ? request.uid : request.sessionID;
	const value = `posting${id}`;
	const count = await db.incrObjectField('locks', value);
	if (count > 1) {
		throw new Error(error);
	}

	return value;
}

Topics.delete = async (request, res) => {
	await api.topics.delete(request, {tids: [request.params.tid]});
	helpers.formatApiResponse(200, res);
};

Topics.restore = async (request, res) => {
	await api.topics.restore(request, {tids: [request.params.tid]});
	helpers.formatApiResponse(200, res);
};

Topics.private = async (request, res) => {
	await api.topics.private(request, {tids: [request.params.tid]});
	helpers.formatApiResponse(200, res);
};

Topics.public = async (request, res) => {
	await api.topics.public(request, {tids: [request.params.tid]});
	helpers.formatApiResponse(200, res);
};

Topics.purge = async (request, res) => {
	await api.topics.purge(request, {tids: [request.params.tid]});
	helpers.formatApiResponse(200, res);
};

Topics.pin = async (request, res) => {
	// Pin expiry was not available w/ sockets hence not included in api lib method
	if (request.body.expiry) {
		await topics.tools.setPinExpiry(request.params.tid, request.body.expiry, request.uid);
	}

	await api.topics.pin(request, {tids: [request.params.tid]});

	helpers.formatApiResponse(200, res);
};

Topics.unpin = async (request, res) => {
	await api.topics.unpin(request, {tids: [request.params.tid]});
	helpers.formatApiResponse(200, res);
};

Topics.lock = async (request, res) => {
	await api.topics.lock(request, {tids: [request.params.tid]});
	helpers.formatApiResponse(200, res);
};

Topics.unlock = async (request, res) => {
	await api.topics.unlock(request, {tids: [request.params.tid]});
	helpers.formatApiResponse(200, res);
};

Topics.follow = async (request, res) => {
	await api.topics.follow(request, request.params);
	helpers.formatApiResponse(200, res);
};

Topics.ignore = async (request, res) => {
	await api.topics.ignore(request, request.params);
	helpers.formatApiResponse(200, res);
};

Topics.unfollow = async (request, res) => {
	await api.topics.unfollow(request, request.params);
	helpers.formatApiResponse(200, res);
};

Topics.addTags = async (request, res) => {
	if (!await privileges.topics.canEdit(request.params.tid, request.user.uid)) {
		return helpers.formatApiResponse(403, res);
	}

	const cid = await topics.getTopicField(request.params.tid, 'cid');
	await topics.validateTags(request.body.tags, cid, request.user.uid, request.params.tid);
	const tags = await topics.filterTags(request.body.tags);

	await topics.addTags(tags, [request.params.tid]);
	helpers.formatApiResponse(200, res);
};

Topics.deleteTags = async (request, res) => {
	if (!await privileges.topics.canEdit(request.params.tid, request.user.uid)) {
		return helpers.formatApiResponse(403, res);
	}

	await topics.deleteTopicTags(request.params.tid);
	helpers.formatApiResponse(200, res);
};

Topics.getThumbs = async (request, res) => {
	if (isFinite(request.params.tid)) { // Post_uuids can be passed in occasionally, in that case no checks are necessary
		const [exists, canRead] = await Promise.all([
			topics.exists(request.params.tid),
			privileges.topics.can('topics:read', request.params.tid, request.uid),
		]);
		if (!exists || !canRead) {
			return helpers.formatApiResponse(403, res);
		}
	}

	helpers.formatApiResponse(200, res, await topics.thumbs.get(request.params.tid));
};

Topics.addThumb = async (request, res) => {
	await checkThumbPrivileges({tid: request.params.tid, uid: request.user.uid, res});
	if (res.headersSent) {
		return;
	}

	const files = await uploadsController.uploadThumb(request, res); // Response is handled here

	// Add uploaded files to topic zset
	if (files && files.length > 0) {
		await Promise.all(files.map(async fileObject => {
			await topics.thumbs.associate({
				id: request.params.tid,
				path: fileObject.path || fileObject.url,
			});
		}));
	}
};

Topics.migrateThumbs = async (request, res) => {
	await Promise.all([
		checkThumbPrivileges({tid: request.params.tid, uid: request.user.uid, res}),
		checkThumbPrivileges({tid: request.body.tid, uid: request.user.uid, res}),
	]);
	if (res.headersSent) {
		return;
	}

	await topics.thumbs.migrate(request.params.tid, request.body.tid);
	helpers.formatApiResponse(200, res);
};

Topics.deleteThumb = async (request, res) => {
	if (!request.body.path.startsWith('http')) {
		await middleware.assert.path(request, res, () => {});
		if (res.headersSent) {
			return;
		}
	}

	await checkThumbPrivileges({tid: request.params.tid, uid: request.user.uid, res});
	if (res.headersSent) {
		return;
	}

	await topics.thumbs.delete(request.params.tid, request.body.path);
	helpers.formatApiResponse(200, res, await topics.thumbs.get(request.params.tid));
};

Topics.reorderThumbs = async (request, res) => {
	await checkThumbPrivileges({tid: request.params.tid, uid: request.user.uid, res});
	if (res.headersSent) {
		return;
	}

	const exists = await topics.thumbs.exists(request.params.tid, request.body.path);
	if (!exists) {
		return helpers.formatApiResponse(404, res);
	}

	await topics.thumbs.associate({
		id: request.params.tid,
		path: request.body.path,
		score: request.body.order,
	});
	helpers.formatApiResponse(200, res);
};

async function checkThumbPrivileges({tid, uid, res}) {
	// Req.params.tid could be either a tid (pushing a new thumb to an existing topic)
	// or a post UUID (a new topic being composed)
	const isUUID = validator.isUUID(tid);

	// Sanity-check the tid if it's strictly not a uuid
	if (!isUUID && (isNaN(Number.parseInt(tid, 10)) || !await topics.exists(tid))) {
		return helpers.formatApiResponse(404, res, new Error('[[error:no-topic]]'));
	}

	// While drafts are not protected, tids are
	if (!isUUID && !await privileges.topics.canEdit(tid, uid)) {
		return helpers.formatApiResponse(403, res, new Error('[[error:no-privileges]]'));
	}
}

Topics.getEvents = async (request, res) => {
	if (!await privileges.topics.can('topics:read', request.params.tid, request.uid)) {
		return helpers.formatApiResponse(403, res);
	}

	helpers.formatApiResponse(200, res, await topics.events.get(request.params.tid, request.uid));
};

Topics.deleteEvent = async (request, res) => {
	if (!await privileges.topics.isAdminOrMod(request.params.tid, request.uid)) {
		return helpers.formatApiResponse(403, res);
	}

	await topics.events.purge(request.params.tid, [request.params.eventId]);
	helpers.formatApiResponse(200, res);
};
