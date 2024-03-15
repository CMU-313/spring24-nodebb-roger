'use strict';

const assert = require('node:assert');
const path = require('node:path');
const image = require('../src/image');
const file = require('../src/file');
const db = require('./mocks/databasemock');

describe('image', () => {
	it('should normalise image', done => {
		image.normalise(path.join(__dirname, 'files/normalise.jpg'), '.jpg', error => {
			assert.ifError(error);
			file.exists(path.join(__dirname, 'files/normalise.jpg.png'), (error, exists) => {
				assert.ifError(error);
				assert(exists);
				done();
			});
		});
	});

	it('should resize an image', done => {
		image.resizeImage({
			path: path.join(__dirname, 'files/normalise.jpg'),
			target: path.join(__dirname, 'files/normalise-resized.jpg'),
			width: 50,
			height: 40,
		}, error => {
			assert.ifError(error);
			image.size(path.join(__dirname, 'files/normalise-resized.jpg'), (error, bitmap) => {
				assert.ifError(error);
				assert.equal(bitmap.width, 50);
				assert.equal(bitmap.height, 40);
				done();
			});
		});
	});
});
