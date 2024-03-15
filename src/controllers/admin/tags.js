'use strict';

const topics = require('../../topics');

const tagsController = module.exports;

tagsController.get = async function (request, res) {
	const tags = await topics.getTags(0, 199);
	res.render('admin/manage/tags', {tags});
};
