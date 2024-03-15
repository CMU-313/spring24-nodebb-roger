'use strict';

const os = require('node:os');
const path = require('node:path');
const {exec} = require('node:child_process');
const util = require('node:util');
const winston = require('winston');
const nconf = require('nconf');
const _ = require('lodash');
const mkdirp = require('mkdirp');
const chalk = require('chalk');
const cacheBuster = require('./cacheBuster');
const {aliases} = require('./aliases');

let meta;

const targetHandlers = {
	async 'plugin static dirs'() {
		await meta.js.linkStatics();
	},
	async 'requirejs modules'(parallel) {
		await meta.js.buildModules(parallel);
	},
	async 'client js bundle'(parallel) {
		await meta.js.buildBundle('client', parallel);
	},
	async 'admin js bundle'(parallel) {
		await meta.js.buildBundle('admin', parallel);
	},
	javascript: [
		'plugin static dirs',
		'requirejs modules',
		'client js bundle',
		'admin js bundle',
	],
	async 'client side styles'(parallel) {
		await meta.css.buildBundle('client', parallel);
	},
	async 'admin control panel styles'(parallel) {
		await meta.css.buildBundle('admin', parallel);
	},
	styles: [
		'client side styles',
		'admin control panel styles',
	],
	async templates() {
		await meta.templates.compile();
	},
	async languages() {
		await meta.languages.build();
	},
};

const aliasMap = Object.keys(aliases).reduce((previous, key) => {
	const array = aliases[key];
	for (const alias of array) {
		previous[alias] = key;
	}

	previous[key] = key;
	return previous;
}, {});

async function beforeBuild(targets) {
	const db = require('../database');
	process.stdout.write(`${chalk.green('  started')}\n`);
	try {
		await db.init();
		meta = require('./index');
		await meta.themes.setupPaths();
		const plugins = require('../plugins');
		await plugins.prepareForBuild(targets);
		await mkdirp(path.join(__dirname, '../../build/public'));
	} catch (error) {
		winston.error(`[build] Encountered error preparing for build\n${error.stack}`);
		throw error;
	}
}

const allTargets = Object.keys(targetHandlers).filter(name => typeof targetHandlers[name] === 'function');

async function buildTargets(targets, parallel, options) {
	const length = Math.max(...targets.map(name => name.length));
	const jsTargets = targets.filter(target => targetHandlers.javascript.includes(target));
	const otherTargets = targets.filter(target => !targetHandlers.javascript.includes(target));

	// Compile TypeScript into JavaScript
	winston.info('[build] Building TypeScript files');
	const execAsync = util.promisify(exec);
	await execAsync('npx tsc');
	winston.info('[build] TypeScript building complete');

	async function buildJSTargets() {
		await Promise.all(
			jsTargets.map(
				target => step(target, parallel, `${_.padStart(target, length)} `),
			),
		);
		// Run webpack after jstargets are done, no need to wait for css/templates etc.
		if (options.webpack || options.watch) {
			await exports.webpack(options);
		}
	}

	if (parallel) {
		await Promise.all([
			buildJSTargets(),
			...otherTargets.map(
				target => step(target, parallel, `${_.padStart(target, length)} `),
			),
		]);
	} else {
		for (const target of targets) {
			// eslint-disable-next-line no-await-in-loop
			await step(target, parallel, `${_.padStart(target, length)} `);
		}

		if (options.webpack || options.watch) {
			await exports.webpack(options);
		}
	}
}

async function step(target, parallel, targetString) {
	const startTime = Date.now();
	winston.info(`[build] ${targetString} build started`);
	try {
		await targetHandlers[target](parallel);
		const time = (Date.now() - startTime) / 1000;

		winston.info(`[build] ${targetString} build completed in ${time}sec`);
	} catch (error) {
		winston.error(`[build] ${targetString} build failed`);
		throw error;
	}
}

