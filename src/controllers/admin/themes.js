'use strict';

const path = require('node:path');
const fs = require('node:fs');
const file = require('../../file');
const {paths} = require('../../constants');

const themesController = module.exports;

const defaultScreenshotPath = path.join(__dirname, '../../../public/images/themes/default.png');

themesController.get = async function (request, res, next) {
	const themeDir = path.join(paths.themes, request.params.theme);
	const themeConfigPath = path.join(themeDir, 'theme.json');

	let themeConfig;
	try {
		themeConfig = await fs.promises.readFile(themeConfigPath, 'utf8');
		themeConfig = JSON.parse(themeConfig);
	} catch (error) {
		if (error.code === 'ENOENT') {
			return next(new Error('invalid-data'));
		}

		return next(error);
	}

	const screenshotPath = themeConfig.screenshot ? path.join(themeDir, themeConfig.screenshot) : defaultScreenshotPath;
	const exists = await file.exists(screenshotPath);
	res.sendFile(exists ? screenshotPath : defaultScreenshotPath);
};
