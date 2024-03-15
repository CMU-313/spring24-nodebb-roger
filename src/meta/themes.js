'use strict';

const path = require('node:path');
const fs = require('node:fs');
const nconf = require('nconf');
const winston = require('winston');
const _ = require('lodash');
const file = require('../file');
const events = require('../events');
const utils = require('../utils');
const {themeNamePattern} = require('../constants');
const Meta = require('./index');

const Themes = module.exports;

Themes.get = async () => {
	const themePath = nconf.get('themes_path');
	if (typeof themePath !== 'string') {
		return [];
	}

	let themes = await getThemes(themePath);
	themes = themes.flat().filter(Boolean);
	themes = await Promise.all(themes.map(async theme => {
		const config = path.join(themePath, theme, 'theme.json');
		const pack = path.join(themePath, theme, 'package.json');
		try {
			const [configFile, packageFile] = await Promise.all([
				fs.promises.readFile(config, 'utf8'),
				fs.promises.readFile(pack, 'utf8'),
			]);
			const configObject = JSON.parse(configFile);
			const packageObject = JSON.parse(packageFile);

			configObject.id = packageObject.name;

			// Minor adjustments for API output
			configObject.type = 'local';
			configObject.screenshot_url = configObject.screenshot ? `${nconf.get('relative_path')}/css/previews/${encodeURIComponent(configObject.id)}` : `${nconf.get('relative_path')}/assets/images/themes/default.png`;

			return configObject;
		} catch (error) {
			if (error.code === 'ENOENT') {
				return false;
			}

			winston.error(`[themes] Unable to parse theme.json ${theme}`);
			return false;
		}
	}));

	return themes.filter(Boolean);
};

async function getThemes(themePath) {
	let directories = await fs.promises.readdir(themePath);
	directories = directories.filter(dir => themeNamePattern.test(dir) || dir.startsWith('@'));
	return await Promise.all(directories.map(async dir => {
		try {
			const dirpath = path.join(themePath, dir);
			const stat = await fs.promises.stat(dirpath);
			if (!stat.isDirectory()) {
				return false;
			}

			if (!dir.startsWith('@')) {
				return dir;
			}

			const themes = await getThemes(path.join(themePath, dir));
			return themes.map(theme => path.join(dir, theme));
		} catch (error) {
			if (error.code === 'ENOENT') {
				return false;
			}

			throw error;
		}
	}));
}

Themes.set = async data => {
	switch (data.type) {
		case 'local': {
			const current = await Meta.configs.get('theme:id');

			if (current !== data.id) {
				const pathToThemeJson = path.join(nconf.get('themes_path'), data.id, 'theme.json');
				if (!pathToThemeJson.startsWith(nconf.get('themes_path'))) {
					throw new Error('[[error:invalid-theme-id]]');
				}

				let config = await fs.promises.readFile(pathToThemeJson, 'utf8');
				config = JSON.parse(config);

				// Re-set the themes path (for when NodeBB is reloaded)
				Themes.setPath(config);

				await Meta.configs.setMultiple({
					'theme:type': data.type,
					'theme:id': data.id,
					'theme:staticDir': config.staticDir ? config.staticDir : '',
					'theme:templates': config.templates ? config.templates : '',
					'theme:src': '',
					bootswatchSkin: '',
				});

				await events.log({
					type: 'theme-set',
					uid: Number.parseInt(data.uid, 10) || 0,
					ip: data.ip || '127.0.0.1',
					text: data.id,
				});

				Meta.reloadRequired = true;
			}

			break;
		}

		case 'bootswatch': {
			await Meta.configs.setMultiple({
				'theme:src': data.src,
				bootswatchSkin: data.id.toLowerCase(),
			});
			break;
		}
	}
};

Themes.setupPaths = async () => {
	const data = await utils.promiseParallel({
		themesData: Themes.get(),
		currentThemeId: Meta.configs.get('theme:id'),
	});

	const themeId = data.currentThemeId || 'nodebb-theme-persona';

	if (process.env.NODE_ENV === 'development') {
		winston.info(`[themes] Using theme ${themeId}`);
	}

	const themeObject = data.themesData.find(themeObject_ => themeObject_.id === themeId);

	if (!themeObject) {
		throw new Error('[[error:theme-not-found]]');
	}

	Themes.setPath(themeObject);
};

Themes.setPath = function (themeObject) {
	// Theme's templates path
	let themePath = nconf.get('base_templates_path');
	const fallback = path.join(nconf.get('themes_path'), themeObject.id, 'templates');

	if (themeObject.templates) {
		themePath = path.join(nconf.get('themes_path'), themeObject.id, themeObject.templates);
	} else if (file.existsSync(fallback)) {
		themePath = fallback;
	}

	nconf.set('theme_templates_path', themePath);
	nconf.set('theme_config', path.join(nconf.get('themes_path'), themeObject.id, 'theme.json'));
};
