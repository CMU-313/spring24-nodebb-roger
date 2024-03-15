'use strict';

const async = require('async');
const passport = require('passport');
const passportLocal = require('passport-local').Strategy;
const BearerStrategy = require('passport-http-bearer').Strategy;
const winston = require('winston');
const meta = require('../meta');
const controllers = require('../controllers');
const helpers = require('../controllers/helpers');
const plugins = require('../plugins');

let loginStrategies = [];

const Auth = module.exports;

Auth.initialize = function (app, middleware) {
	app.use(passport.initialize());
	app.use(passport.session());
	app.use((request, res, next) => {
		Auth.setAuthVars(request, res);
		next();
	});

	Auth.app = app;
	Auth.middleware = middleware;

	// Apply wrapper around passport.authenticate to pass in keepSessionInfo option
	const _authenticate = passport.authenticate;
	passport.authenticate = (strategy, options, callback) => {
		if (!callback && typeof options === 'function') {
			return _authenticate.call(passport, strategy, options);
		}

		if (!options.hasOwnProperty('keepSessionInfo')) {
			options.keepSessionInfo = true;
		}

		return _authenticate.call(passport, strategy, options, callback);
	};
};

Auth.setAuthVars = function setAuthVariables(request) {
	const isSpider = request.isSpider();
	request.loggedIn = !isSpider && Boolean(request.user);
	if (request.user) {
		request.uid = Number.parseInt(request.user.uid, 10);
	} else if (isSpider) {
		request.uid = -1;
	} else {
		request.uid = 0;
	}
};

Auth.getLoginStrategies = function () {
	return loginStrategies;
};

Auth.verifyToken = async function (token, done) {
	const {tokens = []} = await meta.settings.get('core.api');
	const tokenObject = tokens.find(t => t.token === token);
	const uid = tokenObject ? tokenObject.uid : undefined;

	if (uid === undefined) {
		done(false);
	} else if (Number.parseInt(uid, 10) > 0) {
		done(null, {
			uid,
		});
	} else {
		done(null, {
			master: true,
		});
	}
};

Auth.reloadRoutes = async function (parameters) {
	loginStrategies.length = 0;
	const {router} = parameters;

	// Local Logins
	if (plugins.hooks.hasListeners('action:auth.overrideLogin')) {
		winston.warn('[authentication] Login override detected, skipping local login strategy.');
		plugins.hooks.fire('action:auth.overrideLogin');
	} else {
		passport.use(new passportLocal({passReqToCallback: true}, controllers.authentication.localLogin));
	}

	// HTTP bearer authentication
	passport.use('core.api', new BearerStrategy({}, Auth.verifyToken));

	// Additional logins via SSO plugins
	try {
		loginStrategies = await plugins.hooks.fire('filter:auth.init', loginStrategies);
	} catch (error) {
		winston.error(`[authentication] ${error.stack}`);
	}

	loginStrategies ||= [];
	for (const strategy of loginStrategies) {
		if (strategy.url) {
			router[strategy.urlMethod || 'get'](strategy.url, Auth.middleware.applyCSRF, async (request, res, next) => {
				let options = {
					scope: strategy.scope,
					prompt: strategy.prompt || undefined,
				};

				if (strategy.checkState !== false) {
					request.session.ssoState = request.csrfToken && request.csrfToken();
					options.state = request.session.ssoState;
				}

				// Allow SSO plugins to override/append options (for use in passport prototype authorizationParams)
				({opts: options} = await plugins.hooks.fire('filter:auth.options', {req: request, res, opts: options}));
				passport.authenticate(strategy.name, options)(request, res, next);
			});
		}

		router[strategy.callbackMethod || 'get'](strategy.callbackURL, (request, res, next) => {
			// Ensure the passed-back state value is identical to the saved ssoState (unless explicitly skipped)
			if (strategy.checkState === false) {
				return next();
			}

			next(request.query.state === request.session.ssoState ? null : new Error('[[error:csrf-invalid]]'));
		}, (request, res, next) => {
			// Trigger registration interstitial checks
			request.session.registration = request.session.registration || {};
			// Save returnTo for later usage in /register/complete
			// passport seems to remove `req.session.returnTo` after it redirects
			request.session.registration.returnTo = request.session.returnTo;

			passport.authenticate(strategy.name, (error, user) => {
				if (error) {
					if (request.session && request.session.registration) {
						delete request.session.registration;
					}

					return next(error);
				}

				if (!user) {
					if (request.session && request.session.registration) {
						delete request.session.registration;
					}

					return helpers.redirect(res, strategy.failureUrl === undefined ? '/login' : strategy.failureUrl);
				}

				res.locals.user = user;
				res.locals.strategy = strategy;
				next();
			})(request, res, next);
		}, Auth.middleware.validateAuth, (request, res, next) => {
			async.waterfall([
				async.apply(request.login.bind(request), res.locals.user, {keepSessionInfo: true}),
				async.apply(controllers.authentication.onSuccessfulLogin, request, request.uid),
			], error => {
				if (error) {
					return next(error);
				}

				helpers.redirect(res, strategy.successUrl === undefined ? '/' : strategy.successUrl);
			});
		});
	}

	const multipart = require('connect-multiparty');
	const multipartMiddleware = multipart();
	const middlewares = [multipartMiddleware, Auth.middleware.applyCSRF, Auth.middleware.applyBlacklist];

	router.post('/register', middlewares, controllers.authentication.register);
	router.post('/register/complete', middlewares, controllers.authentication.registerComplete);
	router.post('/register/abort', Auth.middleware.applyCSRF, controllers.authentication.registerAbort);
	router.post('/login', Auth.middleware.applyCSRF, Auth.middleware.applyBlacklist, controllers.authentication.login);
	router.post('/logout', Auth.middleware.applyCSRF, controllers.authentication.logout);
};

passport.serializeUser((user, done) => {
	done(null, user.uid);
});

passport.deserializeUser((uid, done) => {
	done(null, {
		uid,
	});
});
