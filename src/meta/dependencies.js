'use strict';

const path = require('node:path');
const fs = require('node:fs');
const semver = require('semver');
const winston = require('winston');
const chalk = require('chalk');
const pkg = require('../../package.json');
const {paths, pluginNamePattern} = require('../constants');

const Dependencies = module.exports;

let depsMissing = false;
let depsOutdated = false;

Dependencies.check = async function () {
	const modules = Object.keys(pkg.dependencies);

	winston.verbose('Checking dependencies for outdated modules');

	await Promise.all(modules.map(module => Dependencies.checkModule(module)));

	if (depsMissing) {
		throw new Error('dependencies-missing');
	} else if (depsOutdated && global.env !== 'development') {
		throw new Error('dependencies-out-of-date');
	}
};

Dependencies.checkModule = async function (moduleName) {
	try {
		let packageData = await fs.promises.readFile(path.join(paths.nodeModules, moduleName, 'package.json'), 'utf8');
		packageData = Dependencies.parseModuleData(moduleName, packageData);

		const satisfies = Dependencies.doesSatisfy(packageData, pkg.dependencies[moduleName]);
		return satisfies;
	} catch (error) {
		if (error.code === 'ENOENT' && pluginNamePattern.test(moduleName)) {
			winston.warn(`[meta/dependencies] Bundled plugin ${moduleName} not found, skipping dependency check.`);
			return true;
		}

		throw error;
	}
};

Dependencies.parseModuleData = function (moduleName, packageData) {
	try {
		packageData = JSON.parse(packageData);
	} catch {
		winston.warn(`[${chalk.red('missing')}] ${chalk.bold(moduleName)} is a required dependency but could not be found\n`);
		depsMissing = true;
		return null;
	}

	return packageData;
};

Dependencies.doesSatisfy = function (moduleData, packageJSONVersion) {
	if (!moduleData) {
		return false;
	}

	const versionOk = !semver.validRange(packageJSONVersion)
        || semver.satisfies(moduleData.version, packageJSONVersion);
	const githubRepo = moduleData._resolved && moduleData._resolved.includes('//github.com');
	const satisfies = versionOk || githubRepo;
	if (!satisfies) {
		winston.warn(`[${chalk.yellow('outdated')}] ${chalk.bold(moduleData.name)} installed v${moduleData.version}, package.json requires ${packageJSONVersion}\n`);
		depsOutdated = true;
	}

	return satisfies;
};
