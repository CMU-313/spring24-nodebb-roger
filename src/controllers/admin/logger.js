'use strict';

const loggerController = module.exports;

loggerController.get = function (request, res) {
	res.render('admin/development/logger', {});
};
