'use strict';

const fs = require('node:fs').promises;
const helpers = require('../helpers');

const Files = module.exports;

Files.delete = async (request, res) => {
	await fs.unlink(res.locals.cleanedPath);
	helpers.formatApiResponse(200, res);
};

Files.createFolder = async (request, res) => {
	await fs.mkdir(res.locals.folderPath);
	helpers.formatApiResponse(200, res);
};
