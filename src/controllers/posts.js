'use strict';

const querystring = require('node:querystring');
const posts = require('../posts');
const privileges = require('../privileges');
const helpers = require('./helpers');

const postsController = module.exports;

postsController.redirectToPost = async function (request, res, next) {
	const pid = Number.parseInt(request.params.pid, 10);
	if (!pid) {
		return next();
	}

	const [canRead, path] = await Promise.all([
		privileges.posts.can('topics:read', pid, request.uid),
		posts.generatePostPath(pid, request.uid),
	]);
	if (!path) {
		return next();
	}

	if (!canRead) {
		return helpers.notAllowed(request, res);
	}

	const qs = querystring.stringify(request.query);
	helpers.redirect(res, qs ? `${path}?${qs}` : path);
};

postsController.getRecentPosts = async function (request, res) {
	const page = Number.parseInt(request.query.page, 10) || 1;
	const postsPerPage = 20;
	const start = Math.max(0, (page - 1) * postsPerPage);
	const stop = start + postsPerPage - 1;
	const data = await posts.getRecentPosts(request.uid, start, stop, request.params.term);
	res.json(data);
};
