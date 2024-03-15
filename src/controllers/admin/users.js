'use strict';

const validator = require('validator');
const user = require('../../user');
const meta = require('../../meta');
const db = require('../../database');
const pagination = require('../../pagination');
const events = require('../../events');
const plugins = require('../../plugins');
const privileges = require('../../privileges');
const utils = require('../../utils');

const usersController = module.exports;

const userFields = [
	'uid',
	'username',
	'userslug',
	'email',
	'postcount',
	'joindate',
	'banned',
	'reputation',
	'picture',
	'flags',
	'lastonline',
	'email:confirmed',
];

usersController.index = async function (request, res) {
	await (request.query.query ? usersController.search(request, res) : getUsers(request, res));
};

async function getUsers(request, res) {
	const sortDirection = request.query.sortDirection || 'desc';
	const reverse = sortDirection === 'desc';

	const page = Number.parseInt(request.query.page, 10) || 1;
	let resultsPerPage = Number.parseInt(request.query.resultsPerPage, 10) || 50;
	if (![50, 100, 250, 500].includes(resultsPerPage)) {
		resultsPerPage = 50;
	}

	let sortBy = validator.escape(request.query.sortBy || '');
	const filterBy = Array.isArray(request.query.filters || []) ? (request.query.filters || []) : [request.query.filters];
	const start = Math.max(0, page - 1) * resultsPerPage;
	const stop = start + resultsPerPage - 1;

	function buildSet() {
		const sortToSet = {
			postcount: 'users:postcount',
			reputation: 'users:reputation',
			joindate: 'users:joindate',
			lastonline: 'users:online',
			flags: 'users:flags',
		};

		const set = [];
		if (sortBy) {
			set.push(sortToSet[sortBy]);
		}

		if (filterBy.includes('unverified')) {
			set.push('group:unverified-users:members');
		}

		if (filterBy.includes('verified')) {
			set.push('group:verified-users:members');
		}

		if (filterBy.includes('banned')) {
			set.push('users:banned');
		}

		if (set.length === 0) {
			set.push('users:online');
			sortBy = 'lastonline';
		}

		return set.length > 1 ? set : set[0];
	}

	async function getCount(set) {
		if (Array.isArray(set)) {
			return await db.sortedSetIntersectCard(set);
		}

		return await db.sortedSetCard(set);
	}

	async function getUids(set) {
		let uids = [];
		if (Array.isArray(set)) {
			const weights = set.map((s, index) => (index ? 0 : 1));
			uids = await db[reverse ? 'getSortedSetRevIntersect' : 'getSortedSetIntersect']({
				sets: set,
				start,
				stop,
				weights,
			});
		} else {
			uids = await db[reverse ? 'getSortedSetRevRange' : 'getSortedSetRange'](set, start, stop);
		}

		return uids;
	}

	const set = buildSet();
	const uids = await getUids(set);
	const [count, users] = await Promise.all([
		getCount(set),
		loadUserInfo(request.uid, uids),
	]);

	await render(request, res, {
		users: users.filter(user => user && Number.parseInt(user.uid, 10)),
		page,
		pageCount: Math.max(1, Math.ceil(count / resultsPerPage)),
		resultsPerPage,
		reverse,
		sortBy,
	});
}

usersController.search = async function (request, res) {
	const sortDirection = request.query.sortDirection || 'desc';
	const reverse = sortDirection === 'desc';
	const page = Number.parseInt(request.query.page, 10) || 1;
	let resultsPerPage = Number.parseInt(request.query.resultsPerPage, 10) || 50;
	if (![50, 100, 250, 500].includes(resultsPerPage)) {
		resultsPerPage = 50;
	}

	const searchData = await user.search({
		uid: request.uid,
		query: request.query.query,
		searchBy: request.query.searchBy,
		sortBy: request.query.sortBy,
		sortDirection,
		filters: request.query.filters,
		page,
		resultsPerPage,
		async findUids(query, searchBy, hardCap) {
			if (!query || query.length < 2) {
				return [];
			}

			query = String(query).toLowerCase();
			if (!query.endsWith('*')) {
				query += '*';
			}

			const data = await db.getSortedSetScan({
				key: `${searchBy}:sorted`,
				match: query,
				limit: hardCap || (resultsPerPage * 10),
			});
			return data.map(data => data.split(':').pop());
		},
	});

	const uids = searchData.users.map(user => user && user.uid);
	searchData.users = await loadUserInfo(request.uid, uids);
	if (request.query.searchBy === 'ip') {
		for (const user of searchData.users) {
			user.ip = user.ips.find(ip => ip.includes(String(request.query.query)));
		}
	}

	searchData.query = validator.escape(String(request.query.query || ''));
	searchData.page = page;
	searchData.resultsPerPage = resultsPerPage;
	searchData.sortBy = request.query.sortBy;
	searchData.reverse = reverse;
	await render(request, res, searchData);
};

