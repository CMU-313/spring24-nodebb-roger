'use strict';

const api = require('../../api');
const helpers = require('../helpers');

const Groups = module.exports;

Groups.exists = async (request, res) => {
	helpers.formatApiResponse(200, res);
};

Groups.create = async (request, res) => {
	const groupObject = await api.groups.create(request, request.body);
	helpers.formatApiResponse(200, res, groupObject);
};

Groups.update = async (request, res) => {
	const groupObject = await api.groups.update(request, {
		...request.body,
		slug: request.params.slug,
	});
	helpers.formatApiResponse(200, res, groupObject);
};

Groups.delete = async (request, res) => {
	await api.groups.delete(request, request.params);
	helpers.formatApiResponse(200, res);
};

Groups.join = async (request, res) => {
	await api.groups.join(request, request.params);
	helpers.formatApiResponse(200, res);
};

Groups.leave = async (request, res) => {
	await api.groups.leave(request, request.params);
	helpers.formatApiResponse(200, res);
};

Groups.grant = async (request, res) => {
	await api.groups.grant(request, request.params);
	helpers.formatApiResponse(200, res);
};

Groups.rescind = async (request, res) => {
	await api.groups.rescind(request, request.params);
	helpers.formatApiResponse(200, res);
};
