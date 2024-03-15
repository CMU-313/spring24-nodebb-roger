'use strict';

const appearanceController = module.exports;

appearanceController.get = function (request, res) {
	const term = request.params.term ? request.params.term : 'themes';

	res.render(`admin/appearance/${term}`, {});
};
