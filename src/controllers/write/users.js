'use strict';

const util = require('node:util');
const nconf = require('nconf');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs').promises;
const db = require('../../database');
const api = require('../../api');
const groups = require('../../groups');
const meta = require('../../meta');
const privileges = require('../../privileges');
const user = require('../../user');
const utils = require('../../utils');
const helpers = require('../helpers');

const Users = module.exports;

const exportMetadata = new Map([
	['posts', ['csv', 'text/csv']],
	['uploads', ['zip', 'application/zip']],
	['profile', ['json', 'application/json']],
]);

const hasAdminPrivilege = async (uid, privilege) => {
	const ok = await privileges.admin.can(`admin:${privilege}`, uid);
	if (!ok) {
		throw new Error('[[error:no-privileges]]');
	}
};

Users.redirectBySlug = async (request, res) => {
	const uid = await user.getUidByUserslug(request.params.userslug);

	if (uid) {
		const path = request.path.split('/').slice(3).join('/');
		const urlObject = new URL(nconf.get('url') + request.url);
		res.redirect(308, nconf.get('relative_path') + encodeURI(`/api/v3/users/${uid}/${path}${urlObject.search}`));
	} else {
		helpers.formatApiResponse(404, res);
	}
};

Users.create = async (request, res) => {
	await hasAdminPrivilege(request.uid, 'users');
	const userObject = await api.users.create(request, request.body);
	helpers.formatApiResponse(200, res, userObject);
};

Users.exists = async (request, res) => {
	helpers.formatApiResponse(200, res);
};

Users.get = async (request, res) => {
	const userData = await user.getUserData(request.params.uid);
	const publicUserData = await user.hidePrivateData(userData, request.uid);
	helpers.formatApiResponse(200, res, publicUserData);
};

Users.update = async (request, res) => {
	const userObject = await api.users.update(request, {...request.body, uid: request.params.uid});
	helpers.formatApiResponse(200, res, userObject);
};

Users.delete = async (request, res) => {
	await api.users.delete(request, {...request.params, password: request.body.password});
	helpers.formatApiResponse(200, res);
};

Users.deleteContent = async (request, res) => {
	await api.users.deleteContent(request, {...request.params, password: request.body.password});
	helpers.formatApiResponse(200, res);
};

Users.deleteAccount = async (request, res) => {
	await api.users.deleteAccount(request, {...request.params, password: request.body.password});
	helpers.formatApiResponse(200, res);
};

Users.deleteMany = async (request, res) => {
	await hasAdminPrivilege(request.uid, 'users');
	await api.users.deleteMany(request, request.body);
	helpers.formatApiResponse(200, res);
};

Users.changePicture = async (request, res) => {
	await api.users.changePicture(request, {...request.body, uid: request.params.uid});
	helpers.formatApiResponse(200, res);
};

Users.updateSettings = async (request, res) => {
	const settings = await api.users.updateSettings(request, {...request.body, uid: request.params.uid});
	helpers.formatApiResponse(200, res, settings);
};

Users.changePassword = async (request, res) => {
	await api.users.changePassword(request, {...request.body, uid: request.params.uid});
	helpers.formatApiResponse(200, res);
};

Users.follow = async (request, res) => {
	await api.users.follow(request, request.params);
	helpers.formatApiResponse(200, res);
};

Users.unfollow = async (request, res) => {
	await api.users.unfollow(request, request.params);
	helpers.formatApiResponse(200, res);
};

Users.ban = async (request, res) => {
	await api.users.ban(request, {...request.body, uid: request.params.uid});
	helpers.formatApiResponse(200, res);
};

Users.unban = async (request, res) => {
	await api.users.unban(request, {...request.body, uid: request.params.uid});
	helpers.formatApiResponse(200, res);
};

Users.mute = async (request, res) => {
	await api.users.mute(request, {...request.body, uid: request.params.uid});
	helpers.formatApiResponse(200, res);
};

Users.unmute = async (request, res) => {
	await api.users.unmute(request, {...request.body, uid: request.params.uid});
	helpers.formatApiResponse(200, res);
};

