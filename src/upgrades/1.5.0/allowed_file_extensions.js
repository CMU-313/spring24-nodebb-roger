'use strict';

const db = require('../../database');

module.exports = {
	name: 'Set default allowed file extensions',
	timestamp: Date.UTC(2017, 3, 14),
	method(callback) {
		db.getObjectField('config', 'allowedFileExtensions', (error, value) => {
			if (error || value) {
				return callback(error);
			}

			db.setObjectField('config', 'allowedFileExtensions', 'png,jpg,bmp', callback);
		});
	},
};
