'use strict';

const assert = require('node:assert');
const async = require('async');
const db = require('../mocks/databasemock');

describe('Set methods', () => {
	describe('setAdd()', () => {
		it('should add to a set', done => {
			db.setAdd('testSet1', 5, function (error) {
				assert.equal(error, null);
				assert.equal(arguments.length, 1);
				done();
			});
		});

		it('should add an array to a set', done => {
			db.setAdd('testSet1', [1, 2, 3, 4], function (error) {
				assert.equal(error, null);
				assert.equal(arguments.length, 1);
				done();
			});
		});

		it('should not do anything if values array is empty', async () => {
			await db.setAdd('emptyArraySet', []);
			const members = await db.getSetMembers('emptyArraySet');
			const exists = await db.exists('emptyArraySet');
			assert.deepStrictEqual(members, []);
			assert(!exists);
		});
	});

	describe('getSetMembers()', () => {
		before(done => {
			db.setAdd('testSet2', [1, 2, 3, 4, 5], done);
		});

		it('should return an empty set', done => {
			db.getSetMembers('doesnotexist', function (error, set) {
				assert.equal(error, null);
				assert.equal(arguments.length, 2);
				assert.equal(Array.isArray(set), true);
				assert.equal(set.length, 0);
				done();
			});
		});

		it('should return a set with all elements', done => {
			db.getSetMembers('testSet2', (error, set) => {
				assert.equal(error, null);
				assert.equal(set.length, 5);
				for (const value of set) {
					assert.notEqual(['1', '2', '3', '4', '5'].indexOf(value), -1);
				}

				done();
			});
		});
	});

	describe('setsAdd()', () => {
		it('should add to multiple sets', done => {
			db.setsAdd(['set1', 'set2'], 'value', function (error) {
				assert.equal(error, null);
				assert.equal(arguments.length, 1);
				done();
			});
		});

		it('should not error if keys is empty array', done => {
			db.setsAdd([], 'value', error => {
				assert.ifError(error);
				done();
			});
		});
	});

	describe('getSetsMembers()', () => {
		before(done => {
			db.setsAdd(['set3', 'set4'], 'value', done);
		});

		it('should return members of two sets', done => {
			db.getSetsMembers(['set3', 'set4'], function (error, sets) {
				assert.equal(error, null);
				assert.equal(Array.isArray(sets), true);
				assert.equal(arguments.length, 2);
				assert.equal(Array.isArray(sets[0]) && Array.isArray(sets[1]), true);
				assert.strictEqual(sets[0][0], 'value');
				assert.strictEqual(sets[1][0], 'value');
				done();
			});
		});
	});

	describe('isSetMember()', () => {
		before(done => {
			db.setAdd('testSet3', 5, done);
		});

		it('should return false if element is not member of set', done => {
			db.isSetMember('testSet3', 10, function (error, isMember) {
				assert.equal(error, null);
				assert.equal(arguments.length, 2);
				assert.equal(isMember, false);
				done();
			});
		});

		it('should return true if element is a member of set', done => {
			db.isSetMember('testSet3', 5, function (error, isMember) {
				assert.equal(error, null);
				assert.equal(arguments.length, 2);
				assert.equal(isMember, true);
				done();
			});
		});
	});

	describe('isSetMembers()', () => {
		before(done => {
			db.setAdd('testSet4', [1, 2, 3, 4, 5], done);
		});

		it('should return an array of booleans', done => {
			db.isSetMembers('testSet4', ['1', '2', '10', '3'], function (error, members) {
				assert.equal(error, null);
				assert.equal(arguments.length, 2);
				assert.equal(Array.isArray(members), true);
				assert.deepEqual(members, [true, true, false, true]);
				done();
			});
		});
	});

	describe('isMemberOfSets()', () => {
		before(done => {
			db.setsAdd(['set1', 'set2'], 'value', done);
		});

		it('should return an array of booleans', done => {
			db.isMemberOfSets(['set1', 'testSet1', 'set2', 'doesnotexist'], 'value', function (error, members) {
				assert.equal(error, null);
				assert.equal(arguments.length, 2);
				assert.equal(Array.isArray(members), true);
				assert.deepEqual(members, [true, false, true, false]);
				done();
			});
		});
	});

	describe('setCount()', () => {
		before(done => {
			db.setAdd('testSet5', [1, 2, 3, 4, 5], done);
		});

		it('should return the element count of set', done => {
			db.setCount('testSet5', function (error, count) {
				assert.equal(error, null);
				assert.equal(arguments.length, 2);
				assert.strictEqual(count, 5);
				done();
			});
		});

		it('should return 0 if set does not exist', done => {
			db.setCount('doesnotexist', (error, count) => {
				assert.ifError(error);
				assert.strictEqual(count, 0);
				done();
			});
		});
	});

	describe('setsCount()', () => {
		before(done => {
			async.parallel([
				async.apply(db.setAdd, 'set5', [1, 2, 3, 4, 5]),
				async.apply(db.setAdd, 'set6', 1),
				async.apply(db.setAdd, 'set7', 2),
			], done);
		});

		it('should return the element count of sets', done => {
			db.setsCount(['set5', 'set6', 'set7', 'doesnotexist'], function (error, counts) {
				assert.equal(error, null);
				assert.equal(arguments.length, 2);
				assert.equal(Array.isArray(counts), true);
				assert.deepEqual(counts, [5, 1, 1, 0]);
				done();
			});
		});
	});

	describe('setRemove()', () => {
		before(done => {
			db.setAdd('testSet6', [1, 2], done);
		});

		it('should remove a element from set', done => {
			db.setRemove('testSet6', '2', function (error) {
				assert.equal(error, null);
				assert.equal(arguments.length, 1);

				db.isSetMember('testSet6', '2', (error, isMember) => {
					assert.equal(error, null);
					assert.equal(isMember, false);
					done();
				});
			});
		});

		it('should remove multiple elements from set', done => {
			db.setAdd('multiRemoveSet', [1, 2, 3, 4, 5], error => {
				assert.ifError(error);
				db.setRemove('multiRemoveSet', [1, 3, 5], error => {
					assert.ifError(error);
					db.getSetMembers('multiRemoveSet', (error, members) => {
						assert.ifError(error);
						assert(members.includes('2'));
						assert(members.includes('4'));
						done();
					});
				});
			});
		});

		it('should remove multiple values from multiple keys', done => {
			db.setAdd('multiSetTest1', ['one', 'two', 'three', 'four'], error => {
				assert.ifError(error);
				db.setAdd('multiSetTest2', ['three', 'four', 'five', 'six'], error => {
					assert.ifError(error);
					db.setRemove(['multiSetTest1', 'multiSetTest2'], ['three', 'four', 'five', 'doesnt exist'], error => {
						assert.ifError(error);
						db.getSetsMembers(['multiSetTest1', 'multiSetTest2'], (error, members) => {
							assert.ifError(error);
							assert.equal(members[0].length, 2);
							assert.equal(members[1].length, 1);
							assert(members[0].includes('one'));
							assert(members[0].includes('two'));
							assert(members[1].includes('six'));
							done();
						});
					});
				});
			});
		});
	});

	describe('setsRemove()', () => {
		before(done => {
			db.setsAdd(['set1', 'set2'], 'value', done);
		});

		it('should remove a element from multiple sets', done => {
			db.setsRemove(['set1', 'set2'], 'value', function (error) {
				assert.equal(error, null);
				assert.equal(arguments.length, 1);
				db.isMemberOfSets(['set1', 'set2'], 'value', (error, members) => {
					assert.equal(error, null);
					assert.deepEqual(members, [false, false]);
					done();
				});
			});
		});
	});

	describe('setRemoveRandom()', () => {
		before(done => {
			db.setAdd('testSet7', [1, 2, 3, 4, 5], done);
		});

		it('should remove a random element from set', done => {
			db.setRemoveRandom('testSet7', function (error, element) {
				assert.equal(error, null);
				assert.equal(arguments.length, 2);

				db.isSetMember('testSet', element, (error, ismember) => {
					assert.equal(error, null);
					assert.equal(ismember, false);
					done();
				});
			});
		});
	});
});
