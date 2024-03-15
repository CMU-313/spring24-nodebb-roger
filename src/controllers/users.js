'use strict';

const user = require('../user');
const meta = require('../meta');
const db = require('../database');
const pagination = require('../pagination');
const privileges = require('../privileges');
const api = require('../api');
const utils = require('../utils');
const helpers = require('./helpers');

const usersController = module.exports;

usersController.index = async function (request, res, next) {
	const section = request.query.section || 'joindate';
	const sectionToController = {
		joindate: usersController.getUsersSortedByJoinDate,
		online: usersController.getOnlineUsers,
		'sort-posts': usersController.getUsersSortedByPosts,
		'sort-reputation': usersController.getUsersSortedByReputation,
		banned: usersController.getBannedUsers,
		flagged: usersController.getFlaggedUsers,
	};

	if (request.query.query) {
		await usersController.search(request, res, next);
	} else if (sectionToController[section]) {
		await sectionToController[section](request, res, next);
	} else {
		await usersController.getUsersSortedByJoinDate(request, res, next);
	}
};

usersController.search = async function (request, res) {
	const searchData = await api.users.search(request, request.query);

	const section = request.query.section || 'joindate';

	searchData.pagination = pagination.create(request.query.page, searchData.pageCount, request.query);
	searchData[`section_${section}`] = true;
	searchData.displayUserSearch = true;
	await render(request, res, searchData);
};

usersController.getOnlineUsers = async function (request, res) {
	const [userData, guests] = await Promise.all([
		usersController.getUsers('users:online', request.uid, request.query),
		require('../socket.io/admin/rooms').getTotalGuestCount(),
	]);

	let hiddenCount = 0;
	if (!userData.isAdminOrGlobalMod) {
		userData.users = userData.users.filter(user => {
			const showUser = user && (user.uid === request.uid || user.userStatus !== 'offline');
			if (!showUser) {
				hiddenCount += 1;
			}

			return showUser;
		});
	}

	userData.anonymousUserCount = guests + hiddenCount;
	userData.timeagoCutoff = 1000 * 60 * 60 * 24;

	await render(request, res, userData);
};

usersController.getUsersSortedByPosts = async function (request, res) {
	await usersController.renderUsersPage('users:postcount', request, res);
};

usersController.getUsersSortedByReputation = async function (request, res, next) {
	if (meta.config['reputation:disabled']) {
		return next();
	}

	await usersController.renderUsersPage('users:reputation', request, res);
};

usersController.getUsersSortedByJoinDate = async function (request, res) {
	await usersController.renderUsersPage('users:joindate', request, res);
};

usersController.getBannedUsers = async function (request, res) {
	await renderIfAdminOrGlobalModule('users:banned', request, res);
};

usersController.getFlaggedUsers = async function (request, res) {
	await renderIfAdminOrGlobalModule('users:flags', request, res);
};

async function renderIfAdminOrGlobalModule(set, request, res) {
	const isAdminOrGlobalModule = await user.isAdminOrGlobalMod(request.uid);
	if (!isAdminOrGlobalModule) {
		return helpers.notAllowed(request, res);
	}

	await usersController.renderUsersPage(set, request, res);
}

usersController.renderUsersPage = async function (set, request, res) {
	const userData = await usersController.getUsers(set, request.uid, request.query);
	await render(request, res, userData);
};

