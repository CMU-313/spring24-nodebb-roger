'use strict';

const admin = require('../../rewards/admin');

const rewardsController = module.exports;

rewardsController.get = async function (request, res) {
	const data = await admin.get();
	res.render('admin/extend/rewards', data);
};
