'use strict';

const async = require('async');
const db = require('../../database');

module.exports = {
	name: 'Update global and user sound settings',
	timestamp: Date.UTC(2017, 1, 25),
	method(callback) {
		const meta = require('../../meta');
		const batch = require('../../batch');

		const map = {
			'notification.mp3': 'Default | Deedle-dum',
			'waterdrop-high.mp3': 'Default | Water drop (high)',
			'waterdrop-low.mp3': 'Default | Water drop (low)',
		};

		async.parallel([
			function (callback_) {
				const keys = ['chat-incoming', 'chat-outgoing', 'notification'];

				db.getObject('settings:sounds', (error, settings) => {
					if (error || !settings) {
						return callback_(error);
					}

					for (const key of keys) {
						if (settings[key] && !settings[key].includes(' | ')) {
							settings[key] = map[settings[key]] || '';
						}
					}

					meta.configs.setMultiple(settings, callback_);
				});
			},
			function (callback_) {
				const keys = ['notificationSound', 'incomingChatSound', 'outgoingChatSound'];

				batch.processSortedSet('users:joindate', (ids, next) => {
					async.each(ids, (uid, next) => {
						db.getObject(`user:${uid}:settings`, (error, settings) => {
							if (error || !settings) {
								return next(error);
							}

							const newSettings = {};
							for (const key of keys) {
								if (settings[key] && !settings[key].includes(' | ')) {
									newSettings[key] = map[settings[key]] || '';
								}
							}

							if (Object.keys(newSettings).length > 0) {
								db.setObject(`user:${uid}:settings`, newSettings, next);
							} else {
								setImmediate(next);
							}
						});
					}, next);
				}, callback_);
			},
		], callback);
	},
};
