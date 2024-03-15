'use strict';

define('autocomplete', ['api', 'alerts'], (api, alerts) => {
	const module = {};
	const _default = {
		delay: 200,
	};

	module.init = parameters => {
		const {input, source, onSelect, delay} = {..._default, ...parameters};

		app.loadJQueryUI(() => {
			input.autocomplete({
				delay,
				open() {
					$(this).autocomplete('widget').css('z-index', 100_005);
				},
				select(event, ui) {
					handleOnSelect(input, onSelect, event, ui);
				},
				source,
			});
		});
	};

	module.user = function (input, parameters, onSelect) {
		if (typeof parameters === 'function') {
			onSelect = parameters;
			parameters = {};
		}

		parameters ||= {};

		module.init({
			input,
			onSelect,
			source(request, response) {
				parameters.query = request.term;

				api.get('/api/users', parameters, (error, result) => {
					if (error) {
						return alerts.error(error);
					}

					if (result && result.users) {
						const names = result.users.map(user => {
							const username = $('<div></div>').html(user.username).text();
							return user && {
								label: username,
								value: username,
								user: {
									uid: user.uid,
									name: user.username,
									slug: user.userslug,
									username: user.username,
									userslug: user.userslug,
									picture: user.picture,
									banned: user.banned,
									'icon:text': user['icon:text'],
									'icon:bgColor': user['icon:bgColor'],
								},
							};
						});
						response(names);
					}

					$('.ui-autocomplete a').attr('data-ajaxify', 'false');
				});
			},
		});
	};

	module.group = function (input, onSelect) {
		module.init({
			input,
			onSelect,
			source(request, response) {
				socket.emit('groups.search', {
					query: request.term,
				}, (error, results) => {
					if (error) {
						return alerts.error(error);
					}

					if (results && results.length > 0) {
						const names = results.map(group => group && {
							label: group.name,
							value: group.name,
							group,
						});
						response(names);
					}

					$('.ui-autocomplete a').attr('data-ajaxify', 'false');
				});
			},
		});
	};

	module.tag = function (input, onSelect) {
		module.init({
			input,
			onSelect,
			delay: 100,
			source(request, response) {
				socket.emit('topics.autocompleteTags', {
					query: request.term,
					cid: ajaxify.data.cid || 0,
				}, (error, tags) => {
					if (error) {
						return alerts.error(error);
					}

					if (tags) {
						response(tags);
					}

					$('.ui-autocomplete a').attr('data-ajaxify', 'false');
				});
			},
		});
	};

	function handleOnSelect(input, onselect, event, ui) {
		onselect ||= function () {};
		const e = jQuery.Event('keypress');
		e.which = 13;
		e.keyCode = 13;
		setTimeout(() => {
			input.trigger(e);
		}, 100);
		onselect(event, ui);
	}

	return module;
});
