'use strict';

const user = require('../../user');
const flags = require('../../flags');
const api = require('../../api');
const helpers = require('../helpers');

const Flags = module.exports;

Flags.create = async (request, res) => {
	const flagObject = await api.flags.create(request, {...request.body});
	helpers.formatApiResponse(200, res, await user.isPrivileged(request.uid) ? flagObject : undefined);
};

Flags.get = async (request, res) => {
	const isPrivileged = await user.isPrivileged(request.uid);
	if (!isPrivileged) {
		return helpers.formatApiResponse(403, res);
	}

	helpers.formatApiResponse(200, res, await flags.get(request.params.flagId));
};

Flags.update = async (request, res) => {
	const history = await api.flags.update(request, {
		flagId: request.params.flagId,
		...request.body,
	});

	helpers.formatApiResponse(200, res, {history});
};

Flags.delete = async (request, res) => {
	await flags.purge([request.params.flagId]);
	helpers.formatApiResponse(200, res);
};

Flags.appendNote = async (request, res) => {
	const payload = await api.flags.appendNote(request, {
		flagId: request.params.flagId,
		...request.body,
	});

	helpers.formatApiResponse(200, res, payload);
};

Flags.deleteNote = async (request, res) => {
	const payload = await api.flags.deleteNote(request, {
		...request.params,
	});

	helpers.formatApiResponse(200, res, payload);
};
