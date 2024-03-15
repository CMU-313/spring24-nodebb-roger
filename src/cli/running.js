'use strict';

const fs = require('node:fs');
const childProcess = require('node:child_process');
const chalk = require('chalk');
const fork = require('../meta/debugFork');
const {paths} = require('../constants');

const cwd = paths.baseDir;

function getRunningPid(callback) {
	fs.readFile(paths.pidfile, {
		encoding: 'utf-8',
	}, (error, pid) => {
		if (error) {
			return callback(error);
		}

		pid = Number.parseInt(pid, 10);

		try {
			process.kill(pid, 0);
			callback(null, pid);
		} catch (error) {
			callback(error);
		}
	});
}

function start(options) {
	if (options.dev) {
		process.env.NODE_ENV = 'development';
		fork(paths.loader, ['--no-daemon', '--no-silent'], {
			env: process.env,
			stdio: 'inherit',
			cwd,
		});
		return;
	}

	if (options.log) {
		console.log(`\n${[
			chalk.bold('Starting NodeBB with logging output'),
			chalk.red('Hit ') + chalk.bold('Ctrl-C ') + chalk.red('to exit'),
			'The NodeBB process will continue to run in the background',
			`Use "${chalk.yellow('./nodebb stop')}" to stop the NodeBB server`,
		].join('\n')}`);
	} else if (!options.silent) {
		console.log(`\n${[
			chalk.bold('Starting NodeBB'),
			`  "${chalk.yellow('./nodebb stop')}" to stop the NodeBB server`,
			`  "${chalk.yellow('./nodebb log')}" to view server output`,
			`  "${chalk.yellow('./nodebb help')}" for more commands\n`,
		].join('\n')}`);
	}

	// Spawn a new NodeBB process
	const child = fork(paths.loader, process.argv.slice(3), {
		env: process.env,
		cwd,
	});
	if (options.log) {
		childProcess.spawn('tail', ['-F', './logs/output.log'], {
			stdio: 'inherit',
			cwd,
		});
	}

	return child;
}

function stop() {
	getRunningPid((error, pid) => {
		if (error) {
			console.log('NodeBB is already stopped.');
		} else {
			process.kill(pid, 'SIGTERM');
			console.log('Stopping NodeBB. Goodbye!');
		}
	});
}

function restart(options) {
	getRunningPid((error, pid) => {
		if (error) {
			console.warn('NodeBB could not be restarted, as a running instance could not be found.');
		} else {
			console.log(chalk.bold('\nRestarting NodeBB'));
			process.kill(pid, 'SIGTERM');

			options.silent = true;
			start(options);
		}
	});
}

function status() {
	getRunningPid((error, pid) => {
		if (error) {
			console.log(chalk.bold('\nNodeBB is not running'));
			console.log(`\t"${chalk.yellow('./nodebb start')}" to launch the NodeBB server\n`);
		} else {
			console.log(`\n${[
				chalk.bold('NodeBB Running ') + chalk.cyan(`(pid ${pid.toString()})`),
				`\t"${chalk.yellow('./nodebb stop')}" to stop the NodeBB server`,
				`\t"${chalk.yellow('./nodebb log')}" to view server output`,
				`\t"${chalk.yellow('./nodebb restart')}" to restart NodeBB\n`,
			].join('\n')}`);
		}
	});
}

function log() {
	console.log(`${chalk.red('\nHit ') + chalk.bold('Ctrl-C ') + chalk.red('to exit\n')}\n`);
	childProcess.spawn('tail', ['-F', './logs/output.log'], {
		stdio: 'inherit',
		cwd,
	});
}

exports.start = start;
exports.stop = stop;
exports.restart = restart;
exports.status = status;
exports.log = log;
