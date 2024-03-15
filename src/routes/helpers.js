'use strict';

const helpers = module.exports;
const winston = require('winston');
const middleware = require('../middleware');
const controllerHelpers = require('../controllers/helpers');

// Router, name, middleware(deprecated), middlewares(optional), controller
helpers.setupPageRoute = function (...arguments_) {
	const [router, name] = arguments_;
	let middlewares = arguments_.length > 3 ? arguments_.at(-2) : [];
	const controller = arguments_.at(-1);

	if (arguments_.length === 5) {
		winston.warn(`[helpers.setupPageRoute(${name})] passing \`middleware\` as the third param is deprecated, it can now be safely removed`);
	}

	middlewares = [
		middleware.authenticateRequest,
		middleware.maintenanceMode,
		middleware.registrationComplete,
		middleware.pluginHooks,
		...middlewares,
		middleware.pageView,
	];

	router.get(
		name,
		middleware.busyCheck,
		middlewares,
		middleware.buildHeader,
		helpers.tryRoute(controller),
	);
	router.get(`/api${name}`, middlewares, helpers.tryRoute(controller));
};

// Router, name, middleware(deprecated), middlewares(optional), controller
helpers.setupAdminPageRoute = function (...arguments_) {
	const [router, name] = arguments_;
	const middlewares = arguments_.length > 3 ? arguments_.at(-2) : [];
	const controller = arguments_.at(-1);
	if (arguments_.length === 5) {
		winston.warn(`[helpers.setupAdminPageRoute(${name})] passing \`middleware\` as the third param is deprecated, it can now be safely removed`);
	}

	router.get(name, middleware.admin.buildHeader, middlewares, helpers.tryRoute(controller));
	router.get(`/api${name}`, middlewares, helpers.tryRoute(controller));
};

// Router, verb, name, middlewares(optional), controller
helpers.setupApiRoute = function (...arguments_) {
	const [router, verb, name] = arguments_;
	let middlewares = arguments_.length > 4 ? arguments_.at(-2) : [];
	const controller = arguments_.at(-1);

	middlewares = [
		middleware.authenticateRequest,
		middleware.maintenanceMode,
		middleware.registrationComplete,
		middleware.pluginHooks,
		...middlewares,
	];

	router[verb](name, middlewares, helpers.tryRoute(controller, (error, res) => {
		controllerHelpers.formatApiResponse(400, res, error);
	}));
};

helpers.tryRoute = function (controller, handler) {
	// `handler` is optional
	if (controller && controller.constructor && controller.constructor.name === 'AsyncFunction') {
		return async function (request, res, next) {
			try {
				await controller(request, res, next);
			} catch (error) {
				if (handler) {
					return handler(error, res);
				}

				next(error);
			}
		};
	}

	return controller;
};
