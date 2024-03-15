
'use strict';

const nconf = require('nconf');
const validator = require('validator');
const helpers = require('./helpers');
const recentController = require('./recent');

const popularController = module.exports;

popularController.get = async function (request, res, next) {
	const data = await recentController.getData(request, 'popular', 'posts');
	if (!data) {
		return next();
	}

	const term = helpers.terms[request.query.term] || 'alltime';
	if (request.originalUrl.startsWith(`${nconf.get('relative_path')}/api/popular`) || request.originalUrl.startsWith(`${nconf.get('relative_path')}/popular`)) {
		data.title = `[[pages:popular-${term}]]`;
		const breadcrumbs = [{text: '[[global:header.popular]]'}];
		data.breadcrumbs = helpers.buildBreadcrumbs(breadcrumbs);
	}

	const feedQs = data.rssFeedUrl.split('?')[1];
	data.rssFeedUrl = `${nconf.get('relative_path')}/popular/${validator.escape(String(request.query.term || 'alltime'))}.rss`;
	if (request.loggedIn) {
		data.rssFeedUrl += `?${feedQs}`;
	}

	res.render('popular', data);
};
