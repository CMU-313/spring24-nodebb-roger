'use strict';

const path = require('node:path');
const nconf = require('nconf');
const db = require('../database');
const image = require('../image');
const file = require('../file');

module.exports = function (Groups) {
	const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/bmp']);
	Groups.updateCoverPosition = async function (groupName, position) {
		if (!groupName) {
			throw new Error('[[error:invalid-data]]');
		}

		await Groups.setGroupField(groupName, 'cover:position', position);
	};

	Groups.updateCover = async function (uid, data) {
		let temporaryPath = data.file ? data.file.path : '';
		try {
			// Position only? That's fine
			if (!data.imageData && !data.file && data.position) {
				return await Groups.updateCoverPosition(data.groupName, data.position);
			}

			const type = data.file ? data.file.type : image.mimeFromBase64(data.imageData);
			if (!type || !allowedTypes.has(type)) {
				throw new Error('[[error:invalid-image]]');
			}

			temporaryPath ||= await image.writeImageDataToTempFile(data.imageData);

			const filename = `groupCover-${data.groupName}${path.extname(temporaryPath)}`;
			const uploadData = await image.uploadImage(filename, 'files', {
				path: temporaryPath,
				uid,
				name: 'groupCover',
			});
			const {url} = uploadData;
			await Groups.setGroupField(data.groupName, 'cover:url', url);

			await image.resizeImage({
				path: temporaryPath,
				width: 358,
			});
			const thumbUploadData = await image.uploadImage(`groupCoverThumb-${data.groupName}${path.extname(temporaryPath)}`, 'files', {
				path: temporaryPath,
				uid,
				name: 'groupCover',
			});
			await Groups.setGroupField(data.groupName, 'cover:thumb:url', thumbUploadData.url);

			if (data.position) {
				await Groups.updateCoverPosition(data.groupName, data.position);
			}

			return {url};
		} finally {
			file.delete(temporaryPath);
		}
	};

	Groups.removeCover = async function (data) {
		const fields = ['cover:url', 'cover:thumb:url'];
		const values = await Groups.getGroupFields(data.groupName, fields);
		await Promise.all(fields.map(field => {
			if (!values[field] || !values[field].startsWith(`${nconf.get('relative_path')}/assets/uploads/files/`)) {
				return;
			}

			const filename = values[field].split('/').pop();
			const filePath = path.join(nconf.get('upload_path'), 'files', filename);
			return file.delete(filePath);
		}));

		await db.deleteObjectFields(`group:${data.groupName}`, ['cover:url', 'cover:thumb:url', 'cover:position']);
	};
};
