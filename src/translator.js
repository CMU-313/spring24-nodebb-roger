'use strict';

const winston = require('winston');

function warn(message) {
	winston.warn(message);
}

module.exports = require('../public/src/modules/translator.common')(require('./utils'), (lang, namespace) => {
	const languages = require('./languages');
	return languages.get(lang, namespace);
}, warn);
