'use strict';

const path = require('node:path');
const util = require('node:util');
const async = require('async');
const csrf = require('csurf');
const validator = require('validator');
const nconf = require('nconf');
const toobusy = require('toobusy-js');
const plugins = require('../plugins');
const meta = require('../meta');
const user = require('../user');
const groups = require('../groups');
const analytics = require('../analytics');
const privileges = require('../privileges');
const cacheCreate = require('../cache/lru');
const helpers = require('./helpers');

const controllers = {
	api: require('../controllers/api'),
	helpers: require('../controllers/helpers'),
};

const delayCache = cacheCreate({
	ttl: 1000 * 60,
});

const middleware = module.exports;

const relative_path = nconf.get('relative_path');

middleware.regexes = {
	timestampedUpload: /^\d+-.+$/,
};

const csrfMiddleware = csrf();

middleware.applyCSRF = function (request, res, next) {
	if (request.uid >= 0) {
		csrfMiddleware(request, res, next);
	} else {
		next();
	}
};

middleware.applyCSRFasync = util.promisify(middleware.applyCSRF);

middleware.ensureLoggedIn = (request, res, next) => {
	if (!request.loggedIn) {
		return controllers.helpers.notAllowed(request, res);
	}

	setImmediate(next);
};

Object.assign(middleware, {
	admin: require('./admin'),
	...require('./header'),
});
require('./render')(middleware);
require('./maintenance')(middleware);
require('./user')(middleware);
middleware.uploads = require('./uploads');
require('./headers')(middleware);
require('./expose')(middleware);
middleware.assert = require('./assert');

middleware.stripLeadingSlashes = function stripLeadingSlashes(request, res, next) {
	const target = request.originalUrl.replace(relative_path, '');
	if (target.startsWith('//')) {
		return res.redirect(relative_path + target.replace(/^\/+/, '/'));
	}

	next();
};

middleware.pageView = helpers.try(async (request, res, next) => {
	if (request.loggedIn) {
		await Promise.all([
			user.updateOnlineUsers(request.uid),
			user.updateLastOnlineTime(request.uid),
		]);
	}

	next();
	await analytics.pageView({ip: request.ip, uid: request.uid});
	plugins.hooks.fire('action:middleware.pageView', {req: request});
});

middleware.pluginHooks = helpers.try(async (request, res, next) => {
	// TODO: Deprecate in v2.0
	await async.each(plugins.loadedHooks['filter:router.page'] || [], (hookObject, next) => {
		hookObject.method(request, res, next);
	});

	await plugins.hooks.fire('response:router.page', {
		req: request,
		res,
	});

	if (!res.headersSent) {
		next();
	}
});

middleware.validateFiles = function validateFiles(request, res, next) {
	if (!Array.isArray(request.files.files) || request.files.files.length === 0) {
		return next(new Error(['[[error:invalid-files]]']));
	}

	next();
};

middleware.prepareAPI = function prepareAPI(request, res, next) {
	res.locals.isAPI = true;
	next();
};

middleware.routeTouchIcon = function routeTouchIcon(request, res) {
	if (meta.config['brand:touchIcon'] && validator.isURL(meta.config['brand:touchIcon'])) {
		return res.redirect(meta.config['brand:touchIcon']);
	}

	let iconPath = '';
	iconPath = meta.config['brand:touchIcon'] ? path.join(nconf.get('upload_path'), meta.config['brand:touchIcon'].replace(/assets\/uploads/, '')) : path.join(nconf.get('base_dir'), 'public/images/touch/512.png');

	return res.sendFile(iconPath, {
		maxAge: request.app.enabled('cache') ? 5_184_000_000 : 0,
	});
};

middleware.privateTagListing = helpers.try(async (request, res, next) => {
	const canView = await privileges.global.can('view:tags', request.uid);
	if (!canView) {
		return controllers.helpers.notAllowed(request, res);
	}

	next();
});

