'use strict';

const privileges = require('../../privileges');
const categories = require('../../categories');
const api = require('../../api');
const helpers = require('../helpers');

const Categories = module.exports;

const hasAdminPrivilege = async uid => {
	const ok = await privileges.admin.can('admin:categories', uid);
	if (!ok) {
		throw new Error('[[error:no-privileges]]');
	}
};

Categories.get = async (request, res) => {
	helpers.formatApiResponse(200, res, await api.categories.get(request, request.params));
};

Categories.create = async (request, res) => {
	await hasAdminPrivilege(request.uid);

	const response = await api.categories.create(request, request.body);
	helpers.formatApiResponse(200, res, response);
};

Categories.update = async (request, res) => {
	await hasAdminPrivilege(request.uid);

	const payload = {};
	payload[request.params.cid] = request.body;
	await api.categories.update(request, payload);
	const categoryObjs = await categories.getCategories([request.params.cid]);
	helpers.formatApiResponse(200, res, categoryObjs[0]);
};

Categories.delete = async (request, res) => {
	await hasAdminPrivilege(request.uid);

	await api.categories.delete(request, {cid: request.params.cid});
	helpers.formatApiResponse(200, res);
};

Categories.getPrivileges = async (request, res) => {
	if (!await privileges.admin.can('admin:privileges', request.uid)) {
		throw new Error('[[error:no-privileges]]');
	}

	const privilegeSet = await api.categories.getPrivileges(request, request.params.cid);
	helpers.formatApiResponse(200, res, privilegeSet);
};

Categories.setPrivilege = async (request, res) => {
	if (!await privileges.admin.can('admin:privileges', request.uid)) {
		throw new Error('[[error:no-privileges]]');
	}

	await api.categories.setPrivilege(request, {
		...request.params,
		member: request.body.member,
		set: request.method === 'PUT',
	});

	const privilegeSet = await api.categories.getPrivileges(request, request.params.cid);
	helpers.formatApiResponse(200, res, privilegeSet);
};

Categories.setModerator = async (request, res) => {
	if (!await privileges.admin.can('admin:admins-mods', request.uid)) {
		throw new Error('[[error:no-privileges]]');
	}

	const privilegeList = await privileges.categories.getUserPrivilegeList();
	await api.categories.setPrivilege(request, {
		cid: request.params.cid,
		privilege: privilegeList,
		member: request.params.uid,
		set: request.method === 'PUT',
	});
	helpers.formatApiResponse(200, res);
};