usersController.getUsers = async function (set, uid, query) {
	const setToData = {
		'users:postcount': {title: '[[pages:users/sort-posts]]', crumb: '[[users:top_posters]]'},
		'users:reputation': {title: '[[pages:users/sort-reputation]]', crumb: '[[users:most_reputation]]'},
		'users:joindate': {title: '[[pages:users/latest]]', crumb: '[[global:users]]'},
		'users:online': {title: '[[pages:users/online]]', crumb: '[[global:online]]'},
		'users:banned': {title: '[[pages:users/banned]]', crumb: '[[user:banned]]'},
		'users:flags': {title: '[[pages:users/most-flags]]', crumb: '[[users:most_flags]]'},
	};

	setToData[set] ||= {title: '', crumb: ''};

	const breadcrumbs = [{text: setToData[set].crumb}];

	if (set !== 'users:joindate') {
		breadcrumbs.unshift({text: '[[global:users]]', url: '/users'});
	}

	const page = Number.parseInt(query.page, 10) || 1;
	const resultsPerPage = meta.config.userSearchResultsPerPage;
	const start = Math.max(0, page - 1) * resultsPerPage;
	const stop = start + resultsPerPage - 1;

	const [isAdmin, isGlobalModule, canSearch, usersData] = await Promise.all([
		user.isAdministrator(uid),
		user.isGlobalModerator(uid),
		privileges.global.can('search:users', uid),
		usersController.getUsersAndCount(set, uid, start, stop),
	]);
	const pageCount = Math.ceil(usersData.count / resultsPerPage);
	return {
		users: usersData.users,
		pagination: pagination.create(page, pageCount, query),
		userCount: usersData.count,
		title: setToData[set].title || '[[pages:users/latest]]',
		breadcrumbs: helpers.buildBreadcrumbs(breadcrumbs),
		isAdminOrGlobalMod: isAdmin || isGlobalModule,
		isAdmin,
		isGlobalMod: isGlobalModule,
		displayUserSearch: canSearch,
		[`section_${query.section || 'joindate'}`]: true,
	};
};

usersController.getUsersAndCount = async function (set, uid, start, stop) {
	async function getCount() {
		if (set === 'users:online') {
			return await db.sortedSetCount('users:online', Date.now() - 86_400_000, '+inf');
		}

		if (set === 'users:banned' || set === 'users:flags') {
			return await db.sortedSetCard(set);
		}

		return await db.getObjectField('global', 'userCount');
	}

	async function getUsers() {
		if (set === 'users:online') {
			const count = Number.parseInt(stop, 10) === -1 ? stop : stop - start + 1;
			const data = await db.getSortedSetRevRangeByScoreWithScores(set, start, count, '+inf', Date.now() - 86_400_000);
			const uids = data.map(d => d.value);
			const scores = data.map(d => d.score);
			const [userStatus, userData] = await Promise.all([
				db.getObjectsFields(uids.map(uid => `user:${uid}`), ['status']),
				user.getUsers(uids, uid),
			]);

			for (const [i, user] of userData.entries()) {
				if (user) {
					user.lastonline = scores[i];
					user.lastonlineISO = utils.toISOString(user.lastonline);
					user.userStatus = userStatus[i].status || 'online';
				}
			}

			return userData;
		}

		return await user.getUsersFromSet(set, uid, start, stop);
	}

	const [usersData, count] = await Promise.all([
		getUsers(),
		getCount(),
	]);
	return {
		users: usersData.filter(user => user && Number.parseInt(user.uid, 10)),
		count,
	};
};

async function render(request, res, data) {
	const {registrationType} = meta.config;

	data.maximumInvites = meta.config.maximumInvites;
	data.inviteOnly = registrationType === 'invite-only' || registrationType === 'admin-invite-only';
	data.adminInviteOnly = registrationType === 'admin-invite-only';
	data.invites = await user.getInvitesNumber(request.uid);

	data.showInviteButton = false;
	if (data.adminInviteOnly) {
		data.showInviteButton = await privileges.users.isAdministrator(request.uid);
	} else if (request.loggedIn) {
		const canInvite = await privileges.users.hasInvitePrivilege(request.uid);
		data.showInviteButton = canInvite && (!data.maximumInvites || data.invites < data.maximumInvites);
	}

	data['reputation:disabled'] = meta.config['reputation:disabled'];

	res.append('X-Total-Count', data.userCount);
	res.render('users', data);
}
