'use strict';

const util = require('node:util');
const winston = require('winston');
const passport = require('passport');
const nconf = require('nconf');
const validator = require('validator');
const _ = require('lodash');
const db = require('../database');
const meta = require('../meta');
const analytics = require('../analytics');
const user = require('../user');
const plugins = require('../plugins');
const utils = require('../utils');
const slugify = require('../slugify');
const privileges = require('../privileges');
const sockets = require('../socket.io');
const helpers = require('./helpers');

const authenticationController = module.exports;

async function registerAndLoginUser(request, res, userData) {
	if (!userData.hasOwnProperty('email')) {
		userData.updateEmail = true;
	}

	const data = await plugins.hooks.fire('filter:register.interstitial', {
		req: request,
		userData,
		interstitials: [],
	});

	// If interstitials are found, save registration attempt into session and abort
	const deferRegistration = data.interstitials.length;

	if (deferRegistration) {
		userData.register = true;
		request.session.registration = userData;

		if (request.body.noscript === 'true') {
			res.redirect(`${nconf.get('relative_path')}/register/complete`);
			return;
		}

		res.json({next: `${nconf.get('relative_path')}/register/complete`});
		return;
	}

	const queue = await user.shouldQueueUser(request.ip);
	const result = await plugins.hooks.fire('filter:register.shouldQueue', {
		req: request, res, userData, queue,
	});
	if (result.queue) {
		return await addToApprovalQueue(request, userData);
	}

	const uid = await user.create(userData);
	if (res.locals.processLogin) {
		await authenticationController.doLogin(request, uid);
	}

	// Distinguish registrations through invites from direct ones
	if (userData.token) {
		// Token has to be verified at this point
		await Promise.all([
			user.confirmIfInviteEmailIsUsed(userData.token, userData.email, uid),
			user.joinGroupsFromInvitation(uid, userData.token),
		]);
	}

	await user.deleteInvitationKey(userData.email, userData.token);
	const next = request.session.returnTo || `${nconf.get('relative_path')}/`;
	const complete = await plugins.hooks.fire('filter:register.complete', {uid, next});
	request.session.returnTo = complete.next;
	return complete;
}

authenticationController.register = async function (request, res) {
	const registrationType = meta.config.registrationType || 'normal';

	if (registrationType === 'disabled') {
		return res.sendStatus(403);
	}

	const userData = request.body;
	try {
		if (userData.token || registrationType === 'invite-only' || registrationType === 'admin-invite-only') {
			await user.verifyInvitation(userData);
		}

		if (
			!userData.username
            || userData.username.length < meta.config.minimumUsernameLength
            || slugify(userData.username).length < meta.config.minimumUsernameLength
		) {
			throw new Error('[[error:username-too-short]]');
		}

		if (userData.username.length > meta.config.maximumUsernameLength) {
			throw new Error('[[error:username-too-long]]');
		}

		if (userData.password !== userData['password-confirm']) {
			throw new Error('[[user:change_password_error_match]]');
		}

		if (userData.password.length > 512) {
			throw new Error('[[error:password-too-long]]');
		}

		if (!userData['account-type']
            || (userData['account-type'] !== 'student' && userData['account-type'] !== 'instructor')) {
			throw new Error('Invalid account type');
		}

		user.isPasswordValid(userData.password);

		res.locals.processLogin = true; // Set it to false in plugin if you wish to just register only
		await plugins.hooks.fire('filter:register.check', {req: request, res, userData});

		const data = await registerAndLoginUser(request, res, userData);
		if (data) {
			if (data.uid && request.body.userLang) {
				await user.setSetting(data.uid, 'userLang', request.body.userLang);
			}

			res.json(data);
		}
	} catch (error) {
		helpers.noScriptErrors(request, res, error.message, 400);
	}
};

async function addToApprovalQueue(request, userData) {
	userData.ip = request.ip;
	await user.addToApprovalQueue(userData);
	let message = '[[register:registration-added-to-queue]]';
	if (meta.config.showAverageApprovalTime) {
		const average_time = await db.getObjectField('registration:queue:approval:times', 'average');
		if (average_time > 0) {
			message += ` [[register:registration-queue-average-time, ${Math.floor(average_time / 60)}, ${Math.floor(average_time % 60)}]]`;
		}
	}

	if (meta.config.autoApproveTime > 0) {
		message += ` [[register:registration-queue-auto-approve-time, ${meta.config.autoApproveTime}]]`;
	}

	return {message};
}

