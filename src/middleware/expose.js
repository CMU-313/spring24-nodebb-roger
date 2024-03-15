'use strict';

/**
 * The middlewares here strictly act to "expose" certain values from the database,
 * into `res.locals` for use in middlewares and/or controllers down the line
 */

const user = require('../user');
const privileges = require('../privileges');
const utils = require('../utils');

module.exports = function (middleware) {
	middleware.exposeAdmin = async (request, res, next) => {
		// Unlike `requireAdmin`, this middleware just checks the uid, and sets `isAdmin` in `res.locals`
		res.locals.isAdmin = false;

		if (!request.user) {
			return next();
		}

		res.locals.isAdmin = await user.isAdministrator(request.user.uid);
		next();
	};

	middleware.exposePrivileges = async (request, res, next) => {
		// Exposes a hash of user's ranks (admin, gmod, etc.)
		const hash = await utils.promiseParallel({
			isAdmin: user.isAdministrator(request.user.uid),
			isGmod: user.isGlobalModerator(request.user.uid),
			isPrivileged: user.isPrivileged(request.user.uid),
		});

		if (request.params.uid) {
			hash.isSelf = Number.parseInt(request.params.uid, 10) === request.user.uid;
		}

		res.locals.privileges = hash;
		next();
	};

	middleware.exposePrivilegeSet = async (request, res, next) => {
		// Exposes a user's global/admin privilege set
		res.locals.privileges = {
			...await privileges.global.get(request.user.uid),
			...await privileges.admin.get(request.user.uid),
		};
		next();
	};
};
