'use strict';

const fs = require('node:fs');
const url = require('node:url');
const path = require('node:path');
const {fork} = require('node:child_process');
const nconf = require('nconf');
const logrotate = require('logrotate-stream');
const mkdirp = require('mkdirp');
const file = require('./src/file');
const pkg = require('./package.json');

const pathToConfig = path.resolve(__dirname, process.env.CONFIG || 'config.json');

nconf.argv().env().file({
	file: pathToConfig,
});

const pidFilePath = path.join(__dirname, 'pidfile');

const outputLogFilePath = path.join(__dirname, nconf.get('logFile') || 'logs/output.log');

const logDir = path.dirname(outputLogFilePath);
if (!fs.existsSync(logDir)) {
	mkdirp.sync(path.dirname(outputLogFilePath));
}

const output = logrotate({
	file: outputLogFilePath, size: '1m', keep: 3, compress: true,
});
const silent = nconf.get('silent') === 'false' ? false : nconf.get('silent') !== false;
let numberProcs;
const workers = [];
const Loader = {
	timesStarted: 0,
};
const appPath = path.join(__dirname, 'app.js');

Loader.init = function () {
	if (silent) {
		console.log = (...arguments_) => {
			output.write(`${arguments_.join(' ')}\n`);
		};
	}

	process.on('SIGHUP', Loader.restart);
	process.on('SIGTERM', Loader.stop);
};

Loader.displayStartupMessages = function () {
	console.log('');
	console.log(`NodeBB v${pkg.version} Copyright (C) 2013-${(new Date()).getFullYear()} NodeBB Inc.`);
	console.log('This program comes with ABSOLUTELY NO WARRANTY.');
	console.log('This is free software, and you are welcome to redistribute it under certain conditions.');
	console.log('For the full license, please visit: http://www.gnu.org/copyleft/gpl.html');
	console.log('');
};

Loader.addWorkerEvents = function (worker) {
	worker.on('exit', (code, signal) => {
		if (code !== 0) {
			if (Loader.timesStarted < numberProcs * 3) {
				Loader.timesStarted += 1;
				if (Loader.crashTimer) {
					clearTimeout(Loader.crashTimer);
				}

				Loader.crashTimer = setTimeout(() => {
					Loader.timesStarted = 0;
				}, 10_000);
			} else {
				console.log(`${numberProcs * 3} restarts in 10 seconds, most likely an error on startup. Halting.`);
				process.exit();
			}
		}

		console.log(`[cluster] Child Process (${worker.pid}) has exited (code: ${code}, signal: ${signal})`);
		if (!(worker.suicide || code === 0)) {
			console.log('[cluster] Spinning up another process...');

			forkWorker(worker.index, worker.isPrimary);
		}
	});

	worker.on('message', message => {
		if (message && typeof message === 'object' && message.action) {
			switch (message.action) {
				case 'restart': {
					console.log('[cluster] Restarting...');
					Loader.restart();
					break;
				}

				case 'pubsub': {
					for (const w of workers) {
						w.send(message);
					}

					break;
				}

				case 'socket.io': {
					for (const w of workers) {
						if (w !== worker) {
							w.send(message);
						}
					}

					break;
				}
			}
		}
	});
};

Loader.start = function () {
	numberProcs = getPorts().length;
	console.log(`Clustering enabled: Spinning up ${numberProcs} process(es).\n`);

	for (let x = 0; x < numberProcs; x += 1) {
		forkWorker(x, x === 0);
	}
};

function forkWorker(index, isPrimary) {
	const ports = getPorts();
	const arguments_ = [];

	if (!ports[index]) {
		return console.log(`[cluster] invalid port for worker : ${index} ports: ${ports.length}`);
	}

	process.env.isPrimary = isPrimary;
	process.env.isCluster = nconf.get('isCluster') || ports.length > 1;
	process.env.port = ports[index];

	const worker = fork(appPath, arguments_, {
		silent,
		env: process.env,
	});

	worker.index = index;
	worker.isPrimary = isPrimary;

	workers[index] = worker;

	Loader.addWorkerEvents(worker);

	if (silent) {
		const output = logrotate({
			file: outputLogFilePath, size: '1m', keep: 3, compress: true,
		});
		worker.stdout.pipe(output);
		worker.stderr.pipe(output);
	}
}

function getPorts() {
	const _url = nconf.get('url');
	if (!_url) {
		console.log('[cluster] url is undefined, please check your config.json');
		process.exit();
	}

	const urlObject = url.parse(_url);
	let port = nconf.get('PORT') || nconf.get('port') || urlObject.port || 4567;
	if (!Array.isArray(port)) {
		port = [port];
	}

	return port;
}

Loader.restart = function () {
	killWorkers();

	nconf.remove('file');
	nconf.use('file', {file: pathToConfig});

	fs.readFile(pathToConfig, {encoding: 'utf-8'}, (error, configFile) => {
		if (error) {
			console.error('Error reading config');
			throw error;
		}

		const config = JSON.parse(configFile);

		nconf.stores.env.readOnly = false;
		nconf.set('url', config.url);
		nconf.stores.env.readOnly = true;

		if (process.env.url !== config.url) {
			process.env.url = config.url;
		}

		Loader.start();
	});
};

Loader.stop = function () {
	killWorkers();

	// Clean up the pidfile
	if (nconf.get('daemon') !== 'false' && nconf.get('daemon') !== false) {
		fs.unlinkSync(pidFilePath);
	}
};

function killWorkers() {
	for (const worker of workers) {
		worker.suicide = true;
		worker.kill();
	}
}

fs.open(pathToConfig, 'r', error => {
	if (error) {
		// No config detected, kickstart web installer
		fork('app');
		return;
	}

	if (nconf.get('daemon') !== 'false' && nconf.get('daemon') !== false) {
		if (file.existsSync(pidFilePath)) {
			let pid = 0;
			try {
				pid = fs.readFileSync(pidFilePath, {encoding: 'utf-8'});
				if (pid) {
					process.kill(pid, 0);
					console.info(`Process "${pid}" from pidfile already running, exiting`);
					process.exit();
				} else {
					console.info(`Invalid pid "${pid}" from pidfile, deleting pidfile`);
					fs.unlinkSync(pidFilePath);
				}
			} catch (error) {
				if (error.code === 'ESRCH') {
					console.info(`Process "${pid}" from pidfile not found, deleting pidfile`);
					fs.unlinkSync(pidFilePath);
				} else {
					console.error(error.stack);
					throw error;
				}
			}
		}

		require('daemon')({
			stdout: process.stdout,
			stderr: process.stderr,
			cwd: process.cwd(),
		});

		fs.writeFileSync(pidFilePath, String(process.pid));
	}

	try {
		Loader.init();
		Loader.displayStartupMessages();
		Loader.start();
	} catch (error) {
		console.error('[loader] Error during startup');
		throw error;
	}
});
