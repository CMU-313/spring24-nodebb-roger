'use strict';

const fs = require('node:fs');
const path = require('node:path');
const nconf = require('nconf');
const winston = require('winston');
const mkdirp = require('mkdirp');
const mime = require('mime');
const graceful = require('graceful-fs');
const slugify = require('./slugify');

graceful.gracefulify(fs);

const file = module.exports;

file.saveFileToLocal = async function (filename, folder, temporaryPath) {
	/*
     * Remarkable doesn't allow spaces in hyperlinks, once that's fixed, remove this.
     */
	filename = filename.split('.').map(name => slugify(name)).join('.');

	const uploadPath = path.join(nconf.get('upload_path'), folder, filename);
	if (!uploadPath.startsWith(nconf.get('upload_path'))) {
		throw new Error('[[error:invalid-path]]');
	}

	winston.verbose(`Saving file ${filename} to : ${uploadPath}`);
	await mkdirp(path.dirname(uploadPath));
	await fs.promises.copyFile(temporaryPath, uploadPath);
	return {
		url: `/assets/uploads/${folder ? `${folder}/` : ''}${filename}`,
		path: uploadPath,
	};
};

file.base64ToLocal = async function (imageData, uploadPath) {
	const buffer = Buffer.from(imageData.slice(imageData.indexOf('base64') + 7), 'base64');
	uploadPath = path.join(nconf.get('upload_path'), uploadPath);

	await fs.promises.writeFile(uploadPath, buffer, {
		encoding: 'base64',
	});
	return uploadPath;
};

// https://stackoverflow.com/a/31205878/583363
file.appendToFileName = function (filename, string) {
	const dotIndex = filename.lastIndexOf('.');
	if (dotIndex === -1) {
		return filename + string;
	}

	return filename.slice(0, Math.max(0, dotIndex)) + string + filename.slice(Math.max(0, dotIndex));
};

file.allowedExtensions = function () {
	const meta = require('./meta');
	let allowedExtensions = (meta.config.allowedFileExtensions || '').trim();
	if (!allowedExtensions) {
		return [];
	}

	allowedExtensions = allowedExtensions.split(',');
	allowedExtensions = allowedExtensions.filter(Boolean).map(extension => {
		extension = extension.trim();
		if (!extension.startsWith('.')) {
			extension = `.${extension}`;
		}

		return extension.toLowerCase();
	});

	if (allowedExtensions.includes('.jpg') && !allowedExtensions.includes('.jpeg')) {
		allowedExtensions.push('.jpeg');
	}

	return allowedExtensions;
};

file.exists = async function (path) {
	try {
		await fs.promises.stat(path);
	} catch (error) {
		if (error.code === 'ENOENT') {
			return false;
		}

		throw error;
	}

	return true;
};

file.existsSync = function (path) {
	try {
		fs.statSync(path);
	} catch (error) {
		if (error.code === 'ENOENT') {
			return false;
		}

		throw error;
	}

	return true;
};

file.delete = async function (path) {
	if (!path) {
		return;
	}

	try {
		await fs.promises.unlink(path);
	} catch (error) {
		if (error.code === 'ENOENT') {
			winston.verbose(`[file] Attempted to delete non-existent file: ${path}`);
			return;
		}

		winston.warn(error);
	}
};

file.link = async function link(filePath, destinationPath, relative) {
	if (relative && process.platform !== 'win32') {
		filePath = path.relative(path.dirname(destinationPath), filePath);
	}

	await (process.platform === 'win32' ? fs.promises.link(filePath, destinationPath) : fs.promises.symlink(filePath, destinationPath, 'file'));
};

file.linkDirs = async function linkDirectories(sourceDir, destDir, relative) {
	if (relative && process.platform !== 'win32') {
		sourceDir = path.relative(path.dirname(destDir), sourceDir);
	}

	const type = (process.platform === 'win32') ? 'junction' : 'dir';
	await fs.promises.symlink(sourceDir, destDir, type);
};

file.typeToExtension = function (type) {
	let extension = '';
	if (type) {
		extension = `.${mime.getExtension(type)}`;
	}

	return extension;
};

// Adapted from http://stackoverflow.com/questions/5827612/node-js-fs-readdir-recursive-directory-search
file.walk = async function (dir) {
	const subdirs = await fs.promises.readdir(dir);
	const files = await Promise.all(subdirs.map(async subdir => {
		const res = path.resolve(dir, subdir);
		return (await fs.promises.stat(res)).isDirectory() ? file.walk(res) : res;
	}));
	return files.flat();
};

require('./promisify')(file);
