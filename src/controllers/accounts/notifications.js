'use strict';

const user = require('../../user');
const helpers = require('../helpers');
const plugins = require('../../plugins');
const pagination = require('../../pagination');

const notificationsController = module.exports;

notificationsController.get = async function (request, res, next) {
	const regularFilters = [
		{name: '[[notifications:all]]', filter: ''},
		{name: '[[global:topics]]', filter: 'new-topic'},
		{name: '[[notifications:replies]]', filter: 'new-reply'},
		{name: '[[notifications:chat]]', filter: 'new-chat'},
		{name: '[[notifications:group-chat]]', filter: 'new-group-chat'},
		{name: '[[notifications:follows]]', filter: 'follow'},
		{name: '[[notifications:upvote]]', filter: 'upvote'},
	];

	const moderatorFilters = [
		{name: '[[notifications:new-flags]]', filter: 'new-post-flag'},
		{name: '[[notifications:my-flags]]', filter: 'my-flags'},
		{name: '[[notifications:bans]]', filter: 'ban'},
	];

	const filter = request.query.filter || '';
	const page = Math.max(1, request.query.page || 1);
	const itemsPerPage = 20;
	const start = (page - 1) * itemsPerPage;
	const stop = start + itemsPerPage - 1;

	const [filters, isPrivileged] = await Promise.all([
		plugins.hooks.fire('filter:notifications.addFilters', {
			regularFilters,
			moderatorFilters,
			uid: request.uid,
		}),
		user.isPrivileged(request.uid),
	]);

	let allFilters = filters.regularFilters;
	if (isPrivileged) {
		allFilters = allFilters.concat([
			{separator: true},
		]).concat(filters.moderatorFilters);
	}

	const selectedFilter = allFilters.find(filterData => {
		filterData.selected = filterData.filter === filter;
		return filterData.selected;
	});
	if (!selectedFilter) {
		return next();
	}

	const nids = await user.notifications.getAll(request.uid, selectedFilter.filter);
	let notifications = await user.notifications.getNotifications(nids, request.uid);

	const pageCount = Math.max(1, Math.ceil(notifications.length / itemsPerPage));
	notifications = notifications.slice(start, stop + 1);

	res.render('notifications', {
		notifications,
		pagination: pagination.create(page, pageCount, request.query),
		filters: allFilters,
		regularFilters,
		moderatorFilters,
		selectedFilter,
		title: '[[pages:notifications]]',
		breadcrumbs: helpers.buildBreadcrumbs([{text: '[[pages:notifications]]'}]),
	});
};