authenticationController.registerComplete = async function (request, res) {
	try {
		// For the interstitials that respond, execute the callback with the form body
		const data = await plugins.hooks.fire('filter:register.interstitial', {
			req: request,
			userData: request.session.registration,
			interstitials: [],
		});

		const callbacks = data.interstitials.reduce((memo, current) => {
			if (current.hasOwnProperty('callback') && typeof current.callback === 'function') {
				request.body.files = request.files;
				if (
					(current.callback.constructor && current.callback.constructor.name === 'AsyncFunction')
                    || current.callback.length === 2 // Non-async function w/o callback
				) {
					memo.push(current.callback);
				} else {
					memo.push(util.promisify(current.callback));
				}
			}

			return memo;
		}, []);

		const done = function (data) {
			delete request.session.registration;
			const relative_path = nconf.get('relative_path');
			if (data && data.message) {
				return res.redirect(`${relative_path}/?register=${encodeURIComponent(data.message)}`);
			}

			if (request.session.returnTo) {
				res.redirect(relative_path + request.session.returnTo.replace(new RegExp(`^${relative_path}`), ''));
			} else {
				res.redirect(`${relative_path}/`);
			}
		};

		const results = await Promise.allSettled(callbacks.map(async callback => {
			await callback(request.session.registration, request.body);
		}));
		const errors = results.map(result => result.status === 'rejected' && result.reason && result.reason.message).filter(Boolean);
		if (errors.length > 0) {
			request.flash('errors', errors);
			return request.session.save(() => {
				res.redirect(`${nconf.get('relative_path')}/register/complete`);
			});
		}

		if (request.session.registration.register === true) {
			res.locals.processLogin = true;
			request.body.noscript = 'true'; // Trigger full page load on error

			const data = await registerAndLoginUser(request, res, request.session.registration);
			if (!data) {
				return winston.warn('[register] Interstitial callbacks processed with no errors, but one or more interstitials remain. This is likely an issue with one of the interstitials not properly handling a null case or invalid value.');
			}

			done(data);
		} else {
			// Update user hash, clear registration data in session
			const payload = request.session.registration;
			const {uid} = payload;
			delete payload.uid;
			delete payload.returnTo;

			for (const property of Object.keys(payload)) {
				if (typeof payload[property] === 'boolean') {
					payload[property] = payload[property] ? 1 : 0;
				}
			}

			await user.setUserFields(uid, payload);
			done();
		}
	} catch (error) {
		delete request.session.registration;
		res.redirect(`${nconf.get('relative_path')}/?register=${encodeURIComponent(error.message)}`);
	}
};

authenticationController.registerAbort = function (request, res) {
	if (request.uid) {
		// Clear interstitial data and continue on...
		delete request.session.registration;
		res.redirect(nconf.get('relative_path') + (request.session.returnTo || '/'));
	} else {
		// End the session and redirect to home
		request.session.destroy(() => {
			res.clearCookie(nconf.get('sessionKey'), meta.configs.cookie.get());
			res.redirect(`${nconf.get('relative_path')}/`);
		});
	}
};

authenticationController.login = async (request, res, next) => {
	let {strategy} = await plugins.hooks.fire('filter:login.override', {req: request, strategy: 'local'});
	if (!passport._strategy(strategy)) {
		winston.error(`[auth/override] Requested login strategy "${strategy}" not found, reverting back to local login strategy.`);
		strategy = 'local';
	}

	if (plugins.hooks.hasListeners('action:auth.overrideLogin')) {
		return continueLogin(strategy, request, res, next);
	}

	const loginWith = meta.config.allowLoginWith || 'username-email';
	request.body.username = String(request.body.username).trim();
	const errorHandler = res.locals.noScriptErrors || helpers.noScriptErrors;
	try {
		await plugins.hooks.fire('filter:login.check', {req: request, res, userData: request.body});
	} catch (error) {
		return errorHandler(request, res, error.message, 403);
	}

	try {
		const isEmailLogin = loginWith.includes('email') && request.body.username && utils.isEmailValid(request.body.username);
		const isUsernameLogin = loginWith.includes('username') && !validator.isEmail(request.body.username);
		if (isEmailLogin) {
			const username = await user.getUsernameByEmail(request.body.username);
			if (username !== '[[global:guest]]') {
				request.body.username = username;
			}
		}

		if (isEmailLogin || isUsernameLogin) {
			continueLogin(strategy, request, res, next);
		} else {
			errorHandler(request, res, `[[error:wrong-login-type-${loginWith}]]`, 400);
		}
	} catch (error) {
		return errorHandler(request, res, error.message, 500);
	}
};

