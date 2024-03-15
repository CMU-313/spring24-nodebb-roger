'use strict';

const user = require('../../user');
const helpers = require('../helpers');
const pagination = require('../../pagination');
const accountHelpers = require('./helpers');

const followController = module.exports;

followController.getFollowing = async function (request, res, next) {
	await getFollow('account/following', 'following', request, res, next);
};

followController.getFollowers = async function (request, res, next) {
	await getFollow('account/followers', 'followers', request, res, next);
};

async function getFollow(tpl, name, request, res, next) {
	const userData = await accountHelpers.getUserDataByUserSlug(request.params.userslug, request.uid, request.query);
	if (!userData) {
		return next();
	}

	const page = Number.parseInt(request.query.page, 10) || 1;
	const resultsPerPage = 50;
	const start = Math.max(0, page - 1) * resultsPerPage;
	const stop = start + resultsPerPage - 1;

	userData.title = `[[pages:${tpl}, ${userData.username}]]`;

	const method = name === 'following' ? 'getFollowing' : 'getFollowers';
	userData.users = await user[method](userData.uid, start, stop);

	const count = name === 'following' ? userData.followingCount : userData.followerCount;
	const pageCount = Math.ceil(count / resultsPerPage);
	userData.pagination = pagination.create(page, pageCount);

	userData.breadcrumbs = helpers.buildBreadcrumbs([{text: userData.username, url: `/user/${userData.userslug}`}, {text: `[[user:${name}]]`}]);

	res.render(tpl, userData);
}
