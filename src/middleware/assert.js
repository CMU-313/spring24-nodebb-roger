'use strict';

/**
 * The middlewares here strictly act to "assert" validity of the incoming
 * payload and throw an error otherwise.
 */

const path = require('node:path');
const nconf = require('nconf');
const file = require('../file');
const user = require('../user');
const groups = require('../groups');
const topics = require('../topics');
const posts = require('../posts');
const messaging = require('../messaging');
const flags = require('../flags');
const slugify = require('../slugify');
const controllerHelpers = require('../controllers/helpers');
const helpers = require('./helpers');

const Assert = module.exports;

Assert.user = helpers.try(async (request, res, next) => {
	if (!await user.exists(request.params.uid)) {
		return controllerHelpers.formatApiResponse(404, res, new Error('[[error:no-user]]'));
	}

	next();
});

Assert.group = helpers.try(async (request, res, next) => {
	const name = await groups.getGroupNameByGroupSlug(request.params.slug);
	if (!name || !await groups.exists(name)) {
		return controllerHelpers.formatApiResponse(404, res, new Error('[[error:no-group]]'));
	}

	next();
});

Assert.topic = helpers.try(async (request, res, next) => {
	if (!await topics.exists(request.params.tid)) {
		return controllerHelpers.formatApiResponse(404, res, new Error('[[error:no-topic]]'));
	}

	next();
});

Assert.post = helpers.try(async (request, res, next) => {
	if (!await posts.exists(request.params.pid)) {
		return controllerHelpers.formatApiResponse(404, res, new Error('[[error:no-post]]'));
	}

	next();
});

Assert.flag = helpers.try(async (request, res, next) => {
	const canView = await flags.canView(request.params.flagId, request.uid);
	if (!canView) {
		return controllerHelpers.formatApiResponse(404, res, new Error('[[error:no-flag]]'));
	}

	next();
});

Assert.path = helpers.try(async (request, res, next) => {
	// File: URL support
	if (request.body.path.startsWith('file:///')) {
		request.body.path = new URL(request.body.path).pathname;
	}

	// Strip upload_url if found
	if (request.body.path.startsWith(nconf.get('upload_url'))) {
		request.body.path = request.body.path.slice(nconf.get('upload_url').length);
	}

	const pathToFile = path.join(nconf.get('upload_path'), request.body.path);
	res.locals.cleanedPath = pathToFile;

	// Guard against path traversal
	if (!pathToFile.startsWith(nconf.get('upload_path'))) {
		return controllerHelpers.formatApiResponse(403, res, new Error('[[error:invalid-path]]'));
	}

	if (!await file.exists(pathToFile)) {
		return controllerHelpers.formatApiResponse(404, res, new Error('[[error:invalid-path]]'));
	}

	next();
});

Assert.folderName = helpers.try(async (request, res, next) => {
	const folderName = slugify(path.basename(request.body.folderName.trim()));
	const folderPath = path.join(res.locals.cleanedPath, folderName);

	// Slugify removes invalid characters, folderName may become empty
	if (!folderName) {
		return controllerHelpers.formatApiResponse(403, res, new Error('[[error:invalid-path]]'));
	}

	if (await file.exists(folderPath)) {
		return controllerHelpers.formatApiResponse(403, res, new Error('[[error:folder-exists]]'));
	}

	res.locals.folderPath = folderPath;

	next();
});

Assert.room = helpers.try(async (request, res, next) => {
	if (!isFinite(request.params.roomId)) {
		return controllerHelpers.formatApiResponse(400, res, new Error('[[error:invalid-data]]'));
	}

	const [exists, inRoom] = await Promise.all([
		await messaging.roomExists(request.params.roomId),
		await messaging.isUserInRoom(request.uid, request.params.roomId),
	]);

	if (!exists) {
		return controllerHelpers.formatApiResponse(404, res, new Error('[[error:chat-room-does-not-exist]]'));
	}

	if (!inRoom) {
		return controllerHelpers.formatApiResponse(403, res, new Error('[[error:no-privileges]]'));
	}

	next();
});

Assert.message = helpers.try(async (request, res, next) => {
	if (
		!isFinite(request.params.mid)
        || !(await messaging.messageExists(request.params.mid))
        || !(await messaging.canViewMessage(request.params.mid, request.params.roomId, request.uid))
	) {
		return controllerHelpers.formatApiResponse(400, res, new Error('[[error:invalid-mid]]'));
	}

	next();
});
