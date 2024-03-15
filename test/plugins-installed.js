'use strict';

const path = require('node:path');
const fs = require('node:fs');
const nconf = require('nconf');
const db = require('./mocks/databasemock');

const active = nconf.get('test_plugins') || [];
const toTest = fs.readdirSync(path.join(__dirname, '../node_modules'))
	.filter(p => p.startsWith('nodebb-') && active.includes(p));

describe('Installed Plugins', () => {
	for (const plugin of toTest) {
		const pathToTests = path.join(__dirname, '../node_modules', plugin, 'test');
		try {
			require(pathToTests);
		} catch (error) {
			if (error.code !== 'MODULE_NOT_FOUND') {
				console.log(error.stack);
			}
		}
	}
});
