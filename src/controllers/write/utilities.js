'use strict';

const user = require('../../user');
const authenticationController = require('../authentication');
const helpers = require('../helpers');

const Utilities = module.exports;

Utilities.ping = {};
Utilities.ping.get = (request, res) => {
	helpers.formatApiResponse(200, res, {
		pong: true,
	});
};

Utilities.ping.post = (request, res) => {
	helpers.formatApiResponse(200, res, {
		uid: request.user.uid,
		received: request.body,
	});
};

Utilities.login = (request, res) => {
	res.locals.redirectAfterLogin = async (request_, res) => {
		const userData = (await user.getUsers([request_.uid], request_.uid)).pop();
		helpers.formatApiResponse(200, res, userData);
	};

	res.locals.noScriptErrors = (request_, res, error, statusCode) => {
		helpers.formatApiResponse(statusCode, res, new Error(error));
	};

	authenticationController.login(request, res);
};
