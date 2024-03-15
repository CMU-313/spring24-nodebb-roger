'use strict';

const assert = require('node:assert');
const async = require('async');
const batch = require('../src/batch');
const db = require('./mocks/databasemock');

describe('batch', () => {
	const scores = [];
	const values = [];
	before(done => {
		for (let i = 0; i < 100; i++) {
			scores.push(i);
			values.push(`val${i}`);
		}

		db.sortedSetAdd('processMe', scores, values, done);
	});

	it('should process sorted set with callbacks', done => {
		let total = 0;
		batch.processSortedSet('processMe', (items, next) => {
			for (const item of items) {
				total += item.score;
			}

			setImmediate(next);
		}, {
			withScores: true,
			interval: 50,
			batch: 10,
		}, error => {
			assert.ifError(error);
			assert.strictEqual(total, 4950);
			done();
		});
	});

	it('should process sorted set with callbacks', done => {
		let total = 0;
		batch.processSortedSet('processMe', (values, next) => {
			for (const value of values) {
				total += value.length;
			}

			setImmediate(next);
		}, error => {
			assert.ifError(error);
			assert.strictEqual(total, 490);
			done();
		});
	});

	it('should process sorted set with async/await', async () => {
		let total = 0;
		await batch.processSortedSet('processMe', (values, next) => {
			for (const value of values) {
				total += value.length;
			}

			setImmediate(next);
		}, {});

		assert.strictEqual(total, 490);
	});

	it('should process sorted set with async/await', async () => {
		let total = 0;
		await batch.processSortedSet('processMe', async values => {
			for (const value of values) {
				total += value.length;
			}

			await db.getObject('doesnotexist');
		}, {});

		assert.strictEqual(total, 490);
	});

	it('should process array with callbacks', done => {
		let total = 0;
		batch.processArray(scores, (nums, next) => {
			for (const n of nums) {
				total += n;
			}

			setImmediate(next);
		}, {
			withScores: true,
			interval: 50,
			batch: 10,
		}, error => {
			assert.ifError(error);
			assert.strictEqual(total, 4950);
			done();
		});
	});

	it('should process array with async/await', async () => {
		let total = 0;
		await batch.processArray(scores, (nums, next) => {
			for (const n of nums) {
				total += n;
			}

			setImmediate(next);
		}, {
			withScores: true,
			interval: 50,
			batch: 10,
		});

		assert.strictEqual(total, 4950);
	});
});
