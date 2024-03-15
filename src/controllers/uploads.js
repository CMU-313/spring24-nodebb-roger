'use strict';

const path = require('node:path');
const nconf = require('nconf');
const validator = require('validator');
const user = require('../user');
const meta = require('../meta');
const file = require('../file');
const plugins = require('../plugins');
const image = require('../image');
const privileges = require('../privileges');
const helpers = require('./helpers');

const uploadsController = module.exports;

uploadsController.upload = async function (request, res, filesIterator) {
	let files;
	try {
		files = request.files.files;
	} catch {
		return helpers.formatApiResponse(400, res);
	}

	// These checks added because of odd behaviour by request: https://github.com/request/request/issues/2445
	if (!Array.isArray(files)) {
		return helpers.formatApiResponse(500, res, new Error('[[error:invalid-file]]'));
	}

	if (Array.isArray(files[0])) {
		files = files[0];
	}

	try {
		const images = [];
		for (const fileObject of files) {
			/* eslint-disable no-await-in-loop */
			images.push(await filesIterator(fileObject));
		}

		helpers.formatApiResponse(200, res, {images});

		return images;
	} catch (error) {
		return helpers.formatApiResponse(500, res, error);
	} finally {
		deleteTemporaryFiles(files);
	}
};

uploadsController.uploadPost = async function (request, res) {
	await uploadsController.upload(request, res, async uploadedFile => {
		const isImage = uploadedFile.type.match(/image./);
		if (isImage) {
			return await uploadAsImage(request, uploadedFile);
		}

		return await uploadAsFile(request, uploadedFile);
	});
};

async function uploadAsImage(request, uploadedFile) {
	const canUpload = await privileges.global.can('upload:post:image', request.uid);
	if (!canUpload) {
		throw new Error('[[error:no-privileges]]');
	}

	await image.checkDimensions(uploadedFile.path);
	await image.stripEXIF(uploadedFile.path);

	if (plugins.hooks.hasListeners('filter:uploadImage')) {
		return await plugins.hooks.fire('filter:uploadImage', {
			image: uploadedFile,
			uid: request.uid,
			folder: 'files',
		});
	}

	await image.isFileTypeAllowed(uploadedFile.path);

	let fileObject = await uploadsController.uploadFile(request.uid, uploadedFile);
	// Sharp can't save svgs skip resize for them
	const isSVG = uploadedFile.type === 'image/svg+xml';
	if (isSVG || meta.config.resizeImageWidth === 0 || meta.config.resizeImageWidthThreshold === 0) {
		return fileObject;
	}

	fileObject = await resizeImage(fileObject);
	return {url: fileObject.url};
}

async function uploadAsFile(request, uploadedFile) {
	const canUpload = await privileges.global.can('upload:post:file', request.uid);
	if (!canUpload) {
		throw new Error('[[error:no-privileges]]');
	}

	const fileObject = await uploadsController.uploadFile(request.uid, uploadedFile);
	return {
		url: fileObject.url,
		name: fileObject.name,
	};
}

async function resizeImage(fileObject) {
	const imageData = await image.size(fileObject.path);
	if (
		imageData.width < meta.config.resizeImageWidthThreshold
        || meta.config.resizeImageWidth > meta.config.resizeImageWidthThreshold
	) {
		return fileObject;
	}

	await image.resizeImage({
		path: fileObject.path,
		target: file.appendToFileName(fileObject.path, '-resized'),
		width: meta.config.resizeImageWidth,
		quality: meta.config.resizeImageQuality,
	});
	// Return the resized version to the composer/postData
	fileObject.url = file.appendToFileName(fileObject.url, '-resized');

	return fileObject;
}

uploadsController.uploadThumb = async function (request, res) {
	if (!meta.config.allowTopicsThumbnail) {
		deleteTemporaryFiles(request.files.files);
		return helpers.formatApiResponse(503, res, new Error('[[error:topic-thumbnails-are-disabled]]'));
	}

	return await uploadsController.upload(request, res, async uploadedFile => {
		if (!/image./.test(uploadedFile.type)) {
			throw new Error('[[error:invalid-file]]');
		}

		await image.isFileTypeAllowed(uploadedFile.path);
		const dimensions = await image.checkDimensions(uploadedFile.path);

		if (dimensions.width > Number.parseInt(meta.config.topicThumbSize, 10)) {
			await image.resizeImage({
				path: uploadedFile.path,
				width: meta.config.topicThumbSize,
			});
		}

		if (plugins.hooks.hasListeners('filter:uploadImage')) {
			return await plugins.hooks.fire('filter:uploadImage', {
				image: uploadedFile,
				uid: request.uid,
				folder: 'files',
			});
		}

		return await uploadsController.uploadFile(request.uid, uploadedFile);
	});
};

uploadsController.uploadFile = async function (uid, uploadedFile) {
	if (plugins.hooks.hasListeners('filter:uploadFile')) {
		return await plugins.hooks.fire('filter:uploadFile', {
			file: uploadedFile,
			uid,
			folder: 'files',
		});
	}

	if (!uploadedFile) {
		throw new Error('[[error:invalid-file]]');
	}

	if (uploadedFile.size > meta.config.maximumFileSize * 1024) {
		throw new Error(`[[error:file-too-big, ${meta.config.maximumFileSize}]]`);
	}

	const allowed = file.allowedExtensions();

	const extension = path.extname(uploadedFile.name).toLowerCase();
	if (allowed.length > 0 && (!extension || extension === '.' || !allowed.includes(extension))) {
		throw new Error(`[[error:invalid-file-type, ${allowed.join('&#44; ')}]]`);
	}

	return await saveFileToLocal(uid, 'files', uploadedFile);
};

async function saveFileToLocal(uid, folder, uploadedFile) {
	const name = uploadedFile.name || 'upload';
	const extension = path.extname(name) || '';

	const filename = `${Date.now()}-${validator.escape(name.slice(0, -extension.length)).slice(0, 255)}${extension}`;

	const upload = await file.saveFileToLocal(filename, folder, uploadedFile.path);
	const storedFile = {
		url: nconf.get('relative_path') + upload.url,
		path: upload.path,
		name: uploadedFile.name,
	};

	await user.associateUpload(uid, upload.url.replace(`${nconf.get('upload_url')}/`, ''));
	const data = await plugins.hooks.fire('filter:uploadStored', {uid, uploadedFile, storedFile});
	return data.storedFile;
}

function deleteTemporaryFiles(files) {
	for (const fileObject of files) {
		file.delete(fileObject.path);
	}
}

require('../promisify')(uploadsController, ['upload', 'uploadPost', 'uploadThumb']);
