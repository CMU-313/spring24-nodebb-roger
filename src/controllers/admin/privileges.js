'use strict';

const categories = require('../../categories');
const privileges = require('../../privileges');

const privilegesController = module.exports;

privilegesController.get = async function (request, res) {
	const cid = request.params.cid ? Number.parseInt(request.params.cid, 10) || 0 : 0;
	const isAdminPriv = request.params.cid === 'admin';

	let privilegesData;
	if (cid > 0) {
		privilegesData = await privileges.categories.list(cid);
	} else if (cid === 0) {
		privilegesData = await (isAdminPriv ? privileges.admin.list(request.uid) : privileges.global.list());
	}

	const categoriesData = [{
		cid: 0,
		name: '[[admin/manage/privileges:global]]',
		icon: 'fa-list',
	}, {
		cid: 'admin',
		name: '[[admin/manage/privileges:admin]]',
		icon: 'fa-lock',
	}];

	let selectedCategory;
	for (const category of categoriesData) {
		if (category) {
			category.selected = category.cid === (isAdminPriv ? 'admin' : cid);

			if (category.selected) {
				selectedCategory = category;
			}
		}
	}

	selectedCategory ||= await categories.getCategoryFields(cid, ['cid', 'name', 'icon', 'bgColor', 'color']);

	const group = request.query.group ? request.query.group : '';
	res.render('admin/manage/privileges', {
		privileges: privilegesData,
		categories: categoriesData,
		selectedCategory,
		cid,
		group,
		isAdminPriv,
	});
};
