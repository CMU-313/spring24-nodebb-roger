'use strict';

const privileges = require('../../privileges');

module.exports = {
	name: 'Group create global privilege',
	timestamp: Date.UTC(2019, 0, 4),
	method(callback) {
		const meta = require('../../meta');
		if (Number.parseInt(meta.config.allowGroupCreation, 10) === 1) {
			privileges.global.give(['groups:group:create'], 'registered-users', callback);
		} else {
			setImmediate(callback);
		}
	},
};
