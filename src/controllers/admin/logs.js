'use strict';

const validator = require('validator');
const winston = require('winston');
const meta = require('../../meta');

const logsController = module.exports;

logsController.get = async function (request, res) {
	let logs = '';
	try {
		logs = await meta.logs.get();
	} catch (error) {
		winston.error(error.stack);
	}

	res.render('admin/advanced/logs', {
		data: validator.escape(logs),
	});
};
