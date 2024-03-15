'use strict';

const {fork} = require('node:child_process');

let debugArgument = process.execArgv.find(argument => /^--(debug|inspect)/.test(argument));
const debugging = Boolean(debugArgument);

debugArgument = debugArgument ? debugArgument.replace('-brk', '').split('=') : ['--debug', 5859];
let lastAddress = Number.parseInt(debugArgument[1], 10);

/**
 * Child-process.fork, but safe for use in debuggers
 * @param {string} modulePath
 * @param {string[]} [args]
 * @param {any} [options]
 */
function debugFork(modulePath, arguments_, options) {
	let execArgv = [];
	if (global.v8debug || debugging) {
		lastAddress += 1;

		execArgv = [`${debugArgument[0]}=${lastAddress}`, '--nolazy'];
	}

	if (!Array.isArray(arguments_)) {
		options = arguments_;
		arguments_ = [];
	}

	options ||= {};
	options = {...options, execArgv};

	return fork(modulePath, arguments_, options);
}

debugFork.debugging = debugging;

module.exports = debugFork;
