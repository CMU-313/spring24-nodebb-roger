'use strict';

const assert = require('node:assert');
const upgrade = require('../src/upgrade');
const db = require('./mocks/databasemock');

describe('Upgrade', () => {
	it('should get all upgrade scripts', async () => {
		const files = await upgrade.getAll();
		assert(Array.isArray(files) && files.length > 0);
	});

	it('should throw error', async () => {
		let error;
		try {
			await upgrade.check();
		} catch (error_) {
			error = error_;
		}

		assert.equal(error.message, 'schema-out-of-date');
	});

	it('should run all upgrades', async () => {
		// For upgrade scripts to run
		await db.set('schemaDate', 1);
		await upgrade.run();
	});

	it('should run particular upgrades', async () => {
		const files = await upgrade.getAll();
		await db.set('schemaDate', 1);
		await upgrade.runParticular(files.slice(0, 2));
	});
});
