'use strict';

const nconf = require('nconf');
const winston = require('winston');
const validator = require('validator');
const translator = require('../translator');
const plugins = require('../plugins');
const middleware = require('../middleware');
const middlewareHelpers = require('../middleware/helpers');
const helpers = require('./helpers');

exports.handleURIErrors = async function handleURIErrors(error, request, res, next) {
	// Handle cases where malformed URIs are passed in
	if (error instanceof URIError) {
		const cleanPath = request.path.replace(new RegExp(`^${nconf.get('relative_path')}`), '');
		const tidMatch = cleanPath.match(/^\/topic\/(\d+)\//);
		const cidMatch = cleanPath.match(/^\/category\/(\d+)\//);

		if (tidMatch) {
			res.redirect(nconf.get('relative_path') + tidMatch[0]);
		} else if (cidMatch) {
			res.redirect(nconf.get('relative_path') + cidMatch[0]);
		} else {
			winston.warn(`[controller] Bad request: ${request.path}`);
			if (request.path.startsWith(`${nconf.get('relative_path')}/api`)) {
				res.status(400).json({
					error: '[[global:400.title]]',
				});
			} else {
				await middleware.buildHeaderAsync(request, res);
				res.status(400).render('400', {error: validator.escape(String(error.message))});
			}
		}
	} else {
		next(error);
	}
};

// This needs to have four arguments or express treats it as `(req, res, next)`
// don't remove `next`!
exports.handleErrors = async function handleErrors(error, request, res, next) { // eslint-disable-line no-unused-vars
	const cases = {
		EBADCSRFTOKEN() {
			winston.error(`${request.method} ${request.originalUrl}\n${error.message}`);
			res.sendStatus(403);
		},
		'blacklisted-ip'() {
			res.status(403).type('text/plain').send(error.message);
		},
	};
	const defaultHandler = async function () {
		if (res.headersSent) {
			return;
		}

		// Display NodeBB error page
		const status = Number.parseInt(error.status, 10);
		if ((status === 302 || status === 308) && error.path) {
			return res.locals.isAPI ? res.set('X-Redirect', error.path).status(200).json(error.path) : res.redirect(nconf.get('relative_path') + error.path);
		}

		const path = String(request.path || '');

		if (path.startsWith(`${nconf.get('relative_path')}/api/v3`)) {
			let status = 500;
			if (error.message.startsWith('[[')) {
				status = 400;
				error.message = await translator.translate(error.message);
			}

			return helpers.formatApiResponse(status, res, error);
		}

		winston.error(`${request.method} ${request.originalUrl}\n${error.stack}`);
		res.status(status || 500);
		const data = {
			path: validator.escape(path),
			error: validator.escape(String(error.message)),
			bodyClass: middlewareHelpers.buildBodyClass(request, res),
		};
		if (res.locals.isAPI) {
			res.json(data);
		} else {
			await middleware.buildHeaderAsync(request, res);
			res.render('500', data);
		}
	};

	const data = await getErrorHandlers(cases);
	try {
		if (data.cases.hasOwnProperty(error.code)) {
			data.cases[error.code](error, request, res, defaultHandler);
		} else {
			await defaultHandler();
		}
	} catch (error) {
		winston.error(`${request.method} ${request.originalUrl}\n${error.stack}`);
		if (!res.headersSent) {
			res.status(500).send(error.message);
		}
	}
};

async function getErrorHandlers(cases) {
	try {
		return await plugins.hooks.fire('filter:error.handle', {
			cases,
		});
	} catch (error) {
		// Assume defaults
		winston.warn(`[errors/handle] Unable to retrieve plugin handlers for errors: ${error.message}`);
		return {cases};
	}
}
