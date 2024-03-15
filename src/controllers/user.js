'use strict';

const path = require('node:path');
const winston = require('winston');
const user = require('../user');
const privileges = require('../privileges');
const accountHelpers = require('./accounts/helpers');

const userController = module.exports;

userController.getCurrentUser = async function (request, res) {
	if (!request.loggedIn) {
		return res.status(401).json('not-authorized');
	}

	const userslug = await user.getUserField(request.uid, 'userslug');
	const userData = await accountHelpers.getUserDataByUserSlug(userslug, request.uid, request.query);
	res.json(userData);
};

userController.getUserByUID = async function (request, res, next) {
	await byType('uid', request, res, next);
};

userController.getUserByUsername = async function (request, res, next) {
	await byType('username', request, res, next);
};

userController.getUserByEmail = async function (request, res, next) {
	await byType('email', request, res, next);
};

async function byType(type, request, res, next) {
	const userData = await userController.getUserDataByField(request.uid, type, request.params[type]);
	if (!userData) {
		return next();
	}

	res.json(userData);
}

userController.getUserDataByField = async function (callerUid, field, fieldValue) {
	let uid = null;
	switch (field) {
		case 'uid': {
			uid = fieldValue;

			break;
		}

		case 'username': {
			uid = await user.getUidByUsername(fieldValue);

			break;
		}

		case 'email': {
			uid = await user.getUidByEmail(fieldValue);
			if (uid) {
				const isPrivileged = await user.isAdminOrGlobalMod(callerUid);
				const settings = await user.getSettings(uid);
				if (!isPrivileged && (settings && !settings.showemail)) {
					uid = 0;
				}
			}

			break;
		}
	// No default
	}

	if (!uid) {
		return null;
	}

	return await userController.getUserDataByUID(callerUid, uid);
};

userController.getUserDataByUID = async function (callerUid, uid) {
	if (!Number.parseInt(uid, 10)) {
		throw new Error('[[error:no-user]]');
	}

	const canView = await privileges.global.can('view:users', callerUid);
	if (!canView) {
		throw new Error('[[error:no-privileges]]');
	}

	let userData = await user.getUserData(uid);
	if (!userData) {
		throw new Error('[[error:no-user]]');
	}

	userData = await user.hidePrivateData(userData, callerUid);

	return userData;
};

userController.exportPosts = async function (request, res, next) {
	sendExport(`${res.locals.uid}_posts.csv`, 'text/csv', res, next);
};

userController.exportUploads = function (request, res, next) {
	sendExport(`${res.locals.uid}_uploads.zip`, 'application/zip', res, next);
};

userController.exportProfile = async function (request, res, next) {
	sendExport(`${res.locals.uid}_profile.json`, 'application/json', res, next);
};

// DEPRECATED; Remove in NodeBB v3.0.0
function sendExport(filename, type, res, next) {
	winston.warn('[users/export] Access via page API is deprecated, use GET /api/v3/users/:uid/exports/:type instead.');

	res.sendFile(filename, {
		root: path.join(__dirname, '../../build/export'),
		headers: {
			'Content-Type': type,
			'Content-Disposition': `attachment; filename=${filename}`,
		},
	}, error => {
		if (error) {
			if (error.code === 'ENOENT') {
				res.locals.isAPI = false;
				return next();
			}

			return next(error);
		}
	});
}

require('../promisify')(userController, [
	'getCurrentUser',
	'getUserByUID',
	'getUserByUsername',
	'getUserByEmail',
	'exportPosts',
	'exportUploads',
	'exportProfile',
]);
