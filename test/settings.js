'use strict';

const assert = require('node:assert');
const nconf = require('nconf');
const settings = require('../src/settings');
const db = require('./mocks/databasemock');

describe('settings v3', () => {
	let settings1;
	let settings2;

	it('should create a new settings object', done => {
		settings1 = new settings('my-plugin', '1.0', {foo: 1, bar: {derp: 2}}, done);
	});

	it('should get the saved settings ', done => {
		assert.equal(settings1.get('foo'), 1);
		assert.equal(settings1.get('bar.derp'), 2);
		done();
	});

	it('should create a new settings instance for same key', done => {
		settings2 = new settings('my-plugin', '1.0', {foo: 1, bar: {derp: 2}}, done);
	});

	it('should pass change between settings object over pubsub', done => {
		settings1.set('foo', 3);
		settings1.persist(error => {
			assert.ifError(error);
			// Give pubsub time to complete
			setTimeout(() => {
				assert.equal(settings2.get('foo'), 3);
				done();
			}, 500);
		});
	});

	it('should set a nested value', done => {
		settings1.set('bar.derp', 5);
		assert.equal(settings1.get('bar.derp'), 5);
		done();
	});

	it('should reset the settings to default', done => {
		settings1.reset(error => {
			assert.ifError(error);
			assert.equal(settings1.get('foo'), 1);
			assert.equal(settings1.get('bar.derp'), 2);
			done();
		});
	});

	it('should get value from default value', done => {
		const newSettings = new settings('some-plugin', '1.0', {default: {value: 1}});
		assert.equal(newSettings.get('default.value'), 1);
		done();
	});
});
