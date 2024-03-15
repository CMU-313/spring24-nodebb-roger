
'use strict';

const $ = require('jquery');

const utils = {...require('./utils.common')};

utils.getLanguage = function () {
	let lang = 'en-GB';
	if (typeof window === 'object' && window.config && window.utils) {
		lang = utils.params().lang || config.userLang || config.defaultLang || 'en-GB';
	}

	return lang;
};

utils.makeNumbersHumanReadable = function (elements) {
	elements.each(function () {
		$(this)
			.html(utils.makeNumberHumanReadable($(this).attr('title')))
			.removeClass('hidden');
	});
};

utils.addCommasToNumbers = function (elements) {
	elements.each((index, element) => {
		$(element)
			.html(utils.addCommas($(element).html()))
			.removeClass('hidden');
	});
};

utils.findBootstrapEnvironment = function () {
	// http://stackoverflow.com/questions/14441456/how-to-detect-which-device-view-youre-on-using-twitter-bootstrap-api
	const environments = ['xs', 'sm', 'md', 'lg'];
	const $element = $('<div>');

	$element.appendTo($('body'));

	for (let i = environments.length - 1; i >= 0; i -= 1) {
		const env = environments[i];

		$element.addClass('hidden-' + env);
		if ($element.is(':hidden')) {
			$element.remove();
			return env;
		}
	}
};

utils.isMobile = function () {
	const env = utils.findBootstrapEnvironment();
	return ['xs', 'sm'].includes(env);
};

utils.assertPasswordValidity = (password, zxcvbn) => {
	// More checks on top of basic utils.isPasswordValid()
	if (!utils.isPasswordValid(password)) {
		throw new Error('[[user:change_password_error]]');
	} else if (password.length < ajaxify.data.minimumPasswordLength) {
		throw new Error('[[reset_password:password_too_short]]');
	} else if (password.length > 512) {
		throw new Error('[[error:password-too-long]]');
	}

	const passwordStrength = zxcvbn(password);
	if (passwordStrength.score < ajaxify.data.minimumPasswordStrength) {
		throw new Error('[[user:weak_password]]');
	}
};

utils.generateUUID = function () {
	// From https://github.com/tracker1/node-uuid4/blob/master/browser.js
	const temporary_url = URL.createObjectURL(new Blob());
	const uuid = temporary_url.toString();
	URL.revokeObjectURL(temporary_url);
	return uuid.split(/[:/]/g).pop().toLowerCase(); // Remove prefixes
};

module.exports = utils;
