'use strict';

const nconf = require('nconf');
const winston = require('winston');
const validator = require('validator');
const meta = require('../meta');
const plugins = require('../plugins');
const middleware = require('../middleware');
const helpers = require('../middleware/helpers');

exports.handle404 = function handle404(request, res) {
	const relativePath = nconf.get('relative_path');
	const isClientScript = new RegExp(`^${relativePath}\\/assets\\/src\\/.+\\.js(\\?v=\\w+)?$`);

	if (plugins.hooks.hasListeners('action:meta.override404')) {
		return plugins.hooks.fire('action:meta.override404', {
			req: request,
			res,
			error: {},
		});
	}

	if (isClientScript.test(request.url)) {
		res.type('text/javascript').status(404).send('Not Found');
	} else if (
		!res.locals.isAPI && (
			request.path.startsWith(`${relativePath}/assets/uploads`)
            || (request.get('accept') && !request.get('accept').includes('text/html'))
            || request.path === '/favicon.ico'
		)
	) {
		meta.errors.log404(request.path || '');
		res.sendStatus(404);
	} else if (request.accepts('html')) {
		if (process.env.NODE_ENV === 'development') {
			winston.warn(`Route requested but not found: ${request.url}`);
		}

		meta.errors.log404(request.path.replace(/^\/api/, '') || '');
		exports.send404(request, res);
	} else {
		res.status(404).type('txt').send('Not found');
	}
};

exports.send404 = async function (request, res) {
	res.status(404);
	const path = String(request.path || '');
	if (res.locals.isAPI) {
		return res.json({
			path: validator.escape(path.replace(/^\/api/, '')),
			title: '[[global:404.title]]',
			bodyClass: helpers.buildBodyClass(request, res),
		});
	}

	await middleware.buildHeaderAsync(request, res);
	await res.render('404', {
		path: validator.escape(path),
		title: '[[global:404.title]]',
		bodyClass: helpers.buildBodyClass(request, res),
	});
};
