'use strict';

const nconf = require('nconf');
const chalk = require('chalk');
const packageInstall = require('./package-install');
const {upgradePlugins} = require('./upgrade-plugins');

const steps = {
	package: {
		message: 'Updating package.json file with defaults...',
		handler() {
			packageInstall.updatePackageFile();
			packageInstall.preserveExtraneousPlugins();
			process.stdout.write(chalk.green('  OK\n'));
		},
	},
	install: {
		message: 'Bringing base dependencies up to date...',
		handler() {
			process.stdout.write(chalk.green('  started\n'));
			packageInstall.installAll();
		},
	},
	plugins: {
		message: 'Checking installed plugins for updates...',
		async handler() {
			await require('../database').init();
			await upgradePlugins();
		},
	},
	schema: {
		message: 'Updating NodeBB data store schema...',
		async handler() {
			await require('../database').init();
			await require('../meta').configs.init();
			await require('../upgrade').run();
		},
	},
	build: {
		message: 'Rebuilding assets...',
		async handler() {
			await require('../meta/build').buildAll();
		},
	},
};

async function runSteps(tasks) {
	try {
		for (const [i, task] of tasks.entries()) {
			const step = steps[task];
			if (step && step.message && step.handler) {
				process.stdout.write(`\n${chalk.bold(`${i + 1}. `)}${chalk.yellow(step.message)}`);
				/* eslint-disable-next-line */
                await step.handler();
			}
		}

		const message = 'NodeBB Upgrade Complete!';
		// Some consoles will return undefined/zero columns,
		// so just use 2 spaces in upgrade script if we can't get our column count
		const {columns} = process.stdout;
		const spaces = columns ? Array.from({length: Math.floor(columns / 2) - (message.length / 2) + 1}).join(' ') : '  ';

		console.log(`\n\n${spaces}${chalk.green.bold(message)}\n`);

		process.exit();
	} catch (error) {
		console.error(`Error occurred during upgrade: ${error.stack}`);
		throw error;
	}
}

async function runUpgrade(upgrades, options) {
	console.log(chalk.cyan('\nUpdating NodeBB...'));
	options ||= {};
	// Disable mongo timeouts during upgrade
	nconf.set('mongo:options:socketTimeoutMS', 0);

	if (upgrades === true) {
		let tasks = Object.keys(steps);
		if (options.package || options.install
                || options.plugins || options.schema || options.build) {
			tasks = tasks.filter(key => options[key]);
		}

		await runSteps(tasks);
		return;
	}

	await require('../database').init();
	await require('../meta').configs.init();
	await require('../upgrade').runParticular(upgrades);
	process.exit(0);
}

exports.upgrade = runUpgrade;
