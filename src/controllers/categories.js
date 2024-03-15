'use strict';

const nconf = require('nconf');
const _ = require('lodash');
const categories = require('../categories');
const meta = require('../meta');
const pagination = require('../pagination');
const privileges = require('../privileges');
const helpers = require('./helpers');

const categoriesController = module.exports;

categoriesController.list = async function (request, res) {
	res.locals.metaTags = [{
		name: 'title',
		content: String(meta.config.title || 'NodeBB'),
	}, {
		property: 'og:type',
		content: 'website',
	}];

	const allRootCids = await categories.getAllCidsFromSet('cid:0:children');
	const rootCids = await privileges.categories.filterCids('find', allRootCids, request.uid);
	const pageCount = Math.max(1, Math.ceil(rootCids.length / meta.config.categoriesPerPage));
	const page = Math.min(Number.parseInt(request.query.page, 10) || 1, pageCount);
	const start = Math.max(0, (page - 1) * meta.config.categoriesPerPage);
	const stop = start + meta.config.categoriesPerPage - 1;
	const pageCids = rootCids.slice(start, stop + 1);

	const allChildCids = (await Promise.all(pageCids.map(categories.getChildrenCids))).flat();
	const childCids = await privileges.categories.filterCids('find', allChildCids, request.uid);
	const categoryData = await categories.getCategories(pageCids.concat(childCids), request.uid);
	const tree = categories.getTree(categoryData, 0);
	await categories.getRecentTopicReplies(categoryData, request.uid, request.query);

	const data = {
		title: meta.config.homePageTitle || '[[pages:home]]',
		selectCategoryLabel: '[[pages:categories]]',
		categories: tree,
		pagination: pagination.create(page, pageCount, request.query),
	};

	for (const category of data.categories) {
		if (category) {
			helpers.trimChildren(category);
			helpers.setCategoryTeaser(category);
		}
	}

	if (request.originalUrl.startsWith(`${nconf.get('relative_path')}/api/categories`) || request.originalUrl.startsWith(`${nconf.get('relative_path')}/categories`)) {
		data.title = '[[pages:categories]]';
		data.breadcrumbs = helpers.buildBreadcrumbs([{text: data.title}]);
		res.locals.metaTags.push({
			property: 'og:title',
			content: '[[pages:categories]]',
		});
	}

	res.render('categories', data);
};
