'use strict';

const user = require('../../user');
const helpers = require('../helpers');
const accountHelpers = require('./helpers');

const sessionController = module.exports;

sessionController.get = async function (request, res, next) {
	const userData = await accountHelpers.getUserDataByUserSlug(request.params.userslug, request.uid, request.query);
	if (!userData) {
		return next();
	}

	userData.sessions = await user.auth.getSessions(userData.uid, request.sessionID);
	userData.title = '[[pages:account/sessions]]';
	userData.breadcrumbs = helpers.buildBreadcrumbs([{text: userData.username, url: `/user/${userData.userslug}`}, {text: '[[pages:account/sessions]]'}]);

	res.render('account/sessions', userData);
};
