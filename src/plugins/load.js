'use strict';

const semver = require('semver');
const async = require('async');
const winston = require('winston');
const nconf = require('nconf');
const _ = require('lodash');
const meta = require('../meta');
const {themeNamePattern} = require('../constants');

module.exports = function (Plugins) {
	async function registerPluginAssets(pluginData, fields) {
		function add(destination, array) {
			destination.push(...(array || []));
		}

		const handlers = {
			staticDirs(next) {
				Plugins.data.getStaticDirectories(pluginData, next);
			},
			cssFiles(next) {
				Plugins.data.getFiles(pluginData, 'css', next);
			},
			lessFiles(next) {
				Plugins.data.getFiles(pluginData, 'less', next);
			},
			acpLessFiles(next) {
				Plugins.data.getFiles(pluginData, 'acpLess', next);
			},
			clientScripts(next) {
				Plugins.data.getScripts(pluginData, 'client', next);
			},
			acpScripts(next) {
				Plugins.data.getScripts(pluginData, 'acp', next);
			},
			modules(next) {
				Plugins.data.getModules(pluginData, next);
			},
			languageData(next) {
				Plugins.data.getLanguageData(pluginData, next);
			},
		};

		let methods = {};
		if (Array.isArray(fields)) {
			for (const field of fields) {
				methods[field] = handlers[field];
			}
		} else {
			methods = handlers;
		}

		const results = await async.parallel(methods);

		Object.assign(Plugins.staticDirs, results.staticDirs || {});
		add(Plugins.cssFiles, results.cssFiles);
		add(Plugins.lessFiles, results.lessFiles);
		add(Plugins.acpLessFiles, results.acpLessFiles);
		add(Plugins.clientScripts, results.clientScripts);
		add(Plugins.acpScripts, results.acpScripts);
		Object.assign(meta.js.scripts.modules, results.modules || {});
		if (results.languageData) {
			Plugins.languageData.languages = _.union(Plugins.languageData.languages, results.languageData.languages);
			Plugins.languageData.namespaces = _.union(Plugins.languageData.namespaces, results.languageData.namespaces);
			pluginData.languageData = results.languageData;
		}

		Plugins.pluginsData[pluginData.id] = pluginData;
	}

	Plugins.prepareForBuild = async function (targets) {
		const map = {
			'plugin static dirs': ['staticDirs'],
			'requirejs modules': ['modules'],
			'client js bundle': ['clientScripts'],
			'admin js bundle': ['acpScripts'],
			'client side styles': ['cssFiles', 'lessFiles'],
			'admin control panel styles': ['cssFiles', 'lessFiles', 'acpLessFiles'],
			languages: ['languageData'],
		};

		const fields = _.uniq(_.flatMap(targets, target => map[target] || []));

		// Clear old data before build
		for (const field of fields) {
			switch (field) {
				case 'clientScripts':
				case 'acpScripts':
				case 'cssFiles':
				case 'lessFiles':
				case 'acpLessFiles': {
					Plugins[field].length = 0;
					break;
				}

				case 'languageData': {
					Plugins.languageData.languages = [];
					Plugins.languageData.namespaces = [];
					break;
				}
            // Do nothing for modules and staticDirs
			}
		}

		winston.verbose(`[plugins] loading the following fields from plugin data: ${fields.join(', ')}`);
		const plugins = await Plugins.data.getActive();
		await Promise.all(plugins.map(p => registerPluginAssets(p, fields)));
	};

	Plugins.loadPlugin = async function (pluginPath) {
		let pluginData;
		try {
			pluginData = await Plugins.data.loadPluginInfo(pluginPath);
		} catch (error) {
			if (error.message === '[[error:parse-error]]') {
				return;
			}

			if (!themeNamePattern.test(pluginPath)) {
				throw error;
			}

			return;
		}

		checkVersion(pluginData);

		try {
			registerHooks(pluginData);
			await registerPluginAssets(pluginData);
		} catch (error) {
			winston.error(error.stack);
			winston.verbose(`[plugins] Could not load plugin : ${pluginData.id}`);
			return;
		}

		if (!pluginData.private) {
			Plugins.loadedPlugins.push({
				id: pluginData.id,
				version: pluginData.version,
			});
		}

		winston.verbose(`[plugins] Loaded plugin: ${pluginData.id}`);
	};

	function checkVersion(pluginData) {
		function add() {
			if (!Plugins.versionWarning.includes(pluginData.id)) {
				Plugins.versionWarning.push(pluginData.id);
			}
		}

		if (pluginData.nbbpm && pluginData.nbbpm.compatibility && semver.validRange(pluginData.nbbpm.compatibility)) {
			if (!semver.satisfies(nconf.get('version'), pluginData.nbbpm.compatibility)) {
				add();
			}
		} else {
			add();
		}
	}

	function registerHooks(pluginData) {
		try {
			if (!Plugins.libraries[pluginData.id]) {
				Plugins.requireLibrary(pluginData);
			}

			if (Array.isArray(pluginData.hooks)) {
				for (const hook of pluginData.hooks) {
					Plugins.hooks.register(pluginData.id, hook);
				}
			}
		} catch (error) {
			winston.warn(`[plugins] Unable to load library for: ${pluginData.id}`);
			throw error;
		}
	}
};
