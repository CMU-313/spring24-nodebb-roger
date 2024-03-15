'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const nconf = require('nconf');
const utils = require('../src/utils');
const file = require('../src/file');

describe('file', () => {
	const filename = `${utils.generateUUID()}.png`;
	const folder = 'files';
	const uploadPath = path.join(nconf.get('upload_path'), folder, filename);
	const temporaryPath = path.join(__dirname, './files/test.png');

	afterEach(done => {
		fs.unlink(uploadPath, () => {
			done();
		});
	});

	describe('copyFile', () => {
		it('should copy a file', done => {
			fs.copyFile(temporaryPath, uploadPath, error => {
				assert.ifError(error);

				assert(file.existsSync(uploadPath));

				const sourceContent = fs.readFileSync(temporaryPath, 'utf8');
				const destinationContent = fs.readFileSync(uploadPath, 'utf8');

				assert.strictEqual(sourceContent, destinationContent);
				done();
			});
		});

		it('should override an existing file', done => {
			fs.writeFileSync(uploadPath, 'hsdkjhgkjsfhkgj');

			fs.copyFile(temporaryPath, uploadPath, error => {
				assert.ifError(error);

				assert(file.existsSync(uploadPath));

				const sourceContent = fs.readFileSync(temporaryPath, 'utf8');
				const destinationContent = fs.readFileSync(uploadPath, 'utf8');

				assert.strictEqual(sourceContent, destinationContent);
				done();
			});
		});

		it('should error if source file does not exist', done => {
			fs.copyFile(`${temporaryPath}0000000000`, uploadPath, error => {
				assert(error);
				assert.strictEqual(error.code, 'ENOENT');

				done();
			});
		});

		it('should error if existing file is read only', done => {
			fs.writeFileSync(uploadPath, 'hsdkjhgkjsfhkgj');
			fs.chmodSync(uploadPath, '444');

			fs.copyFile(temporaryPath, uploadPath, error => {
				assert(error);
				assert(error.code === 'EPERM' || error.code === 'EACCES');

				done();
			});
		});
	});

	describe('saveFileToLocal', () => {
		it('should work', done => {
			file.saveFileToLocal(filename, folder, temporaryPath, error => {
				assert.ifError(error);

				assert(file.existsSync(uploadPath));

				const oldFile = fs.readFileSync(temporaryPath, 'utf8');
				const newFile = fs.readFileSync(uploadPath, 'utf8');
				assert.strictEqual(oldFile, newFile);

				done();
			});
		});

		it('should error if source does not exist', done => {
			file.saveFileToLocal(filename, folder, `${temporaryPath}000000000`, error => {
				assert(error);
				assert.strictEqual(error.code, 'ENOENT');

				done();
			});
		});

		it('should error if folder is relative', done => {
			file.saveFileToLocal(filename, '../../text', `${temporaryPath}000000000`, error => {
				assert(error);
				assert.strictEqual(error.message, '[[error:invalid-path]]');
				done();
			});
		});
	});

	it('should walk directory', done => {
		file.walk(__dirname, (error, data) => {
			assert.ifError(error);
			assert(Array.isArray(data));
			done();
		});
	});

	it('should convert mime type to extension', done => {
		assert.equal(file.typeToExtension('image/png'), '.png');
		assert.equal(file.typeToExtension(''), '');
		done();
	});
});
