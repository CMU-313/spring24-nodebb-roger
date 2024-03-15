'use strict';

const path = require('node:path');
const fs = require('node:fs');

const Logs = module.exports;

Logs.path = path.resolve(__dirname, '../../logs/output.log');

Logs.get = async function () {
	return await fs.promises.readFile(Logs.path, 'utf8');
};

Logs.clear = async function () {
	await fs.promises.truncate(Logs.path, 0);
};
