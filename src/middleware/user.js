'use strict';

const path = require('node:path');
const util = require('node:util');
const winston = require('winston');
const passport = require('passport');
const nconf = require('nconf');
const user = require('../user');
const privileges = require('../privileges');
const plugins = require('../plugins');
const auth = require('../routes/authentication');
const writeRouter = require('../routes/write');
const helpers = require('./helpers');

const controllers = {
	helpers: require('../controllers/helpers'),
	authentication: require('../controllers/authentication'),
};

const passportAuthenticateAsync = function (request, res) {
	return new Promise((resolve, reject) => {
		passport.authenticate('core.api', (error, user) => {
			if (error) {
				reject(error);
			} else {
				resolve(user);
				res.on('finish', writeRouter.cleanup.bind(null, request));
			}
		})(request, res);
	});
};

module.exports = function (middleware) {
	async function authenticate(request, res) {
		async function finishLogin(request_, user) {
			const loginAsync = util.promisify(request_.login).bind(request_);
			await loginAsync(user, {keepSessionInfo: true});
			await controllers.authentication.onSuccessfulLogin(request_, user.uid);
			request_.uid = user.uid;
			request_.loggedIn = request_.uid > 0;
			return true;
		}

		if (res.locals.isAPI && (request.loggedIn || !request.headers.hasOwnProperty('authorization'))) {
			// If authenticated via cookie (express-session), protect routes with CSRF checking
			await middleware.applyCSRFasync(request, res);
		}

		if (request.loggedIn) {
			return true;
		}

		if (request.headers.hasOwnProperty('authorization')) {
			const user = await passportAuthenticateAsync(request, res);
			if (!user) {
				return true;
			}

			if (user.hasOwnProperty('uid')) {
				return await finishLogin(request, user);
			}

			if (user.hasOwnProperty('master') && user.master === true) {
				// If the token received was a master token, a _uid must also be present for all calls
				if (request.body.hasOwnProperty('_uid') || request.query.hasOwnProperty('_uid')) {
					user.uid = request.body._uid || request.query._uid;
					delete user.master;
					return await finishLogin(request, user);
				}

				throw new Error('[[error:api.master-token-no-uid]]');
			} else {
				winston.warn('[api/authenticate] Unable to find user after verifying token');
				return true;
			}
		}

		await plugins.hooks.fire('response:middleware.authenticate', {
			req: request,
			res,
			next() {}, // No-op for backwards compatibility
		});

		if (!res.headersSent) {
			auth.setAuthVars(request);
		}

		return !res.headersSent;
	}

	middleware.authenticateRequest = helpers.try(async (request, res, next) => {
		const {skip} = await plugins.hooks.fire('filter:middleware.authenticate', {
			skip: {
				// Get: [],
				post: ['/api/v3/utilities/login'],
				// Etc...
			},
		});

		const mountedPath = path.join(request.baseUrl, request.path).replace(nconf.get('relative_path'), '');
		const method = request.method.toLowerCase();
		if (skip[method] && skip[method].includes(mountedPath)) {
			return next();
		}

		if (!await authenticate(request, res)) {
			return;
		}

		next();
	});

	middleware.ensureSelfOrGlobalPrivilege = helpers.try(async (request, res, next) => {
		await ensureSelfOrMethod(user.isAdminOrGlobalMod, request, res, next);
	});

	middleware.ensureSelfOrPrivileged = helpers.try(async (request, res, next) => {
		await ensureSelfOrMethod(user.isPrivileged, request, res, next);
	});

	async function ensureSelfOrMethod(method, request, res, next) {
		/*
            The "self" part of this middleware hinges on you having used
            middleware.exposeUid prior to invoking this middleware.
        */
		if (!request.loggedIn) {
			return controllers.helpers.notAllowed(request, res);
		}

		if (request.uid === Number.parseInt(res.locals.uid, 10)) {
			return next();
		}

		const allowed = await method(request.uid);
		if (!allowed) {
			return controllers.helpers.notAllowed(request, res);
		}

		return next();
	}

	middleware.canViewUsers = helpers.try(async (request, res, next) => {
		if (Number.parseInt(res.locals.uid, 10) === request.uid) {
			return next();
		}

		const canView = await privileges.global.can('view:users', request.uid);
		if (canView) {
			return next();
		}

		controllers.helpers.notAllowed(request, res);
	});

	middleware.canViewGroups = helpers.try(async (request, res, next) => {
		const canView = await privileges.global.can('view:groups', request.uid);
		if (canView) {
			return next();
		}

		controllers.helpers.notAllowed(request, res);
	});

	middleware.canChat = helpers.try(async (request, res, next) => {
		const canChat = await privileges.global.can('chat', request.uid);
		if (canChat) {
			return next();
		}

		controllers.helpers.notAllowed(request, res);
	});

	middleware.checkAccountPermissions = helpers.try(async (request, res, next) => {
		// This middleware ensures that only the requested user and admins can pass

		// This check if left behind for legacy purposes. Older plugins may call this middleware without ensureLoggedIn
		if (!request.loggedIn) {
			return controllers.helpers.notAllowed(request, res);
		}

		if (!['uid', 'userslug'].some(parameter => request.params.hasOwnProperty(parameter))) {
			return controllers.helpers.notAllowed(request, res);
		}

		const uid = request.params.uid || await user.getUidByUserslug(request.params.userslug);
		let allowed = await privileges.users.canEdit(request.uid, uid);
		if (allowed) {
			return next();
		}

		if (/user\/.+\/info$/.test(request.path)) {
			allowed = await privileges.global.can('view:users:info', request.uid);
		}

		if (allowed) {
			return next();
		}

		controllers.helpers.notAllowed(request, res);
	});

	middleware.redirectToAccountIfLoggedIn = helpers.try(async (request, res, next) => {
		if (request.session.forceLogin || request.uid <= 0) {
			return next();
		}

		const userslug = await user.getUserField(request.uid, 'userslug');
		controllers.helpers.redirect(res, `/user/${userslug}`);
	});

	middleware.redirectUidToUserslug = helpers.try(async (request, res, next) => {
		const uid = Number.parseInt(request.params.uid, 10);
		if (uid <= 0) {
			return next();
		}

		const userslug = await user.getUserField(uid, 'userslug');
		if (!userslug) {
			return next();
		}

		const path = request.url.replace(/^\/api/, '')
			.replace(`/uid/${uid}`, () => `/user/${userslug}`);
		controllers.helpers.redirect(res, path);
	});

	middleware.redirectMeToUserslug = helpers.try(async (request, res) => {
		const userslug = await user.getUserField(request.uid, 'userslug');
		if (!userslug) {
			return controllers.helpers.notAllowed(request, res);
		}

		const path = request.url.replace(/^(\/api)?\/me/, () => `/user/${userslug}`);
		controllers.helpers.redirect(res, path);
	});

	middleware.requireUser = function (request, res, next) {
		if (request.loggedIn) {
			return next();
		}

		res.status(403).render('403', {title: '[[global:403.title]]'});
	};

	middleware.registrationComplete = async function registrationComplete(request, res, next) {
		// If the user's session contains registration data, redirect the user to complete registration
		if (!request.session.hasOwnProperty('registration')) {
			return setImmediate(next);
		}

		const path = request.path.startsWith('/api/') ? request.path.replace('/api', '') : request.path;
		const {allowed} = await plugins.hooks.fire('filter:middleware.registrationComplete', {
			allowed: ['/register/complete'],
		});
		if (allowed.includes(path)) {
			setImmediate(next);
		} else {
			// Append user data if present
			request.session.registration.uid = request.session.registration.uid || request.uid;

			controllers.helpers.redirect(res, '/register/complete');
		}
	};
};
