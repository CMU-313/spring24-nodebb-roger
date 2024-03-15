'use strict';

const widgets = require('../../widgets');

const Widgets = module.exports;

Widgets.set = async function (socket, data) {
	if (!Array.isArray(data)) {
		throw new TypeError('[[error:invalid-data]]');
	}

	await widgets.setAreas(data);
};
