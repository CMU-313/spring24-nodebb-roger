'use strict';

const helpers = require('../helpers');
const pagination = require('../../pagination');
const user = require('../../user');
const plugins = require('../../plugins');
const accountHelpers = require('./helpers');

const blocksController = module.exports;

blocksController.getBlocks = async function (request, res, next) {
	const page = Number.parseInt(request.query.page, 10) || 1;
	const resultsPerPage = 50;
	const start = Math.max(0, page - 1) * resultsPerPage;
	const stop = start + resultsPerPage - 1;

	const userData = await accountHelpers.getUserDataByUserSlug(request.params.userslug, request.uid, request.query);
	if (!userData) {
		return next();
	}

	const uids = await user.blocks.list(userData.uid);
	const data = await plugins.hooks.fire('filter:user.getBlocks', {
		uids,
		uid: userData.uid,
		start,
		stop,
	});

	data.uids = data.uids.slice(start, stop + 1);
	userData.users = await user.getUsers(data.uids, request.uid);
	userData.title = `[[pages:account/blocks, ${userData.username}]]`;

	const pageCount = Math.ceil(userData.counts.blocks / resultsPerPage);
	userData.pagination = pagination.create(page, pageCount);

	userData.breadcrumbs = helpers.buildBreadcrumbs([{text: userData.username, url: `/user/${userData.userslug}`}, {text: '[[user:blocks]]'}]);

	res.render('account/blocks', userData);
};
