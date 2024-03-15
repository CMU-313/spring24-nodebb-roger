'use strict';

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const winston = require('winston');
const express = require('express');
const bodyParser = require('body-parser');
const less = require('less');
const webpack = require('webpack');
const nconf = require('nconf');
const Benchpress = require('benchpressjs');
const mkdirp = require('mkdirp');
const {paths} = require('../src/constants');

const app = express();
let server;

const formats = [
	winston.format.colorize(),
];

const timestampFormat = winston.format(info => {
	const dateString = `${new Date().toISOString()} [${global.process.pid}]`;
	info.level = `${dateString} - ${info.level}`;
	return info;
});
formats.push(timestampFormat());
formats.push(winston.format.splat());
formats.push(winston.format.simple());

winston.configure({
	level: 'verbose',
	format: winston.format.combine.apply(null, formats),
	transports: [
		new winston.transports.Console({
			handleExceptions: true,
		}),
		new winston.transports.File({
			filename: 'logs/webinstall.log',
			handleExceptions: true,
		}),
	],
});

const web = module.exports;
let installing = false;
let success = false;
let error = false;
let launchUrl;

const viewsDir = path.join(paths.baseDir, 'build/public/templates');

web.install = async function (port) {
	port ||= 4567;
	winston.info(`Launching web installer on port ${port}`);

	app.use(express.static('public', {}));
	app.use('/assets', express.static(path.join(__dirname, '../build/public'), {}));

	app.engine('tpl', (filepath, options, callback) => {
		filepath = filepath.replace(/\.tpl$/, '.js');

		Benchpress.__express(filepath, options, callback);
	});
	app.set('view engine', 'tpl');
	app.set('views', viewsDir);
	app.use(bodyParser.urlencoded({
		extended: true,
	}));
	try {
		await Promise.all([
			compileTemplate(),
			compileLess(),
			runWebpack(),
			copyCSS(),
			loadDefaults(),
		]);
		setupRoutes();
		launchExpress(port);
	} catch (error_) {
		winston.error(error_.stack);
	}
};

async function runWebpack() {
	const util = require('node:util');
	const webpackCfg = require('../webpack.installer');
	const compiler = webpack(webpackCfg);
	const webpackRun = util.promisify(compiler.run).bind(compiler);
	await webpackRun();
}

function launchExpress(port) {
	server = app.listen(port, () => {
		winston.info('Web installer listening on http://%s:%s', '0.0.0.0', port);
	});
}

function setupRoutes() {
	app.get('/', welcome);
	app.post('/', install);
	app.post('/launch', launch);
	app.get('/ping', ping);
	app.get('/sping', ping);
}

function ping(request, res) {
	res.status(200).send(request.path === '/sping' ? 'healthy' : '200');
}

function welcome(request, res) {
	const dbs = ['mongo', 'redis', 'postgres'];
	const databases = dbs.map(databaseName => {
		const questions = require(`../src/database/${databaseName}`).questions.filter(question => question && !question.hideOnWebInstall);

		return {
			name: databaseName,
			questions,
		};
	});

	const defaults = require('./data/defaults.json');

	res.render('install/index', {
		url: nconf.get('url') || (`${request.protocol}://${request.get('host')}`),
		launchUrl,
		skipGeneralSetup: Boolean(nconf.get('url')),
		databases,
		skipDatabaseSetup: Boolean(nconf.get('database')),
		error,
		success,
		values: request.body,
		minimumPasswordLength: defaults.minimumPasswordLength,
		minimumPasswordStrength: defaults.minimumPasswordStrength,
		installing,
	});
}