middleware.exposeGroupName = helpers.try(async (request, res, next) => {
	await expose('groupName', groups.getGroupNameByGroupSlug, 'slug', request, res, next);
});

middleware.exposeUid = helpers.try(async (request, res, next) => {
	await expose('uid', user.getUidByUserslug, 'userslug', request, res, next);
});

async function expose(exposedField, method, field, request, res, next) {
	if (!request.params.hasOwnProperty(field)) {
		return next();
	}

	res.locals[exposedField] = await method(request.params[field]);
	next();
}

middleware.privateUploads = function privateUploads(request, res, next) {
	if (request.loggedIn || !meta.config.privateUploads) {
		return next();
	}

	if (request.path.startsWith(`${nconf.get('relative_path')}/assets/uploads/files`)) {
		const extensions = (meta.config.privateUploadsExtensions || '').split(',').filter(Boolean);
		let extension = path.extname(request.path);
		extension = extension ? extension.replace(/^\./, '') : extension;
		if (extensions.length === 0 || extensions.includes(extension)) {
			return res.status(403).json('not-allowed');
		}
	}

	next();
};

middleware.busyCheck = function busyCheck(request, res, next) {
	if (global.env === 'production' && meta.config.eventLoopCheckEnabled && toobusy()) {
		analytics.increment('errors:503');
		res.status(503).type('text/html').sendFile(path.join(__dirname, '../../public/503.html'));
	} else {
		setImmediate(next);
	}
};

middleware.applyBlacklist = async function applyExclude(request, res, next) {
	try {
		await meta.blacklist.test(request.ip);
		next();
	} catch (error) {
		next(error);
	}
};

middleware.delayLoading = function delayLoading(request, res, next) {
	// Introduces an artificial delay during load so that brute force attacks are effectively mitigated

	// Add IP to cache so if too many requests are made, subsequent requests are blocked for a minute
	let timesSeen = delayCache.get(request.ip) || 0;
	if (timesSeen > 10) {
		return res.sendStatus(429);
	}

	delayCache.set(request.ip, timesSeen += 1);

	setTimeout(next, 1000);
};

middleware.buildSkinAsset = helpers.try(async (request, res, next) => {
	// If this middleware is reached, a skin was requested, so it is built on-demand
	const target = path.basename(request.originalUrl).match(/(client-[a-z]+)/);
	if (!target) {
		return next();
	}

	await plugins.prepareForBuild(['client side styles']);
	const css = await meta.css.buildBundle(target[0], true);
	require('../meta/minifier').killAll();
	res.status(200).type('text/css').send(css);
});

middleware.addUploadHeaders = function addUploadHeaders(request, res, next) {
	// Trim uploaded files' timestamps when downloading + force download if html
	let basename = path.basename(request.path);
	const extname = path.extname(request.path);
	if (request.path.startsWith('/uploads/files/') && middleware.regexes.timestampedUpload.test(basename)) {
		basename = basename.slice(14);
		res.header('Content-Disposition', `${extname.startsWith('.htm') ? 'attachment' : 'inline'}; filename="${basename}"`);
	}

	next();
};

middleware.validateAuth = helpers.try(async (request, res, next) => {
	try {
		await plugins.hooks.fire('static:auth.validate', {
			user: res.locals.user,
			strategy: res.locals.strategy,
		});
		next();
	} catch (error) {
		const regenerateSession = util.promisify(callback => request.session.regenerate(callback));
		await regenerateSession();
		request.uid = 0;
		request.loggedIn = false;
		next(error);
	}
});

middleware.checkRequired = function (fields, request, res, next) {
	// Used in API calls to ensure that necessary parameters/data values are present
	const missing = fields.filter(field => !request.body.hasOwnProperty(field));

	if (missing.length === 0) {
		return next();
	}

	controllers.helpers.formatApiResponse(400, res, new Error(`[[error:required-parameters-missing, ${missing.join(' ')}]]`));
};
