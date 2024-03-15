'use strict';

const winston = require('winston');
const validator = require('validator');
const slugify = require('../slugify');
const meta = require('../meta');

const helpers = module.exports;

helpers.try = function (middleware) {
	if (middleware && middleware.constructor && middleware.constructor.name === 'AsyncFunction') {
		return async function (request, res, next) {
			try {
				await middleware(request, res, next);
			} catch (error) {
				next(error);
			}
		};
	}

	return function (request, res, next) {
		try {
			middleware(request, res, next);
		} catch (error) {
			next(error);
		}
	};
};

helpers.buildBodyClass = function (request, res, templateData = {}) {
	const clean = request.path.replace(/^\/api/, '').replaceAll(/^\/|\/$/g, '');
	const parts = clean.split('/').slice(0, 3);
	for (let [index, p] of parts.entries()) {
		try {
			p = slugify(decodeURIComponent(p));
		} catch (error) {
			winston.error(`Error decoding URI: ${p}`);
			winston.error(error.stack);
			p = '';
		}

		p = validator.escape(String(p));
		parts[index] = index ? `${parts[0]}-${p}` : `page-${p || 'home'}`;
	}

	if (templateData.template && templateData.template.topic) {
		parts.push(`page-topic-category-${templateData.category.cid}`);
		parts.push(`page-topic-category-${slugify(templateData.category.name)}`);
	}

	if (Array.isArray(templateData.breadcrumbs)) {
		for (const crumb of templateData.breadcrumbs) {
			if (crumb && crumb.hasOwnProperty('cid')) {
				parts.push(`parent-category-${crumb.cid}`);
			}
		}
	}

	parts.push(`page-status-${res.statusCode}`);

	parts.push(`theme-${meta.config['theme:id'].split('-')[2]}`);

	if (request.loggedIn) {
		parts.push('user-loggedin');
	} else {
		parts.push('user-guest');
	}

	return parts.join(' ');
};
