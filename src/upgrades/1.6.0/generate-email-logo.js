'use strict';

const path = require('node:path');
const fs = require('node:fs');
const async = require('async');
const nconf = require('nconf');
const meta = require('../../meta');
const image = require('../../image');

module.exports = {
	name: 'Generate email logo for use in email header',
	timestamp: Date.UTC(2017, 6, 17),
	method(callback) {
		let skip = false;

		async.series([
			function (next) {
				// Resize existing logo (if present) to email header size
				const uploadPath = path.join(nconf.get('upload_path'), 'system', 'site-logo-x50.png');
				const sourcePath = meta.config['brand:logo'] ? path.join(nconf.get('upload_path'), 'system', path.basename(meta.config['brand:logo'])) : null;

				if (!sourcePath) {
					skip = true;
					return setImmediate(next);
				}

				fs.access(sourcePath, error => {
					if (error || path.extname(sourcePath) === '.svg') {
						skip = true;
						return setImmediate(next);
					}

					image.resizeImage({
						path: sourcePath,
						target: uploadPath,
						height: 50,
					}, next);
				});
			},
			function (next) {
				if (skip) {
					return setImmediate(next);
				}

				meta.configs.setMultiple({
					'brand:logo': path.join('/assets/uploads/system', path.basename(meta.config['brand:logo'])),
					'brand:emailLogo': '/assets/uploads/system/site-logo-x50.png',
				}, next);
			},
		], callback);
	},
};