Users.generateToken = async (request, res) => {
	await hasAdminPrivilege(request.uid, 'settings');
	if (Number.parseInt(request.params.uid, 10) !== Number.parseInt(request.user.uid, 10)) {
		return helpers.formatApiResponse(401, res);
	}

	const settings = await meta.settings.get('core.api');
	settings.tokens = settings.tokens || [];

	const newToken = {
		token: utils.generateUUID(),
		uid: request.user.uid,
		description: request.body.description || '',
		timestamp: Date.now(),
	};
	settings.tokens.push(newToken);
	await meta.settings.set('core.api', settings);
	helpers.formatApiResponse(200, res, newToken);
};

Users.deleteToken = async (request, res) => {
	await hasAdminPrivilege(request.uid, 'settings');
	if (Number.parseInt(request.params.uid, 10) !== Number.parseInt(request.user.uid, 10)) {
		return helpers.formatApiResponse(401, res);
	}

	const settings = await meta.settings.get('core.api');
	const beforeLength = settings.tokens.length;
	settings.tokens = settings.tokens.filter(tokenObject => tokenObject.token !== request.params.token);
	if (beforeLength === settings.tokens.length) {
		helpers.formatApiResponse(404, res);
	} else {
		await meta.settings.set('core.api', settings);
		helpers.formatApiResponse(200, res);
	}
};

const getSessionAsync = util.promisify((sid, callback) => {
	db.sessionStore.get(sid, (error, sessionObject) => callback(error, sessionObject || null));
});

Users.revokeSession = async (request, res) => {
	// Only admins or global mods (besides the user themselves) can revoke sessions
	if (Number.parseInt(request.params.uid, 10) !== request.uid && !await user.isAdminOrGlobalMod(request.uid)) {
		return helpers.formatApiResponse(404, res);
	}

	const sids = await db.getSortedSetRange(`uid:${request.params.uid}:sessions`, 0, -1);
	let _id;
	for (const sid of sids) {
		/* eslint-disable no-await-in-loop */
		const sessionObject = await getSessionAsync(sid);
		if (sessionObject && sessionObject.meta && sessionObject.meta.uuid === request.params.uuid) {
			_id = sid;
			break;
		}
	}

	if (!_id) {
		throw new Error('[[error:no-session-found]]');
	}

	await user.auth.revokeSession(_id, request.params.uid);
	helpers.formatApiResponse(200, res);
};

Users.invite = async (request, res) => {
	const {emails, groupsToJoin = []} = request.body;

	if (!emails || !Array.isArray(groupsToJoin)) {
		return helpers.formatApiResponse(400, res, new Error('[[error:invalid-data]]'));
	}

	// For simplicity, this API route is restricted to self-use only. This can change if needed.
	if (Number.parseInt(request.user.uid, 10) !== Number.parseInt(request.params.uid, 10)) {
		return helpers.formatApiResponse(403, res, new Error('[[error:no-privileges]]'));
	}

	const canInvite = await privileges.users.hasInvitePrivilege(request.uid);
	if (!canInvite) {
		return helpers.formatApiResponse(403, res, new Error('[[error:no-privileges]]'));
	}

	const {registrationType} = meta.config;
	const isAdmin = await user.isAdministrator(request.uid);
	if (registrationType === 'admin-invite-only' && !isAdmin) {
		return helpers.formatApiResponse(403, res, new Error('[[error:no-privileges]]'));
	}

	const inviteGroups = new Set((await groups.getUserInviteGroups(request.uid)).map(group => group.name));
	const cannotInvite = groupsToJoin.some(group => !inviteGroups.has(group));
	if (groupsToJoin.length > 0 && cannotInvite) {
		return helpers.formatApiResponse(403, res, new Error('[[error:no-privileges]]'));
	}

	const max = meta.config.maximumInvites;
	const emailsArray = emails.split(',').map(email => email.trim()).filter(Boolean);

	for (const email of emailsArray) {
		/* eslint-disable no-await-in-loop */
		let invites = 0;
		if (max) {
			invites = await user.getInvitesNumber(request.uid);
		}

		if (!isAdmin && max && invites >= max) {
			return helpers.formatApiResponse(403, res, new Error(`[[error:invite-maximum-met, ${invites}, ${max}]]`));
		}

		await user.sendInvitationEmail(request.uid, email, groupsToJoin);
	}

	return helpers.formatApiResponse(200, res);
};

