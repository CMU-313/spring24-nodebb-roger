'use strict';

const assert = require('node:assert');
const nconf = require('nconf');
const db = require('./mocks/databasemock');

describe('Test database', () => {
	it('should work', () => {
		assert.doesNotThrow(() => {
			require('./mocks/databasemock');
		});
	});

	describe('info', () => {
		it('should return info about database', done => {
			db.info(db.client, (error, info) => {
				assert.ifError(error);
				assert(info);
				done();
			});
		});

		it('should not error and return info if client is falsy', done => {
			db.info(null, (error, info) => {
				assert.ifError(error);
				assert(info);
				done();
			});
		});
	});

	describe('checkCompatibility', () => {
		it('should not throw', done => {
			db.checkCompatibility(done);
		});

		it('should return error with a too low version', done => {
			const databaseName = nconf.get('database');
			switch (databaseName) {
				case 'redis': {
					db.checkCompatibilityVersion('2.4.0', error => {
						assert.equal(error.message, 'Your Redis version is not new enough to support NodeBB, please upgrade Redis to v2.8.9 or higher.');
						done();
					});

					break;
				}

				case 'mongo': {
					db.checkCompatibilityVersion('1.8.0', error => {
						assert.equal(error.message, 'The `mongodb` package is out-of-date, please run `./nodebb setup` again.');
						done();
					});

					break;
				}

				case 'postgres': {
					db.checkCompatibilityVersion('6.3.0', error => {
						assert.equal(error.message, 'The `pg` package is out-of-date, please run `./nodebb setup` again.');
						done();
					});

					break;
				}
			// No default
			}
		});
	});

	require('./database/keys');
	require('./database/list');
	require('./database/sets');
	require('./database/hash');
	require('./database/sorted');
});
