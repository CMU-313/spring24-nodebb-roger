'use strict';

const db = require('../../database');
const user = require('../../user');
const helpers = require('../helpers');
const pagination = require('../../pagination');
const accountHelpers = require('./helpers');

const infoController = module.exports;

infoController.get = async function (request, res, next) {
	const userData = await accountHelpers.getUserDataByUserSlug(request.params.userslug, request.uid, request.query);
	if (!userData) {
		return next();
	}

	const page = Math.max(1, request.query.page || 1);
	const itemsPerPage = 10;
	const start = (page - 1) * itemsPerPage;
	const stop = start + itemsPerPage - 1;

	const [history, sessions, usernames, emails, notes] = await Promise.all([
		user.getModerationHistory(userData.uid),
		user.auth.getSessions(userData.uid, request.sessionID),
		user.getHistory(`user:${userData.uid}:usernames`),
		user.getHistory(`user:${userData.uid}:emails`),
		getNotes(userData, start, stop),
	]);

	userData.history = history;
	userData.sessions = sessions;
	userData.usernames = usernames;
	userData.emails = emails;

	if (userData.isAdminOrGlobalModeratorOrModerator) {
		userData.moderationNotes = notes.notes;
		const pageCount = Math.ceil(notes.count / itemsPerPage);
		userData.pagination = pagination.create(page, pageCount, request.query);
	}

	userData.title = '[[pages:account/info]]';
	userData.breadcrumbs = helpers.buildBreadcrumbs([{text: userData.username, url: `/user/${userData.userslug}`}, {text: '[[user:account_info]]'}]);

	res.render('account/info', userData);
};

async function getNotes(userData, start, stop) {
	if (!userData.isAdminOrGlobalModeratorOrModerator) {
		return;
	}

	const [notes, count] = await Promise.all([
		user.getModerationNotes(userData.uid, start, stop),
		db.sortedSetCard(`uid:${userData.uid}:moderation:notes`),
	]);
	return {notes, count};
}