Users.getInviteGroups = async function (request, res) {
	if (Number.parseInt(request.params.uid, 10) !== Number.parseInt(request.user.uid, 10)) {
		return helpers.formatApiResponse(401, res);
	}

	const userInviteGroups = await groups.getUserInviteGroups(request.params.uid);
	return helpers.formatApiResponse(200, res, userInviteGroups.map(group => group.displayName));
};

Users.listEmails = async (request, res) => {
	const [isPrivileged, {showemail}] = await Promise.all([
		user.isPrivileged(request.uid),
		user.getSettings(request.params.uid),
	]);
	const isSelf = request.uid === Number.parseInt(request.params.uid, 10);

	if (isSelf || isPrivileged || showemail) {
		const emails = await db.getSortedSetRangeByScore('email:uid', 0, 500, request.params.uid, request.params.uid);
		helpers.formatApiResponse(200, res, {emails});
	} else {
		helpers.formatApiResponse(204, res);
	}
};

Users.getEmail = async (request, res) => {
	const [isPrivileged, {showemail}, exists] = await Promise.all([
		user.isPrivileged(request.uid),
		user.getSettings(request.params.uid),
		db.isSortedSetMember('email:uid', request.params.email.toLowerCase()),
	]);
	const isSelf = request.uid === Number.parseInt(request.params.uid, 10);

	if (exists && (isSelf || isPrivileged || showemail)) {
		helpers.formatApiResponse(204, res);
	} else {
		helpers.formatApiResponse(404, res);
	}
};

Users.confirmEmail = async (request, res) => {
	const [pending, current, canManage] = await Promise.all([
		user.email.isValidationPending(request.params.uid, request.params.email),
		user.getUserField(request.params.uid, 'email'),
		privileges.admin.can('admin:users', request.uid),
	]);

	if (!canManage) {
		return helpers.notAllowed(request, res);
	}

	if (pending) { // Has active confirmation request
		const code = await db.get(`confirm:byUid:${request.params.uid}`);
		await user.email.confirmByCode(code, request.session.id);
		helpers.formatApiResponse(200, res);
	} else if (current && current === request.params.email) { // Email in user hash (i.e. email passed into user.create)
		await user.email.confirmByUid(request.params.uid);
		helpers.formatApiResponse(200, res);
	} else {
		helpers.formatApiResponse(404, res);
	}
};

const prepareExport = async (request, res) => {
	const [extension] = exportMetadata.get(request.params.type);
	const filename = `${request.params.uid}_${request.params.type}.${extension}`;
	try {
		const stat = await fs.stat(path.join(__dirname, '../../../build/export', filename));
		const modified = new Date(stat.mtimeMs);
		res.set('Last-Modified', modified.toUTCString());
		res.set('ETag', `"${crypto.createHash('md5').update(String(stat.mtimeMs)).digest('hex')}"`);
		res.status(204);
		return true;
	} catch {
		res.status(404);
		return false;
	}
};

Users.checkExportByType = async (request, res) => {
	await prepareExport(request, res);
	res.end();
};

Users.getExportByType = async (request, res) => {
	const [extension, mime] = exportMetadata.get(request.params.type);
	const filename = `${request.params.uid}_${request.params.type}.${extension}`;

	const exists = await prepareExport(request, res);
	if (!exists) {
		return res.end();
	}

	res.status(200);
	res.sendFile(filename, {
		root: path.join(__dirname, '../../../build/export'),
		headers: {
			'Content-Type': mime,
			'Content-Disposition': `attachment; filename=${filename}`,
		},
	}, error => {
		if (error) {
			throw error;
		}
	});
};

Users.generateExportsByType = async (request, res) => {
	await api.users.generateExport(request, request.params);
	helpers.formatApiResponse(202, res);
};
