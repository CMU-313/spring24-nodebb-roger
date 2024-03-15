'use strict';

const util = require('node:util');
const winston = require('winston');
const validator = require('validator');
const _ = require('lodash');
const db = require('../database');
const meta = require('../meta');
const events = require('../events');
const batch = require('../batch');
const utils = require('../utils');

module.exports = function (User) {
	User.auth = {};

	User.auth.logAttempt = async function (uid, ip) {
		if (!(Number.parseInt(uid, 10) > 0)) {
			return;
		}

		const exists = await db.exists(`lockout:${uid}`);
		if (exists) {
			throw new Error('[[error:account-locked]]');
		}

		const attempts = await db.increment(`loginAttempts:${uid}`);
		if (attempts <= meta.config.loginAttempts) {
			return await db.pexpire(`loginAttempts:${uid}`, 1000 * 60 * 60);
		}

		// Lock out the account
		await db.set(`lockout:${uid}`, '');
		const duration = 1000 * 60 * meta.config.lockoutDuration;

		await db.delete(`loginAttempts:${uid}`);
		await db.pexpire(`lockout:${uid}`, duration);
		await events.log({
			type: 'account-locked',
			uid,
			ip,
		});
		throw new Error('[[error:account-locked]]');
	};

	User.auth.getFeedToken = async function (uid) {
		if (!(Number.parseInt(uid, 10) > 0)) {
			return;
		}

		const _token = await db.getObjectField(`user:${uid}`, 'rss_token');
		const token = _token || utils.generateUUID();
		if (!_token) {
			await User.setUserField(uid, 'rss_token', token);
		}

		return token;
	};

	User.auth.clearLoginAttempts = async function (uid) {
		await db.delete(`loginAttempts:${uid}`);
	};

	User.auth.resetLockout = async function (uid) {
		await db.deleteAll([
			`loginAttempts:${uid}`,
			`lockout:${uid}`,
		]);
	};

	const getSessionFromStore = util.promisify(
		(sid, callback) => db.sessionStore.get(sid, (error, sessObject) => callback(error, sessObject || null)),
	);
	const sessionStoreDestroy = util.promisify(
		(sid, callback) => db.sessionStore.destroy(sid, error => callback(error)),
	);

	User.auth.getSessions = async function (uid, currentSessionId) {
		await cleanExpiredSessions(uid);
		const sids = await db.getSortedSetRevRange(`uid:${uid}:sessions`, 0, 19);
		let sessions = await Promise.all(sids.map(sid => getSessionFromStore(sid)));
		sessions = sessions.map((sessObject, index) => {
			if (sessObject && sessObject.meta) {
				sessObject.meta.current = currentSessionId === sids[index];
				sessObject.meta.datetimeISO = new Date(sessObject.meta.datetime).toISOString();
				sessObject.meta.ip = validator.escape(String(sessObject.meta.ip));
			}

			return sessObject && sessObject.meta;
		}).filter(Boolean);
		return sessions;
	};

	async function cleanExpiredSessions(uid) {
		const uuidMapping = await db.getObject(`uid:${uid}:sessionUUID:sessionId`);
		if (!uuidMapping) {
			return;
		}

		const expiredUUIDs = [];
		const expiredSids = [];
		await Promise.all(Object.keys(uuidMapping).map(async uuid => {
			const sid = uuidMapping[uuid];
			const sessionObject = await getSessionFromStore(sid);
			const expired = !sessionObject || !sessionObject.hasOwnProperty('passport')
                || !sessionObject.passport.hasOwnProperty('user')
                || Number.parseInt(sessionObject.passport.user, 10) !== Number.parseInt(uid, 10);
			if (expired) {
				expiredUUIDs.push(uuid);
				expiredSids.push(sid);
			}
		}));
		await db.deleteObjectFields(`uid:${uid}:sessionUUID:sessionId`, expiredUUIDs);
		await db.sortedSetRemove(`uid:${uid}:sessions`, expiredSids);
	}

	User.auth.addSession = async function (uid, sessionId) {
		if (!(Number.parseInt(uid, 10) > 0)) {
			return;
		}

		await cleanExpiredSessions(uid);
		await db.sortedSetAdd(`uid:${uid}:sessions`, Date.now(), sessionId);
		await revokeSessionsAboveThreshold(uid, meta.config.maxUserSessions);
	};

	async function revokeSessionsAboveThreshold(uid, maxUserSessions) {
		const activeSessions = await db.getSortedSetRange(`uid:${uid}:sessions`, 0, -1);
		if (activeSessions.length > maxUserSessions) {
			const sessionsToRevoke = activeSessions.slice(0, activeSessions.length - maxUserSessions);
			await Promise.all(sessionsToRevoke.map(sessionId => User.auth.revokeSession(sessionId, uid)));
		}
	}

	User.auth.revokeSession = async function (sessionId, uid) {
		winston.verbose(`[user.auth] Revoking session ${sessionId} for user ${uid}`);
		const sessionObject = await getSessionFromStore(sessionId);
		if (sessionObject && sessionObject.meta && sessionObject.meta.uuid) {
			await db.deleteObjectField(`uid:${uid}:sessionUUID:sessionId`, sessionObject.meta.uuid);
		}

		await Promise.all([
			db.sortedSetRemove(`uid:${uid}:sessions`, sessionId),
			sessionStoreDestroy(sessionId),
		]);
	};

	User.auth.revokeAllSessions = async function (uids, except) {
		uids = Array.isArray(uids) ? uids : [uids];
		const sids = await db.getSortedSetsMembers(uids.map(uid => `uid:${uid}:sessions`));
		const promises = [];
		for (const [index, uid] of uids.entries()) {
			const ids = sids[index].filter(id => id !== except);
			if (ids.length > 0) {
				promises.push(ids.map(s => User.auth.revokeSession(s, uid)));
			}
		}

		await Promise.all(promises);
	};

	User.auth.deleteAllSessions = async function () {
		await batch.processSortedSet('users:joindate', async uids => {
			const sessionKeys = uids.map(uid => `uid:${uid}:sessions`);
			const sessionUUIDKeys = uids.map(uid => `uid:${uid}:sessionUUID:sessionId`);
			const sids = (await db.getSortedSetRange(sessionKeys, 0, -1)).flat();

			await Promise.all([
				db.deleteAll(sessionKeys.concat(sessionUUIDKeys)),
				...sids.map(sid => sessionStoreDestroy(sid)),
			]);
		}, {batch: 1000});
	};
};
