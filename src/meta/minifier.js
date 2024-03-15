'use strict';

const fs = require('node:fs');
const os = require('node:os');
const uglify = require('uglify-es');
const async = require('async');
const winston = require('winston');
const less = require('less');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');
const clean = require('postcss-clean');
const fork = require('./debugFork');
require('../file'); // For graceful-fs

const Minifier = module.exports;

const pool = [];
const free = [];

let maxThreads = 0;

Object.defineProperty(Minifier, 'maxThreads', {
	get() {
		return maxThreads;
	},
	set(value) {
		maxThreads = value;
		if (!process.env.minifier_child) {
			winston.verbose(`[minifier] utilizing a maximum of ${maxThreads} additional threads`);
		}
	},
	configurable: true,
	enumerable: true,
});

Minifier.maxThreads = os.cpus().length - 1;

Minifier.killAll = function () {
	for (const child of pool) {
		child.kill('SIGTERM');
	}

	pool.length = 0;
	free.length = 0;
};

function getChild() {
	if (free.length > 0) {
		return free.shift();
	}

	const process_ = fork(__filename, [], {
		cwd: __dirname,
		env: {
			minifier_child: true,
		},
	});
	pool.push(process_);

	return process_;
}

function freeChild(process_) {
	process_.removeAllListeners();
	free.push(process_);
}

function removeChild(process_) {
	const i = pool.indexOf(process_);
	if (i !== -1) {
		pool.splice(i, 1);
	}
}

function forkAction(action) {
	return new Promise((resolve, reject) => {
		const process_ = getChild();
		process_.on('message', message => {
			freeChild(process_);

			if (message.type === 'error') {
				return reject(new Error(message.message));
			}

			if (message.type === 'end') {
				resolve(message.result);
			}
		});
		process_.on('error', error => {
			process_.kill();
			removeChild(process_);
			reject(error);
		});

		process_.send({
			type: 'action',
			action,
		});
	});
}

const actions = {};

if (process.env.minifier_child) {
	process.on('message', async message => {
		if (message.type === 'action') {
			const {action} = message;
			if (typeof actions[action.act] !== 'function') {
				process.send({
					type: 'error',
					message: 'Unknown action',
				});
				return;
			}

			try {
				const result = await actions[action.act](action);
				process.send({
					type: 'end',
					result,
				});
			} catch (error) {
				process.send({
					type: 'error',
					message: error.stack || error.message || 'unknown error',
				});
			}
		}
	});
}

async function executeAction(action, fork) {
	if (fork && (pool.length - free.length) < Minifier.maxThreads) {
		return await forkAction(action);
	}

	if (typeof actions[action.act] !== 'function') {
		throw new TypeError('Unknown action');
	}

	return await actions[action.act](action);
}

actions.concat = async function concat(data) {
	if (data.files && data.files.length > 0) {
		const files = await async.mapLimit(data.files, 1000, async reference => await fs.promises.readFile(reference.srcPath, 'utf8'));
		const output = files.join('\n;');
		await fs.promises.writeFile(data.destPath, output);
	}
};

actions.minifyJS_batch = async function minifyJS_batch(data) {
	await async.eachLimit(data.files, 100, async fileObject => {
		const source = await fs.promises.readFile(fileObject.srcPath, 'utf8');
		const filesToMinify = [
			{
				srcPath: fileObject.srcPath,
				filename: fileObject.filename,
				source,
			},
		];

		await minifyAndSave({
			files: filesToMinify,
			destPath: fileObject.destPath,
			filename: fileObject.filename,
		});
	});
};

actions.minifyJS = async function minifyJS(data) {
	const filesToMinify = await async.mapLimit(data.files, 1000, async fileObject => {
		const source = await fs.promises.readFile(fileObject.srcPath, 'utf8');
		return {
			srcPath: fileObject.srcPath,
			filename: fileObject.filename,
			source,
		};
	});
	await minifyAndSave({
		files: filesToMinify,
		destPath: data.destPath,
		filename: data.filename,
	});
};

async function minifyAndSave(data) {
	const scripts = {};
	for (const reference of data.files) {
		if (reference && reference.filename && reference.source) {
			scripts[reference.filename] = reference.source;
		}
	}

	const minified = uglify.minify(scripts, {
		sourceMap: {
			filename: data.filename,
			url: `${String(data.filename).split(/[/\\]/).pop()}.map`,
			includeSources: true,
		},
		compress: false,
	});

	if (minified.error) {
		throw new Error(`Error minifying ${minified.error.filename}\n${minified.error.stack}`);
	}

	await Promise.all([
		fs.promises.writeFile(data.destPath, minified.code),
		fs.promises.writeFile(`${data.destPath}.map`, minified.map),
	]);
}

Minifier.js = {};
Minifier.js.bundle = async function (data, minify, fork) {
	return await executeAction({
		act: minify ? 'minifyJS' : 'concat',
		files: data.files,
		filename: data.filename,
		destPath: data.destPath,
	}, fork);
};

Minifier.js.minifyBatch = async function (scripts, fork) {
	return await executeAction({
		act: 'minifyJS_batch',
		files: scripts,
	}, fork);
};

actions.buildCSS = async function buildCSS(data) {
	const lessOutput = await less.render(data.source, {
		paths: data.paths,
		javascriptEnabled: false,
	});

	const postcssArguments = [autoprefixer];
	if (data.minify) {
		postcssArguments.push(clean({
			processImportFrom: ['local'],
		}));
	}

	const result = await postcss(postcssArguments).process(lessOutput.css, {
		from: undefined,
	});
	return {code: result.css};
};

Minifier.css = {};
Minifier.css.bundle = async function (source, paths, minify, fork) {
	return await executeAction({
		act: 'buildCSS',
		source,
		paths,
		minify,
	}, fork);
};

require('../promisify')(exports);