exports.build = async function (targets, options) {
	options ||= {};

	if (targets === true) {
		targets = allTargets;
	} else if (!Array.isArray(targets)) {
		targets = targets.split(',');
	}

	let series = nconf.get('series') || options.series;
	if (series === undefined) {
		// Detect # of CPUs and select strategy as appropriate
		winston.verbose('[build] Querying CPU core count for build strategy');
		const cpus = os.cpus();
		series = cpus.length < 4;
		winston.verbose(`[build] System returned ${cpus.length} cores, opting for ${series ? 'series' : 'parallel'} build strategy`);
	}

	targets = targets
	// Get full target name
		.map(target => {
			target = target.toLowerCase().replaceAll('-', '');
			if (!aliasMap[target]) {
				winston.warn(`[build] Unknown target: ${target}`);
				if (target.includes(',')) {
					winston.warn('[build] Are you specifying multiple targets? Separate them with spaces:');
					winston.warn('[build]   e.g. `./nodebb build adminjs tpl`');
				}

				return false;
			}

			return aliasMap[target];
		})
	// Filter nonexistent targets
		.filter(Boolean);

	// Map multitargets to their sets
	targets = _.uniq(_.flatMap(targets, target => (
		Array.isArray(targetHandlers[target])
			? targetHandlers[target]
			: target
	)));

	winston.verbose(`[build] building the following targets: ${targets.join(', ')}`);

	if (!targets) {
		winston.info('[build] No valid targets supplied. Aborting.');
		return;
	}

	try {
		await beforeBuild(targets);
		const threads = Number.parseInt(nconf.get('threads'), 10);
		if (threads) {
			require('./minifier').maxThreads = threads - 1;
		}

		if (series) {
			winston.info('[build] Building in series mode');
		} else {
			winston.info('[build] Building in parallel mode');
		}

		const startTime = Date.now();
		await buildTargets(targets, !series, options);

		const totalTime = (Date.now() - startTime) / 1000;
		await cacheBuster.write();
		winston.info(`[build] Asset compilation successful. Completed in ${totalTime}sec.`);
	} catch (error) {
		winston.error(`[build] Encountered error during build step\n${error.stack ? error.stack : error}`);
		throw error;
	}
};

function getWebpackConfig() {
	return require(process.env.NODE_ENV === 'development' ? '../../webpack.dev' : '../../webpack.prod');
}

exports.webpack = async function (options) {
	winston.info(`[build] ${(options.watch ? 'Watching' : 'Bundling')} with Webpack.`);
	const webpack = require('webpack');
	const fs = require('node:fs');
	const util = require('node:util');
	const plugins = require('../plugins/data');

	const activePlugins = (await plugins.getActive()).map(p => p.id);
	if (!activePlugins.includes('nodebb-plugin-composer-default')) {
		activePlugins.push('nodebb-plugin-composer-default');
	}

	await fs.promises.writeFile(path.resolve(__dirname, '../../build/active_plugins.json'), JSON.stringify(activePlugins));

	const webpackCfg = getWebpackConfig();
	const compiler = webpack(webpackCfg);
	const webpackRun = util.promisify(compiler.run).bind(compiler);
	const webpackWatch = util.promisify(compiler.watch).bind(compiler);
	try {
		let stats;
		if (options.watch) {
			stats = await webpackWatch(webpackCfg.watchOptions);
			compiler.hooks.assetEmitted.tap('nbbWatchPlugin', file => {
				console.log(`webpack:assetEmitted > ${webpackCfg.output.publicPath}${file}`);
			});
		} else {
			stats = await webpackRun();
		}

		if (stats.hasErrors() || stats.hasWarnings()) {
			console.log(stats.toString('minimal'));
		} else {
			const statsJson = stats.toJson();
			winston.info(`[build] ${(options.watch ? 'Watching' : 'Bundling')} took ${statsJson.time} ms`);
		}
	} catch (error) {
		console.error(error.stack || error);
		if (error.details) {
			console.error(error.details);
		}
	}
};

exports.buildAll = async function () {
	await exports.build(allTargets, {webpack: true});
};

require('../promisify')(exports);
