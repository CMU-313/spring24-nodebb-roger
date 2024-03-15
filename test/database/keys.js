'use strict';

const assert = require('node:assert');
const async = require('async');
const db = require('../mocks/databasemock');

describe('Key methods', () => {
	beforeEach(done => {
		db.set('testKey', 'testValue', done);
	});

	it('should set a key without error', done => {
		db.set('testKey', 'testValue', function (error) {
			assert.ifError(error);
			assert(arguments.length < 2);
			done();
		});
	});

	it('should get a key without error', done => {
		db.get('testKey', function (error, value) {
			assert.ifError(error);
			assert.equal(arguments.length, 2);
			assert.strictEqual(value, 'testValue');
			done();
		});
	});

	it('should return null if key does not exist', done => {
		db.get('doesnotexist', (error, value) => {
			assert.ifError(error);
			assert.equal(value, null);
			done();
		});
	});

	it('should return true if key exist', done => {
		db.exists('testKey', function (error, exists) {
			assert.ifError(error);
			assert.equal(arguments.length, 2);
			assert.strictEqual(exists, true);
			done();
		});
	});

	it('should return false if key does not exist', done => {
		db.exists('doesnotexist', function (error, exists) {
			assert.ifError(error);
			assert.equal(arguments.length, 2);
			assert.strictEqual(exists, false);
			done();
		});
	});

	it('should work for an array of keys', done => {
		db.exists(['testKey', 'doesnotexist'], (error, exists) => {
			assert.ifError(error);
			assert.deepStrictEqual(exists, [true, false]);
			done();
		});
	});

	describe('scan', () => {
		it('should scan keys for pattern', async () => {
			await db.sortedSetAdd('ip:123:uid', 1, 'a');
			await db.sortedSetAdd('ip:123:uid', 2, 'b');
			await db.sortedSetAdd('ip:124:uid', 2, 'b');
			await db.sortedSetAdd('ip:1:uid', 1, 'a');
			await db.sortedSetAdd('ip:23:uid', 1, 'a');
			const data = await db.scan({match: 'ip:1*'});
			assert.equal(data.length, 3);
			assert(data.includes('ip:123:uid'));
			assert(data.includes('ip:124:uid'));
			assert(data.includes('ip:1:uid'));
		});
	});

	it('should delete a key without error', done => {
		db.delete('testKey', function (error) {
			assert.ifError(error);
			assert(arguments.length < 2);

			db.get('testKey', (error, value) => {
				assert.ifError(error);
				assert.equal(false, Boolean(value));
				done();
			});
		});
	});

	it('should return false if key was deleted', done => {
		db.delete('testKey', function (error) {
			assert.ifError(error);
			assert(arguments.length < 2);
			db.exists('testKey', (error, exists) => {
				assert.ifError(error);
				assert.strictEqual(exists, false);
				done();
			});
		});
	});

	it('should delete all keys passed in', done => {
		async.parallel([
			function (next) {
				db.set('key1', 'value1', next);
			},
			function (next) {
				db.set('key2', 'value2', next);
			},
		], error => {
			if (error) {
				return done(error);
			}

			db.deleteAll(['key1', 'key2'], function (error) {
				assert.ifError(error);
				assert.equal(arguments.length, 1);
				async.parallel({
					key1exists(next) {
						db.exists('key1', next);
					},
					key2exists(next) {
						db.exists('key2', next);
					},
				}, (error, results) => {
					assert.ifError(error);
					assert.equal(results.key1exists, false);
					assert.equal(results.key2exists, false);
					done();
				});
			});
		});
	});

	it('should delete all sorted set elements', done => {
		async.parallel([
			function (next) {
				db.sortedSetAdd('deletezset', 1, 'value1', next);
			},
			function (next) {
				db.sortedSetAdd('deletezset', 2, 'value2', next);
			},
		], error => {
			if (error) {
				return done(error);
			}

			db.delete('deletezset', error => {
				assert.ifError(error);
				async.parallel({
					key1exists(next) {
						db.isSortedSetMember('deletezset', 'value1', next);
					},
					key2exists(next) {
						db.isSortedSetMember('deletezset', 'value2', next);
					},
				}, (error, results) => {
					assert.ifError(error);
					assert.equal(results.key1exists, false);
					assert.equal(results.key2exists, false);
					done();
				});
			});
		});
	});

	describe('increment', () => {
		it('should initialize key to 1', done => {
			db.increment('keyToIncrement', (error, value) => {
				assert.ifError(error);
				assert.strictEqual(Number.parseInt(value, 10), 1);
				done();
			});
		});

		it('should increment key to 2', done => {
			db.increment('keyToIncrement', (error, value) => {
				assert.ifError(error);
				assert.strictEqual(Number.parseInt(value, 10), 2);
				done();
			});
		});

		it('should set then increment a key', done => {
			db.set('myIncrement', 1, error => {
				assert.ifError(error);
				db.increment('myIncrement', (error, value) => {
					assert.ifError(error);
					assert.equal(value, 2);
					db.get('myIncrement', (error, value) => {
						assert.ifError(error);
						assert.equal(value, 2);
						done();
					});
				});
			});
		});

		it('should return the correct value', done => {
			db.increment('testingCache', error => {
				assert.ifError(error);
				db.get('testingCache', (error, value) => {
					assert.ifError(error);
					assert.equal(value, 1);
					db.increment('testingCache', error_ => {
						assert.ifError(error_);
						db.get('testingCache', (error, value) => {
							assert.ifError(error);
							assert.equal(value, 2);
							done();
						});
					});
				});
			});
		});
	});

	describe('rename', () => {
		it('should rename key to new name', done => {
			db.set('keyOldName', 'renamedKeyValue', error => {
				if (error) {
					return done(error);
				}

				db.rename('keyOldName', 'keyNewName', function (error) {
					assert.ifError(error);
					assert(arguments.length < 2);

					db.get('keyNewName', (error, value) => {
						assert.ifError(error);
						assert.equal(value, 'renamedKeyValue');
						done();
					});
				});
			});
		});

		it('should rename multiple keys', done => {
			db.sortedSetAdd('zsettorename', [1, 2, 3], ['value1', 'value2', 'value3'], error => {
				assert.ifError(error);
				db.rename('zsettorename', 'newzsetname', error => {
					assert.ifError(error);
					db.exists('zsettorename', (error, exists) => {
						assert.ifError(error);
						assert(!exists);
						db.getSortedSetRange('newzsetname', 0, -1, (error, values) => {
							assert.ifError(error);
							assert.deepEqual(['value1', 'value2', 'value3'], values);
							done();
						});
					});
				});
			});
		});

		it('should not error if old key does not exist', done => {
			db.rename('doesnotexist', 'anotherdoesnotexist', error => {
				assert.ifError(error);
				db.exists('anotherdoesnotexist', (error, exists) => {
					assert.ifError(error);
					assert(!exists);
					done();
				});
			});
		});
	});

	describe('type', () => {
		it('should return null if key does not exist', done => {
			db.type('doesnotexist', (error, type) => {
				assert.ifError(error);
				assert.strictEqual(type, null);
				done();
			});
		});

		it('should return hash as type', done => {
			db.setObject('typeHash', {foo: 1}, error => {
				assert.ifError(error);
				db.type('typeHash', (error, type) => {
					assert.ifError(error);
					assert.equal(type, 'hash');
					done();
				});
			});
		});

		it('should return zset as type', done => {
			db.sortedSetAdd('typeZset', 123, 'value1', error => {
				assert.ifError(error);
				db.type('typeZset', (error, type) => {
					assert.ifError(error);
					assert.equal(type, 'zset');
					done();
				});
			});
		});

		it('should return set as type', done => {
			db.setAdd('typeSet', 'value1', error => {
				assert.ifError(error);
				db.type('typeSet', (error, type) => {
					assert.ifError(error);
					assert.equal(type, 'set');
					done();
				});
			});
		});

		it('should return list as type', done => {
			db.listAppend('typeList', 'value1', error => {
				assert.ifError(error);
				db.type('typeList', (error, type) => {
					assert.ifError(error);
					assert.equal(type, 'list');
					done();
				});
			});
		});

		it('should return string as type', done => {
			db.set('typeString', 'value1', error => {
				assert.ifError(error);
				db.type('typeString', (error, type) => {
					assert.ifError(error);
					assert.equal(type, 'string');
					done();
				});
			});
		});

		it('should expire a key using seconds', done => {
			db.expire('testKey', 86_400, error => {
				assert.ifError(error);
				db.ttl('testKey', (error, ttl) => {
					assert.ifError(error);
					assert.equal(Math.round(86_400 / 1000), Math.round(ttl / 1000));
					done();
				});
			});
		});

		it('should expire a key using milliseconds', done => {
			db.pexpire('testKey', 86_400_000, error => {
				assert.ifError(error);
				db.pttl('testKey', (error, pttl) => {
					assert.ifError(error);
					assert.equal(Math.round(86_400_000 / 1_000_000), Math.round(pttl / 1_000_000));
					done();
				});
			});
		});
	});
});
