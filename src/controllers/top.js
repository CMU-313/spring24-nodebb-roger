
'use strict';

const nconf = require('nconf');
const validator = require('validator');
const helpers = require('./helpers');
const recentController = require('./recent');

const topController = module.exports;

topController.get = async function (request, res, next) {
	const data = await recentController.getData(request, 'top', 'votes');
	if (!data) {
		return next();
	}

	const term = helpers.terms[request.query.term] || 'alltime';
	if (request.originalUrl.startsWith(`${nconf.get('relative_path')}/api/top`) || request.originalUrl.startsWith(`${nconf.get('relative_path')}/top`)) {
		data.title = `[[pages:top-${term}]]`;
	}

	const feedQs = data.rssFeedUrl.split('?')[1];
	data.rssFeedUrl = `${nconf.get('relative_path')}/top/${validator.escape(String(request.query.term || 'alltime'))}.rss`;
	if (request.loggedIn) {
		data.rssFeedUrl += `?${feedQs}`;
	}

	res.render('top', data);
};
