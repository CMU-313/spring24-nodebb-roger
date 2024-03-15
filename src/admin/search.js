'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sanitizeHTML = require('sanitize-html');
const nconf = require('nconf');
const winston = require('winston');
const file = require('../file');
const {Translator} = require('../translator');

function filterDirectories(directories) {
	return directories.map(
		// Get the relative path
		// convert dir to use forward slashes
		dir => dir.replace(/^.*(admin.*?).tpl$/, '$1').split(path.sep).join('/'),
	).filter(
		// Exclude .js files
		// exclude partials
		// only include subpaths
		// exclude category.tpl, group.tpl, category-analytics.tpl
		dir => (
			!dir.endsWith('.js')
            && !dir.includes('/partials/')
            && /\/.*\//.test(dir)
            && !/manage\/(category|group|category-analytics)$/.test(dir)
		),
	);
}

async function getAdminNamespaces() {
	const directories = await file.walk(path.resolve(nconf.get('views_dir'), 'admin'));
	return filterDirectories(directories);
}

function sanitize(html) {
	// Reduce the template to just meaningful text
	// remove all tags and strip out scripts, etc completely
	return sanitizeHTML(html, {
		allowedTags: [],
		allowedAttributes: [],
	});
}

function simplify(translations) {
	return translations
	// Remove all mustaches
		.replaceAll(/(?:{{1,2}[^}]*?}{1,2})/g, '')
	// Collapse whitespace
		.replaceAll(/(?:[ \t]*[\n\r]+[ \t]*)+/g, '\n')
		.replaceAll(/[\t ]+/g, ' ');
}

function nsToTitle(namespace) {
	return namespace.replace('admin/', '').split('/').map(string_ => string_[0].toUpperCase() + string_.slice(1)).join(' > ')
		.replaceAll(/[^a-zA-Z> ]/g, ' ');
}

const fallbackCache = {};

async function initFallback(namespace) {
	const template = await fs.promises.readFile(path.resolve(nconf.get('views_dir'), `${namespace}.tpl`), 'utf8');

	const title = nsToTitle(namespace);
	let translations = sanitize(template);
	translations = Translator.removePatterns(translations);
	translations = simplify(translations);
	translations += `\n${title}`;

	return {
		namespace,
		translations,
		title,
	};
}

async function fallback(namespace) {
	if (fallbackCache[namespace]) {
		return fallbackCache[namespace];
	}

	const parameters = await initFallback(namespace);
	fallbackCache[namespace] = parameters;
	return parameters;
}

async function initDictionary(language) {
	const namespaces = await getAdminNamespaces();
	return await Promise.all(namespaces.map(ns => buildNamespace(language, ns)));
}

async function buildNamespace(language, namespace) {
	const translator = Translator.create(language);
	try {
		const translations = await translator.getTranslation(namespace);
		if (!translations || Object.keys(translations).length === 0) {
			return await fallback(namespace);
		}

		// Join all translations into one string separated by newlines
		let string_ = Object.keys(translations).map(key => translations[key]).join('\n');
		string_ = sanitize(string_);

		let title = namespace;
		title = title.match(/admin\/(.+?)\/(.+?)$/);
		title = `[[admin/menu:section-${
			title[1] === 'development' ? 'advanced' : title[1]
		}]]${title[2] ? (` > [[admin/menu:${
			title[1]}/${title[2]}]]`) : ''}`;

		title = await translator.translate(title);
		return {
			namespace,
			translations: `${string_}\n${title}`,
			title,
		};
	} catch (error) {
		winston.error(error.stack);
		return {
			namespace,
			translations: '',
		};
	}
}

const cache = {};

async function getDictionary(language) {
	if (cache[language]) {
		return cache[language];
	}

	const parameters = await initDictionary(language);
	cache[language] = parameters;
	return parameters;
}

module.exports.getDictionary = getDictionary;
module.exports.filterDirectories = filterDirectories;
module.exports.simplify = simplify;
module.exports.sanitize = sanitize;

require('../promisify')(module.exports);
