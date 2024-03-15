'use strict';

const _ = require('lodash');
const db = require('../../database');
const groups = require('../../groups');
const categories = require('../../categories');
const user = require('../../user');
const meta = require('../../meta');
const pagination = require('../../pagination');
const categoriesController = require('./categories');

const AdminsMods = module.exports;

AdminsMods.get = async function (request, res) {
	const rootCid = Number.parseInt(request.query.cid, 10) || 0;

	const cidsCount = await db.sortedSetCard(`cid:${rootCid}:children`);

	const pageCount = Math.max(1, Math.ceil(cidsCount / meta.config.categoriesPerPage));
	const page = Math.min(Number.parseInt(request.query.page, 10) || 1, pageCount);
	const start = Math.max(0, (page - 1) * meta.config.categoriesPerPage);
	const stop = start + meta.config.categoriesPerPage - 1;

	const cids = await db.getSortedSetRange(`cid:${rootCid}:children`, start, stop);

	const selectedCategory = rootCid ? await categories.getCategoryData(rootCid) : null;
	const pageCategories = await categories.getCategoriesData(cids);

	const [admins, globalMods, moderators, crumbs] = await Promise.all([
		groups.get('administrators', {uid: request.uid}),
		groups.get('Global Moderators', {uid: request.uid}),
		getModeratorsOfCategories(pageCategories),
		categoriesController.buildBreadCrumbs(selectedCategory, '/admin/manage/admins-mods'),
	]);

	res.render('admin/manage/admins-mods', {
		admins,
		globalMods,
		categoryMods: moderators,
		selectedCategory,
		pagination: pagination.create(page, pageCount, request.query),
		breadcrumbs: crumbs,
	});
};

async function getModeratorsOfCategories(categoryData) {
	const [moderatorUids, childrenCounts] = await Promise.all([
		categories.getModeratorUids(categoryData.map(c => c.cid)),
		db.sortedSetsCard(categoryData.map(c => `cid:${c.cid}:children`)),
	]);

	const uids = _.uniq(moderatorUids.flat());
	const moderatorData = await user.getUsersFields(uids, ['uid', 'username', 'userslug', 'picture']);
	const moderatorMap = _.zipObject(uids, moderatorData);
	for (const [index, c] of categoryData.entries()) {
		c.moderators = moderatorUids[index].map(uid => moderatorMap[uid]);
		c.subCategoryCount = childrenCounts[index];
	}

	return categoryData;
}