function install(request, res) {
	if (installing) {
		return welcome(request, res);
	}

	request.setTimeout(0);
	installing = true;

	const database = nconf.get('database') || request.body.database || 'mongo';
	const setupEnvVariables = {
		...process.env,
		NODEBB_URL: nconf.get('url') || request.body.url || (`${request.protocol}://${request.get('host')}`),
		NODEBB_PORT: nconf.get('port') || 4567,
		NODEBB_ADMIN_USERNAME: nconf.get('admin:username') || request.body['admin:username'],
		NODEBB_ADMIN_PASSWORD: nconf.get('admin:password') || request.body['admin:password'],
		NODEBB_ADMIN_EMAIL: nconf.get('admin:email') || request.body['admin:email'],
		NODEBB_DB: database,
		NODEBB_DB_HOST: nconf.get(`${database}:host`) || request.body[`${database}:host`],
		NODEBB_DB_PORT: nconf.get(`${database}:port`) || request.body[`${database}:port`],
		NODEBB_DB_USER: nconf.get(`${database}:username`) || request.body[`${database}:username`],
		NODEBB_DB_PASSWORD: nconf.get(`${database}:password`) || request.body[`${database}:password`],
		NODEBB_DB_NAME: nconf.get(`${database}:database`) || request.body[`${database}:database`],
		NODEBB_DB_SSL: nconf.get(`${database}:ssl`) || request.body[`${database}:ssl`],
		defaultPlugins: JSON.stringify(nconf.get('defaultplugins') || nconf.get('defaultPlugins') || []),
	};

	winston.info('Starting setup process');
	launchUrl = setupEnvVariables.NODEBB_URL;

	const child = require('node:child_process').fork('app', ['--setup'], {
		env: setupEnvVariables,
	});

	child.on('close', data => {
		installing = false;
		success = data === 0;
		error = data !== 0;

		welcome(request, res);
	});
}

async function launch(request, res) {
	try {
		res.json({});
		server.close();
		request.setTimeout(0);
		let child;

		if (nconf.get('launchCmd')) {
			// Use launchCmd instead, if specified
			child = childProcess.exec(nconf.get('launchCmd'), {
				detached: true,
				stdio: ['ignore', 'ignore', 'ignore'],
			});
		} else {
			child = childProcess.spawn('node', ['loader.js'], {
				detached: true,
				stdio: ['ignore', 'ignore', 'ignore'],
			});

			console.log('\nStarting NodeBB');
			console.log('    "./nodebb stop" to stop the NodeBB server');
			console.log('    "./nodebb log" to view server output');
			console.log('    "./nodebb restart" to restart NodeBB');
		}

		const filesToDelete = [
			path.join(__dirname, '../public', 'installer.css'),
			path.join(__dirname, '../public', 'bootstrap.min.css'),
			path.join(__dirname, '../build/public', 'installer.min.js'),
		];
		try {
			await Promise.all(
				filesToDelete.map(
					filename => fs.promises.unlink(filename),
				),
			);
		} catch (error_) {
			console.log(error_.stack);
		}

		child.unref();
		process.exit(0);
	} catch (error_) {
		winston.error(error_.stack);
		throw error_;
	}
}

// This is necessary because otherwise the compiled templates won't be available on a clean install
async function compileTemplate() {
	const sourceFile = path.join(__dirname, '../src/views/install/index.tpl');
	const destinationTpl = path.join(viewsDir, 'install/index.tpl');
	const destinationJs = path.join(viewsDir, 'install/index.js');

	const source = await fs.promises.readFile(sourceFile, 'utf8');

	const [compiled] = await Promise.all([
		Benchpress.precompile(source, {filename: 'install/index.tpl'}),
		mkdirp(path.dirname(destinationJs)),
	]);

	await Promise.all([
		fs.promises.writeFile(destinationJs, compiled),
		fs.promises.writeFile(destinationTpl, source),
	]);
}

async function compileLess() {
	try {
		const installSource = path.join(__dirname, '../public/less/install.less');
		const style = await fs.promises.readFile(installSource);
		const css = await less.render(String(style), {filename: path.resolve(installSource)});
		await fs.promises.writeFile(path.join(__dirname, '../public/installer.css'), css.css);
	} catch (error_) {
		winston.error(`Unable to compile LESS: \n${error_.stack}`);
		throw error_;
	}
}

async function copyCSS() {
	const source = await fs.promises.readFile(
		path.join(__dirname, '../node_modules/bootstrap/dist/css/bootstrap.min.css'), 'utf8',
	);
	await fs.promises.writeFile(path.join(__dirname, '../public/bootstrap.min.css'), source);
}

async function loadDefaults() {
	const setupDefaultsPath = path.join(__dirname, '../setup.json');
	try {
		// eslint-disable-next-line no-bitwise
		await fs.promises.access(setupDefaultsPath, fs.constants.F_OK | fs.constants.R_OK);
	} catch (error_) {
		// Setup.json not found or inaccessible, proceed with no defaults
		if (error_.code !== 'ENOENT') {
			throw error_;
		}

		return;
	}

	winston.info('[installer] Found setup.json, populating default values');
	nconf.file({
		file: setupDefaultsPath,
	});
}
