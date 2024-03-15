'use strict';

const path = require('node:path');
const fs = require('node:fs');
const cproc = require('node:child_process');
const {paths, pluginNamePattern} = require('../constants');

const packageInstall = module.exports;

function sortDependencies(dependencies) {
	return Object.entries(dependencies)
		.sort((a, b) => (a < b ? -1 : 1))
		.reduce((memo, package_) => {
			memo[package_[0]] = package_[1];
			return memo;
		}, {});
}

packageInstall.updatePackageFile = () => {
	let oldPackageContents;

	try {
		oldPackageContents = JSON.parse(fs.readFileSync(paths.currentPackage, 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT') {
			// No local package.json, copy from install/package.json
			fs.copyFileSync(paths.installPackage, paths.currentPackage);
			return;
		}

		throw error;
	}

	const _ = require('lodash');
	const defaultPackageContents = JSON.parse(fs.readFileSync(paths.installPackage, 'utf8'));

	let dependencies = {};
	for (const [dep, version] of Object.entries(oldPackageContents.dependencies || {})) {
		if (pluginNamePattern.test(dep)) {
			dependencies[dep] = version;
		}
	}

	const {devDependencies} = defaultPackageContents;

	// Sort dependencies alphabetically
	dependencies = sortDependencies({...dependencies, ...defaultPackageContents.dependencies});

	const packageContents = {..._.merge(oldPackageContents, defaultPackageContents), dependencies, devDependencies};
	fs.writeFileSync(paths.currentPackage, JSON.stringify(packageContents, null, 4));
};

packageInstall.supportedPackageManager = [
	'npm',
	'cnpm',
	'pnpm',
	'yarn',
];

packageInstall.getPackageManager = () => {
	try {
		const packageContents = require(paths.currentPackage);
		// This regex technically allows invalid values:
		// cnpm isn't supported by corepack and it doesn't enforce a version string being present
		const pmRegex = new RegExp(`^(?<packageManager>${packageInstall.supportedPackageManager.join('|')})@?[\\d\\w\\.\\-]*$`);
		const packageManager = packageContents.packageManager ? packageContents.packageManager.match(pmRegex) : false;
		if (packageManager) {
			return packageManager.groups.packageManager;
		}

		fs.accessSync(path.join(paths.nodeModules, 'nconf/package.json'), fs.constants.R_OK);
		const nconf = require('nconf');
		if (Object.keys(nconf.stores).length === 0) {
			// Quick & dirty nconf setup for when you cannot rely on nconf having been required already
			const configFile = path.resolve(__dirname, '../../', nconf.any(['config', 'CONFIG']) || 'config.json');
			nconf.env().file({ // Not sure why adding .argv() causes the process to terminate
				file: configFile,
			});
		}

		if (nconf.get('package_manager') && !packageInstall.supportedPackageManager.includes(nconf.get('package_manager'))) {
			nconf.clear('package_manager');
		}

		if (!nconf.get('package_manager')) {
			nconf.set('package_manager', getPackageManagerByLockfile());
		}

		return nconf.get('package_manager') || 'npm';
	} catch {
		// Nconf not installed or other unexpected error/exception
		return getPackageManagerByLockfile() || 'npm';
	}
};

function getPackageManagerByLockfile() {
	for (const [packageManager, lockfile] of Object.entries({npm: 'package-lock.json', yarn: 'yarn.lock', pnpm: 'pnpm-lock.yaml'})) {
		try {
			fs.accessSync(path.resolve(__dirname, `../../${lockfile}`), fs.constants.R_OK);
			return packageManager;
		} catch {}
	}
}

packageInstall.installAll = () => {
	const production = process.env.NODE_ENV === 'production';
	let command = 'npm install';

	const supportedPackageManagerList = exports.supportedPackageManager; // Load config from src/cli/package-install.js
	const packageManager = packageInstall.getPackageManager();
	if (supportedPackageManagerList.includes(packageManager)) {
		switch (packageManager) {
			case 'yarn': {
				command = `yarn${production ? ' --production' : ''}`;
				break;
			}

			case 'pnpm': {
				command = 'pnpm install'; // Pnpm checks NODE_ENV
				break;
			}

			case 'cnpm': {
				command = `cnpm install ${production ? ' --production' : ''}`;
				break;
			}

			default: {
				command += production ? ' --omit=dev' : '';
				break;
			}
		}
	}

	try {
		cproc.execSync(command, {
			cwd: path.join(__dirname, '../../'),
			stdio: [0, 1, 2],
		});
	} catch (error) {
		console.log('Error installing dependencies!');
		console.log(`message: ${error.message}`);
		console.log(`stdout: ${error.stdout}`);
		console.log(`stderr: ${error.stderr}`);
		throw error;
	}
};

packageInstall.preserveExtraneousPlugins = () => {
	// Skip if `node_modules/` is not found or inaccessible
	try {
		fs.accessSync(paths.nodeModules, fs.constants.R_OK);
	} catch {
		return;
	}

	const packages = fs.readdirSync(paths.nodeModules)
		.filter(packageName => pluginNamePattern.test(packageName));

	const packageContents = JSON.parse(fs.readFileSync(paths.currentPackage, 'utf8'));

	const extraneous = packages
	// Only extraneous plugins (ones not in package.json) which are not links
		.filter(packageName => {
			const extraneous = !packageContents.dependencies.hasOwnProperty(packageName);
			const isLink = fs.lstatSync(path.join(paths.nodeModules, packageName)).isSymbolicLink();

			return extraneous && !isLink;
		})
	// Reduce to a map of package names to package versions
		.reduce((map, packageName) => {
			const packageConfig = JSON.parse(fs.readFileSync(path.join(paths.nodeModules, packageName, 'package.json'), 'utf8'));
			map[packageName] = packageConfig.version;
			return map;
		}, {});

	// Add those packages to package.json
	packageContents.dependencies = sortDependencies({...packageContents.dependencies, ...extraneous});

	fs.writeFileSync(paths.currentPackage, JSON.stringify(packageContents, null, 4));
};
