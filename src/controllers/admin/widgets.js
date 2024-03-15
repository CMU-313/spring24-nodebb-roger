'use strict';

const widgetsController = module.exports;
const admin = require('../../widgets/admin');

widgetsController.get = async function (request, res) {
	const data = await admin.get();
	res.render('admin/extend/widgets', data);
};
