'use strict';

const careerController = module.exports;

careerController.get = async function (request, res) {
	const careerData = {};
	res.render('career', careerData);
};
