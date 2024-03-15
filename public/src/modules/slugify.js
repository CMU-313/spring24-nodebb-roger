'use strict';

/* global XRegExp */
(function (factory) {
	if (typeof define === 'function' && define.amd) {
		define('slugify', ['xregexp'], factory);
	} else if (typeof exports === 'object') {
		module.exports = factory(require('xregexp'));
	} else {
		window.slugify = factory(XRegExp);
	}
})(XRegExp => {
	const invalidUnicodeChars = XRegExp('[^\\p{L}\\s\\d\\-_]', 'g');
	const invalidLatinChars = /[^\w\s\d\-_]/g;
	const trimRegex = /^\s+|\s+$/g;
	const collapseWhitespace = /\s+/g;
	const collapseDash = /-+/g;
	const trimTrailingDash = /-$/g;
	const trimLeadingDash = /^-/g;
	const isLatin = /^[\w\d\s.,\-@]+$/;

	// http://dense13.com/blog/2009/05/03/converting-string-to-slug-javascript/
	return function slugify(string_, preserveCase) {
		if (!string_) {
			return '';
		}

		string_ = String(string_).replaceAll(trimRegex, '');
		string_ = isLatin.test(string_) ? string_.replaceAll(invalidLatinChars, '-') : XRegExp.replace(string_, invalidUnicodeChars, '-');

		string_ = preserveCase ? string_ : string_.toLocaleLowerCase();
		string_ = string_.replaceAll(collapseWhitespace, '-');
		string_ = string_.replaceAll(collapseDash, '-');
		string_ = string_.replaceAll(trimTrailingDash, '');
		string_ = string_.replaceAll(trimLeadingDash, '');
		return string_;
	};
});
