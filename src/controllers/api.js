'use strict';

const validator = require('validator');
const nconf = require('nconf');
const meta = require('../meta');
const user = require('../user');
const categories = require('../categories');
const plugins = require('../plugins');
const translator = require('../translator');
const languages = require('../languages');

const apiController = module.exports;

const relative_path = nconf.get('relative_path');
const upload_url = nconf.get('upload_url');
const asset_base_url = nconf.get('asset_base_url');
const socketioTransports = nconf.get('socket.io:transports') || ['polling', 'websocket'];
const socketioOrigins = nconf.get('socket.io:origins');
const websocketAddress = nconf.get('socket.io:address') || '';

apiController.loadConfig = async function (request) {
	const config = {
		relative_path,
		upload_url,
		asset_base_url,
		assetBaseUrl: asset_base_url, // Deprecate in 1.20.x
		siteTitle: validator.escape(String(meta.config.title || meta.config.browserTitle || 'NodeBB')),
		browserTitle: validator.escape(String(meta.config.browserTitle || meta.config.title || 'NodeBB')),
		titleLayout: (meta.config.titleLayout || '{pageTitle} | {browserTitle}').replaceAll('{', '&#123;').replaceAll('}', '&#125;'),
		showSiteTitle: meta.config.showSiteTitle === 1,
		maintenanceMode: meta.config.maintenanceMode === 1,
		minimumTitleLength: meta.config.minimumTitleLength,
		maximumTitleLength: meta.config.maximumTitleLength,
		minimumPostLength: meta.config.minimumPostLength,
		maximumPostLength: meta.config.maximumPostLength,
		minimumTagsPerTopic: meta.config.minimumTagsPerTopic || 0,
		maximumTagsPerTopic: meta.config.maximumTagsPerTopic || 5,
		minimumTagLength: meta.config.minimumTagLength || 3,
		maximumTagLength: meta.config.maximumTagLength || 15,
		undoTimeout: meta.config.undoTimeout || 0,
		useOutgoingLinksPage: meta.config.useOutgoingLinksPage === 1,
		outgoingLinksWhitelist: meta.config.useOutgoingLinksPage === 1 ? meta.config['outgoingLinks:whitelist'] : undefined,
		allowGuestHandles: meta.config.allowGuestHandles === 1,
		allowTopicsThumbnail: meta.config.allowTopicsThumbnail === 1,
		usePagination: meta.config.usePagination === 1,
		disableChat: meta.config.disableChat === 1,
		disableChatMessageEditing: meta.config.disableChatMessageEditing === 1,
		maximumChatMessageLength: meta.config.maximumChatMessageLength || 1000,
		socketioTransports,
		socketioOrigins,
		websocketAddress,
		maxReconnectionAttempts: meta.config.maxReconnectionAttempts,
		reconnectionDelay: meta.config.reconnectionDelay,
		topicsPerPage: meta.config.topicsPerPage || 20,
		postsPerPage: meta.config.postsPerPage || 20,
		maximumFileSize: meta.config.maximumFileSize,
		'theme:id': meta.config['theme:id'],
		'theme:src': meta.config['theme:src'],
		defaultLang: meta.config.defaultLang || 'en-GB',
		userLang: request.query.lang ? validator.escape(String(request.query.lang)) : (meta.config.defaultLang || 'en-GB'),
		loggedIn: Boolean(request.user),
		uid: request.uid,
		'cache-buster': meta.config['cache-buster'] || '',
		topicPostSort: meta.config.topicPostSort || 'oldest_to_newest',
		categoryTopicSort: meta.config.categoryTopicSort || 'newest_to_oldest',
		csrf_token: request.uid >= 0 && request.csrfToken && request.csrfToken(),
		searchEnabled: plugins.hooks.hasListeners('filter:search.query'),
		searchDefaultInQuick: meta.config.searchDefaultInQuick || 'titles',
		bootswatchSkin: meta.config.bootswatchSkin || '',
		enablePostHistory: meta.config.enablePostHistory === 1,
		timeagoCutoff: meta.config.timeagoCutoff === '' ? meta.config.timeagoCutoff : Math.max(0, Number.parseInt(meta.config.timeagoCutoff, 10)),
		timeagoCodes: languages.timeagoCodes,
		cookies: {
			enabled: meta.config.cookieConsentEnabled === 1,
			message: translator.escape(validator.escape(meta.config.cookieConsentMessage || '[[global:cookies.message]]')).replaceAll('\\', '\\\\'),
			dismiss: translator.escape(validator.escape(meta.config.cookieConsentDismiss || '[[global:cookies.accept]]')).replaceAll('\\', '\\\\'),
			link: translator.escape(validator.escape(meta.config.cookieConsentLink || '[[global:cookies.learn_more]]')).replaceAll('\\', '\\\\'),
			link_url: translator.escape(validator.escape(meta.config.cookieConsentLinkUrl || 'https://www.cookiesandyou.com')).replaceAll('\\', '\\\\'),
		},
		thumbs: {
			size: meta.config.topicThumbSize,
		},
		iconBackgrounds: await user.getIconBackgrounds(request.uid),
		emailPrompt: meta.config.emailPrompt,
		useragent: request.useragent,
	};

	let settings = config;
	let isAdminOrGlobalModule;
	if (request.loggedIn) {
		([settings, isAdminOrGlobalModule] = await Promise.all([
			user.getSettings(request.uid),
			user.isAdminOrGlobalMod(request.uid),
		]));
	}

	// Handle old skin configs
	const oldSkins = ['noskin', 'default'];
	settings.bootswatchSkin = oldSkins.includes(settings.bootswatchSkin) ? '' : settings.bootswatchSkin;

	config.usePagination = settings.usePagination;
	config.topicsPerPage = settings.topicsPerPage;
	config.postsPerPage = settings.postsPerPage;
	config.userLang = validator.escape(
		String((request.query.lang ? request.query.lang : null) || settings.userLang || config.defaultLang),
	);
	config.acpLang = validator.escape(String((request.query.lang ? request.query.lang : null) || settings.acpLang));
	config.openOutgoingLinksInNewTab = settings.openOutgoingLinksInNewTab;
	config.topicPostSort = settings.topicPostSort || config.topicPostSort;
	config.categoryTopicSort = settings.categoryTopicSort || config.categoryTopicSort;
	config.topicSearchEnabled = settings.topicSearchEnabled || false;
	config.bootswatchSkin = (meta.config.disableCustomUserSkins !== 1 && settings.bootswatchSkin && settings.bootswatchSkin !== '') ? settings.bootswatchSkin : '';

	// Overrides based on privilege
	config.disableChatMessageEditing = isAdminOrGlobalModule ? false : config.disableChatMessageEditing;

	return await plugins.hooks.fire('filter:config.get', config);
};

apiController.getConfig = async function (request, res) {
	const config = await apiController.loadConfig(request);
	res.json(config);
};

apiController.getModerators = async function (request, res) {
	const moderators = await categories.getModerators(request.params.cid);
	res.json({moderators});
};

require('../promisify')(apiController, ['getConfig', 'getObject', 'getModerators']);