function continueLogin(strategy, request, res, next) {
	passport.authenticate(strategy, async (error, userData, info) => {
		if (error) {
			plugins.hooks.fire('action:login.continue', {
				req: request, strategy, userData, error,
			});
			return helpers.noScriptErrors(request, res, error.data || error.message, 403);
		}

		if (!userData) {
			if (info instanceof Error) {
				info = info.message;
			} else if (typeof info === 'object') {
				info = '[[error:invalid-username-or-password]]';
			}

			plugins.hooks.fire('action:login.continue', {
				req: request, strategy, userData, error: new Error(info),
			});
			return helpers.noScriptErrors(request, res, info, 403);
		}

		// Alter user cookie depending on passed-in option
		if (request.body.remember === 'on') {
			const duration = meta.getSessionTTLSeconds() * 1000;
			request.session.cookie.maxAge = duration;
			request.session.cookie.expires = new Date(Date.now() + duration);
		} else {
			request.session.cookie.maxAge = false;
			request.session.cookie.expires = false;
		}

		plugins.hooks.fire('action:login.continue', {
			req: request, strategy, userData, error: null,
		});

		if (userData.passwordExpiry && userData.passwordExpiry < Date.now()) {
			winston.verbose(`[auth] Triggering password reset for uid ${userData.uid} due to password policy`);
			request.session.passwordExpired = true;

			const code = await user.reset.generate(userData.uid);
			(res.locals.redirectAfterLogin || redirectAfterLogin)(request, res, `${nconf.get('relative_path')}/reset/${code}`);
		} else {
			delete request.query.lang;
			await authenticationController.doLogin(request, userData.uid);
			let destination;
			if (request.session.returnTo) {
				destination = request.session.returnTo.startsWith('http')
					? request.session.returnTo
					: nconf.get('relative_path') + request.session.returnTo;
				delete request.session.returnTo;
			} else {
				destination = `${nconf.get('relative_path')}/`;
			}

			(res.locals.redirectAfterLogin || redirectAfterLogin)(request, res, destination);
		}
	})(request, res, next);
}

function redirectAfterLogin(request, res, destination) {
	if (request.body.noscript === 'true') {
		res.redirect(`${destination}?loggedin`);
	} else {
		res.status(200).send({
			next: destination,
		});
	}
}

authenticationController.doLogin = async function (request, uid) {
	if (!uid) {
		return;
	}

	const loginAsync = util.promisify(request.login).bind(request);
	await loginAsync({uid}, {keepSessionInfo: request.res.locals !== false});
	await authenticationController.onSuccessfulLogin(request, uid);
};

authenticationController.onSuccessfulLogin = async function (request, uid) {
	/*
     * Older code required that this method be called from within the SSO plugin.
     * That behaviour is no longer required, onSuccessfulLogin is now automatically
     * called in NodeBB core. However, if already called, return prematurely
     */
	if (request.loggedIn && !request.session.forceLogin) {
		return true;
	}

	try {
		const uuid = utils.generateUUID();

		request.uid = uid;
		request.loggedIn = true;
		await meta.blacklist.test(request.ip);
		await user.logIP(uid, request.ip);
		await user.bans.unbanIfExpired([uid]);
		await user.reset.cleanByUid(uid);

		request.session.meta = {};

		delete request.session.forceLogin;
		// Associate IP used during login with user account
		request.session.meta.ip = request.ip;

		// Associate metadata retrieved via user-agent
		request.session.meta = _.extend(request.session.meta, {
			uuid,
			datetime: Date.now(),
			platform: request.useragent.platform,
			browser: request.useragent.browser,
			version: request.useragent.version,
		});
		await Promise.all([
			new Promise(resolve => {
				request.session.save(resolve);
			}),
			user.auth.addSession(uid, request.sessionID),
			user.updateLastOnlineTime(uid),
			user.updateOnlineUsers(uid),
			analytics.increment('logins'),
			db.incrObjectFieldBy('global', 'loginCount', 1),
		]);
		if (uid > 0) {
			await db.setObjectField(`uid:${uid}:sessionUUID:sessionId`, uuid, request.sessionID);
		}

		// Force session check for all connected socket.io clients with the same session id
		sockets.in(`sess_${request.sessionID}`).emit('checkSession', uid);

		plugins.hooks.fire('action:user.loggedIn', {uid, req: request});
	} catch (error) {
		request.session.destroy();
		throw error;
	}
};

