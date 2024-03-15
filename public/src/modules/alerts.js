'use strict';

define('alerts', ['translator', 'components', 'hooks'], (translator, components, hooks) => {
	const module = {};

	module.alert = function (parameters) {
		parameters.alert_id = 'alert_button_' + (parameters.alert_id ? parameters.alert_id : Date.now());
		parameters.title = parameters.title ? parameters.title.trim() || '' : '';
		parameters.message = parameters.message ? parameters.message.trim() : '';
		parameters.type = parameters.type || 'info';

		const alert = $('#' + parameters.alert_id);
		if (alert.length > 0) {
			updateAlert(alert, parameters);
		} else {
			createNew(parameters);
		}
	};

	module.success = function (message, timeout) {
		module.alert({
			alert_id: utils.generateUUID(),
			title: '[[global:alert.success]]',
			message,
			type: 'success',
			timeout: timeout || 5000,
		});
	};

	module.error = function (message, timeout) {
		message = (message && message.message) || message;

		if (message === '[[error:revalidate-failure]]') {
			socket.disconnect();
			app.reconnect();
			return;
		}

		module.alert({
			alert_id: utils.generateUUID(),
			title: '[[global:alert.error]]',
			message,
			type: 'danger',
			timeout: timeout || 10_000,
		});
	};

	module.remove = function (id) {
		$('#alert_button_' + id).remove();
	};

	function createNew(parameters) {
		app.parseAndTranslate('alert', parameters, html => {
			let alert = $('#' + parameters.alert_id);
			if (alert.length > 0) {
				return updateAlert(alert, parameters);
			}

			alert = html;
			alert.fadeIn(200);

			components.get('toaster/tray').prepend(alert);

			if (typeof parameters.closefn === 'function') {
				alert.find('button').on('click', () => {
					parameters.closefn();
					fadeOut(alert);
					return false;
				});
			}

			if (parameters.timeout) {
				startTimeout(alert, parameters);
			}

			if (typeof parameters.clickfn === 'function') {
				alert
					.addClass('pointer')
					.on('click', e => {
						if (!$(e.target).is('.close')) {
							parameters.clickfn(alert, parameters);
						}

						fadeOut(alert);
					});
			}

			hooks.fire('action:alert.new', {alert, params: parameters});
		});
	}

	function updateAlert(alert, parameters) {
		alert.find('strong').translateHtml(parameters.title);
		alert.find('p').translateHtml(parameters.message);
		alert.attr('class', 'alert alert-dismissable alert-' + parameters.type + ' clearfix');

		clearTimeout(Number.parseInt(alert.attr('timeoutId'), 10));
		if (parameters.timeout) {
			startTimeout(alert, parameters);
		}

		hooks.fire('action:alert.update', {alert, params: parameters});

		// Handle changes in the clickfn
		alert.off('click').removeClass('pointer');
		if (typeof parameters.clickfn === 'function') {
			alert
				.addClass('pointer')
				.on('click', e => {
					if (!$(e.target).is('.close')) {
						parameters.clickfn();
					}

					fadeOut(alert);
				});
		}
	}

	function fadeOut(alert) {
		alert.fadeOut(500, function () {
			$(this).remove();
		});
	}

	function startTimeout(alert, parameters) {
		const timeout = parameters.timeout;

		const timeoutId = setTimeout(() => {
			fadeOut(alert);

			if (typeof parameters.timeoutfn === 'function') {
				parameters.timeoutfn(alert, parameters);
			}
		}, timeout);

		alert.attr('timeoutId', timeoutId);

		// Reset and start animation
		alert.css('transition-property', 'none');
		alert.removeClass('animate');

		setTimeout(() => {
			alert.css('transition-property', '');
			alert.css('transition', 'width ' + (timeout + 450) + 'ms linear, background-color ' + (timeout + 450) + 'ms ease-in');
			alert.addClass('animate');
			hooks.fire('action:alert.animate', {alert, params: parameters});
		}, 50);

		// Handle mouseenter/mouseleave
		alert
			.on('mouseenter', function () {
				$(this).css('transition-duration', 0);
			});
	}

	return module;
});
