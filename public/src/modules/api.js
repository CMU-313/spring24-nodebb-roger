'use strict';

define('api', ['hooks'], hooks => {
	const api = {};
	const baseUrl = config.relative_path + '/api/v3';

	function call(options, callback) {
		options.url = options.url.startsWith('/api')
			? config.relative_path + options.url
			: baseUrl + options.url;

		async function doAjax(callback_) {
			// Allow options to be modified by plugins, etc.
			({options} = await hooks.fire('filter:api.options', {options}));

			$.ajax(options)
				.done(res => {
					callback_(null, (
						res
                        && res.hasOwnProperty('status')
                        && res.hasOwnProperty('response') ? res.response : (res || {})
					));
				})
				.fail(event => {
					let errorMessage;
					if (event.responseJSON) {
						errorMessage = event.responseJSON.status && event.responseJSON.status.message
							? event.responseJSON.status.message
							: event.responseJSON.error;
					}

					callback_(new Error(errorMessage || event.statusText));
				});
		}

		if (typeof callback === 'function') {
			doAjax(callback);
			return;
		}

		return new Promise((resolve, reject) => {
			doAjax((error, data) => {
				if (error) {
					reject(error);
				} else {
					resolve(data);
				}
			});
		});
	}

	api.get = (route, payload, onSuccess) => call({
		url: route + (payload && Object.keys(payload).length > 0 ? ('?' + $.param(payload)) : ''),
	}, onSuccess);

	api.head = (route, payload, onSuccess) => call({
		url: route + (payload && Object.keys(payload).length > 0 ? ('?' + $.param(payload)) : ''),
		method: 'head',
	}, onSuccess);

	api.post = (route, payload, onSuccess) => call({
		url: route,
		method: 'post',
		data: JSON.stringify(payload || {}),
		contentType: 'application/json; charset=utf-8',
		headers: {
			'x-csrf-token': config.csrf_token,
		},
	}, onSuccess);

	api.patch = (route, payload, onSuccess) => call({
		url: route,
		method: 'patch',
		data: JSON.stringify(payload || {}),
		contentType: 'application/json; charset=utf-8',
		headers: {
			'x-csrf-token': config.csrf_token,
		},
	}, onSuccess);

	api.put = (route, payload, onSuccess) => call({
		url: route,
		method: 'put',
		data: JSON.stringify(payload || {}),
		contentType: 'application/json; charset=utf-8',
		headers: {
			'x-csrf-token': config.csrf_token,
		},
	}, onSuccess);

	api.del = (route, payload, onSuccess) => call({
		url: route,
		method: 'delete',
		data: JSON.stringify(payload),
		contentType: 'application/json; charset=utf-8',
		headers: {
			'x-csrf-token': config.csrf_token,
		},
	}, onSuccess);
	api.delete = api.del;

	return api;
});
