'use strict';

const validator = require('validator');
const nconf = require('nconf');
const meta = require('../meta');
const groups = require('../groups');
const user = require('../user');
const pagination = require('../pagination');
const privileges = require('../privileges');
const helpers = require('./helpers');

const groupsController = module.exports;

groupsController.list = async function (request, res) {
	const sort = request.query.sort || 'alpha';

	const [groupData, allowGroupCreation] = await Promise.all([
		groups.getGroupsBySort(sort, 0, 14),
		privileges.global.can('group:create', request.uid),
	]);

	res.render('groups/list', {
		groups: groupData,
		allowGroupCreation,
		nextStart: 15,
		title: '[[pages:groups]]',
		breadcrumbs: helpers.buildBreadcrumbs([{text: '[[pages:groups]]'}]),
	});
};

groupsController.details = async function (request, res, next) {
	const lowercaseSlug = request.params.slug.toLowerCase();
	if (request.params.slug !== lowercaseSlug) {
		if (res.locals.isAPI) {
			request.params.slug = lowercaseSlug;
		} else {
			return res.redirect(`${nconf.get('relative_path')}/groups/${lowercaseSlug}`);
		}
	}

	const groupName = await groups.getGroupNameByGroupSlug(request.params.slug);
	if (!groupName) {
		return next();
	}

	const [exists, isHidden, isAdmin, isGlobalModule] = await Promise.all([
		groups.exists(groupName),
		groups.isHidden(groupName),
		user.isAdministrator(request.uid),
		user.isGlobalModerator(request.uid),
	]);
	if (!exists) {
		return next();
	}

	if (isHidden && !isAdmin && !isGlobalModule) {
		const [isMember, isInvited] = await Promise.all([
			groups.isMember(request.uid, groupName),
			groups.isInvited(request.uid, groupName),
		]);
		if (!isMember && !isInvited) {
			return next();
		}
	}

	const [groupData, posts] = await Promise.all([
		groups.get(groupName, {
			uid: request.uid,
			truncateUserList: true,
			userListCount: 20,
		}),
		groups.getLatestMemberPosts(groupName, 10, request.uid),
	]);
	if (!groupData) {
		return next();
	}

	groupData.isOwner = groupData.isOwner || isAdmin || (isGlobalModule && !groupData.system);

	res.render('groups/details', {
		title: `[[pages:group, ${groupData.displayName}]]`,
		group: groupData,
		posts,
		isAdmin,
		isGlobalMod: isGlobalModule,
		allowPrivateGroups: meta.config.allowPrivateGroups,
		breadcrumbs: helpers.buildBreadcrumbs([{text: '[[pages:groups]]', url: '/groups'}, {text: groupData.displayName}]),
	});
};

groupsController.members = async function (request, res, next) {
	const page = Number.parseInt(request.query.page, 10) || 1;
	const usersPerPage = 50;
	const start = Math.max(0, (page - 1) * usersPerPage);
	const stop = start + usersPerPage - 1;
	const groupName = await groups.getGroupNameByGroupSlug(request.params.slug);
	if (!groupName) {
		return next();
	}

	const [groupData, isAdminOrGlobalModule, isMember, isHidden] = await Promise.all([
		groups.getGroupData(groupName),
		user.isAdminOrGlobalMod(request.uid),
		groups.isMember(request.uid, groupName),
		groups.isHidden(groupName),
	]);

	if (isHidden && !isMember && !isAdminOrGlobalModule) {
		return next();
	}

	const users = await user.getUsersFromSet(`group:${groupName}:members`, request.uid, start, stop);

	const breadcrumbs = helpers.buildBreadcrumbs([
		{text: '[[pages:groups]]', url: '/groups'},
		{text: validator.escape(String(groupName)), url: `/groups/${request.params.slug}`},
		{text: '[[groups:details.members]]'},
	]);

	const pageCount = Math.max(1, Math.ceil(groupData.memberCount / usersPerPage));
	res.render('groups/members', {
		users,
		pagination: pagination.create(page, pageCount, request.query),
		breadcrumbs,
	});
};
