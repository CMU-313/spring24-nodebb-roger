'use strict';

const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const password = require('../src/password');

describe('Password', () => {
	describe('.hash()', () => {
		it('should return a password hash when called', async () => {
			const hash = await password.hash(12, 'test');
			assert(hash.startsWith('$2a$'));
		});
	});

	describe('.compare()', async () => {
		const salt = await bcrypt.genSalt(12);

		it('should correctly compare a password and a hash', async () => {
			const hash = await password.hash(12, 'test');
			const match = await password.compare('test', hash, true);
			assert(match);
		});

		it('should correctly handle comparison with no sha wrapping of the input (backwards compatibility)', async () => {
			const hash = await bcrypt.hash('test', salt);
			const match = await password.compare('test', hash, false);
			assert(match);
		});

		it('should continue to function even with passwords > 73 characters', async () => {
			const array = [];
			array.length = 100;
			const hash = await password.hash(12, array.join('a'));

			array.length = 150;
			const match = await password.compare(array.join('a'), hash, true);
			assert.strictEqual(match, false);
		});

		it('should process a million-character long password quickly', async () => {
			// ... because sha512 reduces it to a constant size
			const array = [];
			const start = Date.now();
			array.length = 1_000_000;
			await password.hash(12, array.join('a'));
			const end = Date.now();

			assert(end - start < 5000);
		});
	});
});