async function loadUserInfo(callerUid, uids) {
	async function getIPs() {
		return await Promise.all(uids.map(uid => db.getSortedSetRevRange(`uid:${uid}:ip`, 0, -1)));
	}

	const [isAdmin, userData, lastonline, ips] = await Promise.all([
		user.isAdministrator(uids),
		user.getUsersWithFields(uids, userFields, callerUid),
		db.sortedSetScores('users:online', uids),
		getIPs(),
	]);
	for (const [index, user] of userData.entries()) {
		if (user) {
			user.administrator = isAdmin[index];
			user.flags = userData[index].flags || 0;
			const timestamp = lastonline[index] || user.joindate;
			user.lastonline = timestamp;
			user.lastonlineISO = utils.toISOString(timestamp);
			user.ips = ips[index];
			user.ip = ips[index] && ips[index][0] ? ips[index][0] : null;
		}
	}

	return userData;
}

usersController.registrationQueue = async function (request, res) {
	const page = Number.parseInt(request.query.page, 10) || 1;
	const itemsPerPage = 20;
	const start = (page - 1) * 20;
	const stop = start + itemsPerPage - 1;

	const data = await utils.promiseParallel({
		registrationQueueCount: db.sortedSetCard('registration:queue'),
		users: user.getRegistrationQueue(start, stop),
		customHeaders: plugins.hooks.fire('filter:admin.registrationQueue.customHeaders', {headers: []}),
		invites: getInvites(),
	});
	const pageCount = Math.max(1, Math.ceil(data.registrationQueueCount / itemsPerPage));
	data.pagination = pagination.create(page, pageCount);
	data.customHeaders = data.customHeaders.headers;
	res.render('admin/manage/registration', data);
};

async function getInvites() {
	const invitations = await user.getAllInvites();
	const uids = invitations.map(invite => invite.uid);
	let usernames = await user.getUsersFields(uids, ['username']);
	usernames = usernames.map(user => user.username);

	for (const [index, invites] of invitations.entries()) {
		invites.username = usernames[index];
	}

	async function getUsernamesByEmails(emails) {
		const uids = await db.sortedSetScores('email:uid', emails.map(email => String(email).toLowerCase()));
		const usernames = await user.getUsersFields(uids, ['username']);
		return usernames.map(user => user.username);
	}

	usernames = await Promise.all(invitations.map(invites => getUsernamesByEmails(invites.invitations)));

	for (const [index, invites] of invitations.entries()) {
		invites.invitations = invites.invitations.map((email, i) => ({
			email,
			username: usernames[index][i] === '[[global:guest]]' ? '' : usernames[index][i],
		}));
	}

	return invitations;
}

async function render(request, res, data) {
	data.pagination = pagination.create(data.page, data.pageCount, request.query);

	const {registrationType} = meta.config;

	data.inviteOnly = registrationType === 'invite-only' || registrationType === 'admin-invite-only';
	data.adminInviteOnly = registrationType === 'admin-invite-only';
	data[`sort_${data.sortBy}`] = true;
	if (request.query.searchBy) {
		data[`searchBy_${validator.escape(String(request.query.searchBy))}`] = true;
	}

	const filterBy = Array.isArray(request.query.filters || []) ? (request.query.filters || []) : [request.query.filters];
	for (const filter of filterBy) {
		data[`filterBy_${validator.escape(String(filter))}`] = true;
	}

	data.userCount = Number.parseInt(await db.getObjectField('global', 'userCount'), 10);
	data.showInviteButton = await (data.adminInviteOnly ? privileges.users.isAdministrator(request.uid) : privileges.users.hasInvitePrivilege(request.uid));

	res.render('admin/manage/users', data);
}

usersController.getCSV = async function (request, res, next) {
	await events.log({
		type: 'getUsersCSV',
		uid: request.uid,
		ip: request.ip,
	});
	const path = require('node:path');
	const {baseDir} = require('../../constants').paths;
	res.sendFile('users.csv', {
		root: path.join(baseDir, 'build/export'),
		headers: {
			'Content-Type': 'text/csv',
			'Content-Disposition': 'attachment; filename=users.csv',
		},
	}, error => {
		if (error) {
			if (error.code === 'ENOENT') {
				res.locals.isAPI = false;
				return next();
			}

			return next(error);
		}
	});
};
