'use strict';

const helpers = module.exports;
const utils = require('../../utils');

helpers.noop = function () {};

helpers.toMap = function (data) {
	const map = {};
	for (const datum of data) {
		map[datum._key] = datum;
		delete datum._key;
	}

	return map;
};

helpers.fieldToString = function (field) {
	if (field === null || field === undefined) {
		return field;
	}

	if (typeof field !== 'string') {
		field = field.toString();
	}

	// If there is a '.' in the field name it inserts subdocument in mongo, replace '.'s with \uff0E
	return field.replaceAll('.', '\uFF0E');
};

helpers.serializeData = function (data) {
	const serialized = {};
	for (const [field, value] of Object.entries(data)) {
		if (field !== '') {
			serialized[helpers.fieldToString(field)] = value;
		}
	}

	return serialized;
};

helpers.deserializeData = function (data) {
	const deserialized = {};
	for (const [field, value] of Object.entries(data)) {
		deserialized[field.replaceAll('．', '.')] = value;
	}

	return deserialized;
};

helpers.valueToString = String;

helpers.buildMatchQuery = function (match) {
	let _match = match;
	if (match.startsWith('*')) {
		_match = _match.slice(1);
	}

	if (match.endsWith('*')) {
		_match = _match.slice(0, Math.max(0, _match.length - 1));
	}

	_match = utils.escapeRegexChars(_match);
	if (!match.startsWith('*')) {
		_match = `^${_match}`;
	}

	if (!match.endsWith('*')) {
		_match += '$';
	}

	return _match;
};
