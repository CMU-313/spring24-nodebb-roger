'use strict';

const cproc = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const prompt = require('prompt');
const request = require('request-promise-native');
const semver = require('semver');
const chalk = require('chalk');
const {paths, pluginNamePattern} = require('../constants');
const pkgInstall = require('./package-install');

const packageManager = pkgInstall.getPackageManager();
let packageManagerExecutable = packageManager;
const packageManagerInstallArguments = packageManager === 'yarn' ? ['add'] : ['install', '--save'];

if (process.platform === 'win32') {
	packageManagerExecutable += '.cmd';
}

async function getModuleVersions(modules) {
	const versionHash = {};
	const batch = require('../batch');
	await batch.processArray(modules, async moduleNames => {
		await Promise.all(moduleNames.map(async module => {
			let package_ = await fs.promises.readFile(
				path.join(paths.nodeModules, module, 'package.json'), {encoding: 'utf-8'},
			);
			package_ = JSON.parse(package_);
			versionHash[module] = package_.version;
		}));
	}, {
		batch: 50,
	});

	return versionHash;
}

async function getInstalledPlugins() {
	let [deps, bundled] = await Promise.all([
		fs.promises.readFile(paths.currentPackage, {encoding: 'utf-8'}),
		fs.promises.readFile(paths.installPackage, {encoding: 'utf-8'}),
	]);

	deps = Object.keys(JSON.parse(deps).dependencies)
		.filter(packageName => pluginNamePattern.test(packageName));
	bundled = Object.keys(JSON.parse(bundled).dependencies)
		.filter(packageName => pluginNamePattern.test(packageName));

	// Whittle down deps to send back only extraneously installed plugins/themes/etc
	const checklist = deps.filter(packageName => {
		if (bundled.includes(packageName)) {
			return false;
		}

		// Ignore git repositories
		try {
			fs.accessSync(path.join(paths.nodeModules, packageName, '.git'));
			return false;
		} catch {
			return true;
		}
	});

	return await getModuleVersions(checklist);
}

async function getCurrentVersion() {
	let package_ = await fs.promises.readFile(paths.installPackage, {encoding: 'utf-8'});
	package_ = JSON.parse(package_);
	return package_.version;
}

async function getSuggestedModules(nbbVersion, toCheck) {
	let body = await request({
		method: 'GET',
		url: `https://packages.nodebb.org/api/v1/suggest?version=${nbbVersion}&package[]=${toCheck.join('&package[]=')}`,
		json: true,
	});
	if (!Array.isArray(body) && toCheck.length === 1) {
		body = [body];
	}

	return body;
}

async function checkPlugins() {
	process.stdout.write('Checking installed plugins and themes for updates... ');
	const [plugins, nbbVersion] = await Promise.all([
		getInstalledPlugins(),
		getCurrentVersion(),
	]);

	const toCheck = Object.keys(plugins);
	if (toCheck.length === 0) {
		process.stdout.write(chalk.green('  OK'));
		return []; // No extraneous plugins installed
	}

	const suggestedModules = await getSuggestedModules(nbbVersion, toCheck);
	process.stdout.write(chalk.green('  OK'));

	let current;
	let suggested;
	const upgradable = suggestedModules.map(suggestObject => {
		current = plugins[suggestObject.package];
		suggested = suggestObject.version;

		if (suggestObject.code === 'match-found' && semver.gt(suggested, current)) {
			return {
				name: suggestObject.package,
				current,
				suggested,
			};
		}

		return null;
	}).filter(Boolean);

	return upgradable;
}

async function upgradePlugins() {
	try {
		const found = await checkPlugins();
		if (found && found.length > 0) {
			process.stdout.write(`\n\nA total of ${chalk.bold(String(found.length))} package(s) can be upgraded:\n\n`);
			for (const suggestObject of found) {
				process.stdout.write(`${chalk.yellow('  * ') + suggestObject.name} (${chalk.yellow(suggestObject.current)} -> ${chalk.green(suggestObject.suggested)})\n`);
			}
		} else {
			console.log(chalk.green('\nAll packages up-to-date!'));
			return;
		}

		prompt.message = '';
		prompt.delimiter = '';

		prompt.start();
		const result = await prompt.get({
			name: 'upgrade',
			description: '\nProceed with upgrade (y|n)?',
			type: 'string',
		});

		if (['y', 'Y', 'yes', 'YES'].includes(result.upgrade)) {
			console.log('\nUpgrading packages...');
			const arguments_ = packageManagerInstallArguments.concat(found.map(suggestObject => `${suggestObject.name}@${suggestObject.suggested}`));

			cproc.execFileSync(packageManagerExecutable, arguments_, {stdio: 'ignore'});
		} else {
			console.log(`${chalk.yellow('Package upgrades skipped')}. Check for upgrades at any time by running "${chalk.green('./nodebb upgrade -p')}".`);
		}
	} catch (error) {
		console.log(`${chalk.yellow('Warning')}: An unexpected error occured when attempting to verify plugin upgradability`);
		throw error;
	}
}

exports.upgradePlugins = upgradePlugins;
