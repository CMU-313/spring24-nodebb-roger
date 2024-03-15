'use strict';

const os = require('node:os');
const winston = require('winston');
const _ = require('lodash');
const meta = require('../meta');
const languages = require('../languages');
const plugins = require('../plugins');
const helpers = require('./helpers');

module.exports = function (middleware) {
	middleware.addHeaders = helpers.try((request, res, next) => {
		const headers = {
			'X-Powered-By': encodeURI(meta.config['powered-by'] || 'NodeBB'),
			'Access-Control-Allow-Methods': encodeURI(meta.config['access-control-allow-methods'] || ''),
			'Access-Control-Allow-Headers': encodeURI(meta.config['access-control-allow-headers'] || ''),
		};

		if (meta.config['csp-frame-ancestors']) {
			headers['Content-Security-Policy'] = `frame-ancestors ${meta.config['csp-frame-ancestors']}`;
			if (meta.config['csp-frame-ancestors'] === '\'none\'') {
				headers['X-Frame-Options'] = 'DENY';
			}
		} else {
			headers['Content-Security-Policy'] = 'frame-ancestors \'self\'';
			headers['X-Frame-Options'] = 'SAMEORIGIN';
		}

		if (meta.config['access-control-allow-origin']) {
			let origins = meta.config['access-control-allow-origin'].split(',');
			origins = origins.map(origin => origin && origin.trim());

			if (origins.includes(request.get('origin'))) {
				headers['Access-Control-Allow-Origin'] = encodeURI(request.get('origin'));
				headers.Vary = headers.Vary ? `${headers.Vary}, Origin` : 'Origin';
			}
		}

		if (meta.config['access-control-allow-origin-regex']) {
			let originsRegex = meta.config['access-control-allow-origin-regex'].split(',');
			originsRegex = originsRegex.map(origin => {
				try {
					origin = new RegExp(origin.trim());
				} catch {
					winston.error(`[middleware.addHeaders] Invalid RegExp For access-control-allow-origin ${origin}`);
					origin = null;
				}

				return origin;
			});

			for (const regex of originsRegex) {
				if (regex && regex.test(request.get('origin'))) {
					headers['Access-Control-Allow-Origin'] = encodeURI(request.get('origin'));
					headers.Vary = headers.Vary ? `${headers.Vary}, Origin` : 'Origin';
				}
			}
		}

		if (meta.config['permissions-policy']) {
			headers['Permissions-Policy'] = meta.config['permissions-policy'];
		}

		if (meta.config['access-control-allow-credentials']) {
			headers['Access-Control-Allow-Credentials'] = meta.config['access-control-allow-credentials'];
		}

		if (process.env.NODE_ENV === 'development') {
			headers['X-Upstream-Hostname'] = os.hostname();
		}

		for (const [key, value] of Object.entries(headers)) {
			if (value) {
				res.setHeader(key, value);
			}
		}

		next();
	});

	middleware.autoLocale = helpers.try(async (request, res, next) => {
		await plugins.hooks.fire('filter:middleware.autoLocale', {
			req: request,
			res,
		});
		if (request.query.lang) {
			const langs = await listCodes();
			if (!langs.includes(request.query.lang)) {
				request.query.lang = meta.config.defaultLang;
			}

			return next();
		}

		if (meta.config.autoDetectLang && request.uid === 0) {
			const langs = await listCodes();
			const lang = request.acceptsLanguages(langs);
			if (!lang) {
				return next();
			}

			request.query.lang = lang;
		}

		next();
	});

	async function listCodes() {
		const defaultLang = meta.config.defaultLang || 'en-GB';
		try {
			const codes = await languages.listCodes();
			return _.uniq([defaultLang, ...codes]);
		} catch (error) {
			winston.error(`[middleware/autoLocale] Could not retrieve languages codes list! ${error.stack}`);
			return [defaultLang];
		}
	}
};
