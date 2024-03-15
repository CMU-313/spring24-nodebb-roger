'use strict';

const factory = require('./translator.common');

define('translator', ['jquery', 'utils'], (indexQuery, utils) => {
	function loadClient(language, namespace) {
		return new Promise((resolve, reject) => {
			indexQuery.getJSON([config.asset_base_url, 'language', language, namespace].join('/') + '.json?' + config['cache-buster'], data => {
				const payload = {
					language,
					namespace,
					data,
				};
				require(['hooks'], hooks => {
					hooks.fire('action:translator.loadClient', payload);
					resolve(payload.promise ? Promise.resolve(payload.promise) : data);
				});
			}).fail((jqxhr, textStatus, error) => {
				reject(new Error(textStatus + ', ' + error));
			});
		});
	}

	const warn = function () {
		console.warn.apply(console, arguments);
	};

	return factory(utils, loadClient, warn);
});
