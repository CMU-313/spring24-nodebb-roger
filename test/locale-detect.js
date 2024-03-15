'use strict';

const assert = require('node:assert');
const nconf = require('nconf');
const request = require('request');
const meta = require('../src/meta');
const db = require('./mocks/databasemock');

describe('Language detection', () => {
	it('should detect the language for a guest', done => {
		meta.configs.set('autoDetectLang', 1, error => {
			assert.ifError(error);
			request(`${nconf.get('url')}/api/config`, {
				headers: {
					'Accept-Language': 'de-DE,de;q=0.5',
				},
				json: true,
			}, (error, res, body) => {
				assert.ifError(error);
				assert.ok(body);

				assert.strictEqual(body.userLang, 'de');
				done();
			});
		});
	});

	it('should do nothing when disabled', done => {
		meta.configs.set('autoDetectLang', 0, error => {
			assert.ifError(error);
			request(`${nconf.get('url')}/api/config`, {
				headers: {
					'Accept-Language': 'de-DE,de;q=0.5',
				},
				json: true,
			}, (error, res, body) => {
				assert.ifError(error);
				assert.ok(body);

				assert.strictEqual(body.userLang, 'en-GB');
				done();
			});
		});
	});
});