authenticationController.localLogin = async function (request, username, password, next) {
	if (!username) {
		return next(new Error('[[error:invalid-username]]'));
	}

	if (!password || !utils.isPasswordValid(password)) {
		return next(new Error('[[error:invalid-password]]'));
	}

	if (password.length > 512) {
		return next(new Error('[[error:password-too-long]]'));
	}

	const userslug = slugify(username);
	const uid = await user.getUidByUserslug(userslug);
	try {
		const [userData, isAdminOrGlobalModule, canLoginIfBanned] = await Promise.all([
			user.getUserFields(uid, ['uid', 'passwordExpiry']),
			user.isAdminOrGlobalMod(uid),
			user.bans.canLoginIfBanned(uid),
		]);

		userData.isAdminOrGlobalMod = isAdminOrGlobalModule;

		if (!canLoginIfBanned) {
			return next(await getBanError(uid));
		}

		// Doing this after the ban check, because user's privileges might change after a ban expires
		const hasLoginPrivilege = await privileges.global.can('local:login', uid);
		if (Number.parseInt(uid, 10) && !hasLoginPrivilege) {
			return next(new Error('[[error:local-login-disabled]]'));
		}

		const passwordMatch = await user.isPasswordCorrect(uid, password, request.ip);
		if (!passwordMatch) {
			return next(new Error('[[error:invalid-login-credentials]]'));
		}

		next(null, userData, '[[success:authentication-successful]]');
	} catch (error) {
		next(error);
	}
};

const destroyAsync = util.promisify((request, callback) => request.session.destroy(callback));
const logoutAsync = util.promisify((request, callback) => request.logout(callback));

authenticationController.logout = async function (request, res, next) {
	if (!request.loggedIn || !request.sessionID) {
		res.clearCookie(nconf.get('sessionKey'), meta.configs.cookie.get());
		return res.status(200).send('not-logged-in');
	}

	const {uid} = request;
	const {sessionID} = request;

	try {
		await user.auth.revokeSession(sessionID, uid);
		await logoutAsync(request);

		await destroyAsync(request);
		res.clearCookie(nconf.get('sessionKey'), meta.configs.cookie.get());

		await user.setUserField(uid, 'lastonline', Date.now() - (meta.config.onlineCutoff * 60_000));
		await db.sortedSetAdd('users:online', Date.now() - (meta.config.onlineCutoff * 60_000), uid);
		await plugins.hooks.fire('static:user.loggedOut', {
			req: request, res, uid, sessionID,
		});

		// Force session check for all connected socket.io clients with the same session id
		sockets.in(`sess_${sessionID}`).emit('checkSession', 0);
		const payload = {
			next: `${nconf.get('relative_path')}/`,
		};
		plugins.hooks.fire('filter:user.logout', payload);

		if (request.body.noscript === 'true') {
			return res.redirect(payload.next);
		}

		res.status(200).send(payload);
	} catch (error) {
		next(error);
	}
};

async function getBanError(uid) {
	try {
		const banInfo = await user.getLatestBanInfo(uid);

		banInfo.reason ||= '[[user:info.banned-no-reason]]';

		const error = new Error(banInfo.reason);
		error.data = banInfo;
		return error;
	} catch (error) {
		if (error.message === 'no-ban-info') {
			return new Error('[[error:user-banned]]');
		}

		throw error;
	}
}

require('../promisify')(authenticationController, ['register', 'registerComplete', 'registerAbort', 'login', 'localLogin', 'logout']);
