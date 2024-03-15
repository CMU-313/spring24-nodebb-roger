'use strict';

const io = require('socket.io-client');
const $ = require('jquery');

app = window.app || {};

(function () {
	let reconnecting = false;

	const ioParameters = {
		reconnectionAttempts: config.maxReconnectionAttempts,
		reconnectionDelay: config.reconnectionDelay,
		transports: config.socketioTransports,
		path: config.relative_path + '/socket.io',
	};

	window.socket = io(config.websocketAddress, ioParameters);

	const oEmit = socket.emit;
	socket.emit = function (event, data, callback) {
		if (typeof data === 'function') {
			callback = data;
			data = null;
		}

		if (typeof callback === 'function') {
			oEmit.apply(socket, [event, data, callback]);
			return;
		}

		return new Promise((resolve, reject) => {
			oEmit.apply(socket, [event, data, function (error, result) {
				if (error) {
					reject(error);
				} else {
					resolve(result);
				}
			}]);
		});
	};

	let hooks;
	require(['hooks'], _hooks => {
		hooks = _hooks;
		if (Number.parseInt(app.user.uid, 10) >= 0) {
			addHandlers();
		}
	});

	window.app.reconnect = () => {
		if (socket.connected) {
			return;
		}

		const reconnectElement = $('#reconnect');
		$('#reconnect-alert')
			.removeClass('alert-danger pointer')
			.addClass('alert-warning')
			.find('p')
			.translateText(`[[global:reconnecting-message, ${config.siteTitle}]]`);

		reconnectElement.html('<i class="fa fa-spinner fa-spin"></i>');
		socket.connect();
	};

	function addHandlers() {
		socket.on('connect', onConnect);

		socket.on('disconnect', onDisconnect);

		socket.io.on('reconnect_failed', () => {
			const reconnectElement = $('#reconnect');
			reconnectElement.html('<i class="fa fa-plug text-danger"></i>');

			$('#reconnect-alert')
				.removeClass('alert-warning')
				.addClass('alert-danger pointer')
				.find('p')
				.translateText('[[error:socket-reconnect-failed]]')
				.one('click', app.reconnect);

			$(window).one('focus', app.reconnect);
		});

		socket.on('checkSession', uid => {
			if (Number.parseInt(uid, 10) !== Number.parseInt(app.user.uid, 10)) {
				handleSessionMismatch();
			}
		});
		socket.on('event:invalid_session', () => {
			handleInvalidSession();
		});

		socket.on('setHostname', hostname => {
			app.upstreamHost = hostname;
		});

		socket.on('event:banned', onEventBanned);
		socket.on('event:unbanned', onEventUnbanned);
		socket.on('event:logout', () => {
			require(['logout'], logout => {
				logout();
			});
		});
		socket.on('event:alert', parameters => {
			require(['alerts'], alerts => {
				alerts.alert(parameters);
			});
		});
		socket.on('event:deprecated_call', data => {
			console.warn('[socket.io]', data.eventName, 'is now deprecated in favour of', data.replacement);
		});

		socket.removeAllListeners('event:nodebb.ready');
		socket.on('event:nodebb.ready', data => {
			if ((data.hostname === app.upstreamHost) && (!app.cacheBuster || app.cacheBuster !== data['cache-buster'])) {
				app.cacheBuster = data['cache-buster'];
				require(['alerts'], alerts => {
					alerts.alert({
						alert_id: 'forum_updated',
						title: '[[global:updated.title]]',
						message: '[[global:updated.message]]',
						clickfn() {
							window.location.reload();
						},
						type: 'warning',
					});
				});
			}
		});
		socket.on('event:livereload', () => {
			if (app.user.isAdmin && !/admin/.test(ajaxify.currentPage)) {
				window.location.reload();
			}
		});
	}

	function handleInvalidSession() {
		socket.disconnect();
		require(['messages', 'logout'], (messages, logout) => {
			logout(false);
			messages.showInvalidSession();
		});
	}

	function handleSessionMismatch() {
		if (app.flags._login || app.flags._logout) {
			return;
		}

		socket.disconnect();
		require(['messages'], messages => {
			messages.showSessionMismatch();
		});
	}

	function onConnect() {
		if (!reconnecting) {
			hooks.fire('action:connected');
		}

		if (reconnecting) {
			const reconnectElement = $('#reconnect');
			const reconnectAlert = $('#reconnect-alert');

			reconnectElement.tooltip('destroy');
			reconnectElement.html('<i class="fa fa-check text-success"></i>');
			reconnectAlert.addClass('hide');
			reconnecting = false;

			reJoinCurrentRoom();

			socket.emit('meta.reconnected');

			hooks.fire('action:reconnected');

			setTimeout(() => {
				reconnectElement.removeClass('active').addClass('hide');
			}, 3000);
		}
	}

	function reJoinCurrentRoom() {
		if (app.currentRoom) {
			const current = app.currentRoom;
			app.currentRoom = '';
			app.enterRoom(current);
		}
	}

	function onReconnecting() {
		reconnecting = true;
		const reconnectElement = $('#reconnect');
		const reconnectAlert = $('#reconnect-alert');

		if (!reconnectElement.hasClass('active')) {
			reconnectElement.html('<i class="fa fa-spinner fa-spin"></i>');
			reconnectAlert.removeClass('hide');
		}

		reconnectElement.addClass('active').removeClass('hide').tooltip({
			placement: 'bottom',
		});
	}

	function onDisconnect() {
		setTimeout(() => {
			if (socket.disconnected) {
				onReconnecting();
			}
		}, 2000);

		hooks.fire('action:disconnected');
	}

	function onEventBanned(data) {
		require(['bootbox', 'translator'], (bootbox, translator) => {
			const message = data.until
				? translator.compile('error:user-banned-reason-until', (new Date(data.until).toLocaleString()), data.reason)
				: '[[error:user-banned-reason, ' + data.reason + ']]';
			translator.translate(message, message => {
				bootbox.alert({
					title: '[[error:user-banned]]',
					message,
					closeButton: false,
					callback() {
						window.location.href = config.relative_path + '/';
					},
				});
			});
		});
	}

	function onEventUnbanned() {
		require(['bootbox'], bootbox => {
			bootbox.alert({
				title: '[[global:alert.unbanned]]',
				message: '[[global:alert.unbanned.message]]',
				closeButton: false,
				callback() {
					window.location.href = config.relative_path + '/';
				},
			});
		});
	}

	if (
		config.socketioOrigins
        && config.socketioOrigins !== '*:*'
        && !config.socketioOrigins.includes(location.hostname)
	) {
		console.error(
			'You are accessing the forum from an unknown origin. This will likely result in websockets failing to connect. \n'
            + 'To fix this, set the `"url"` value in `config.json` to the URL at which you access the site. \n'
            + 'For more information, see this FAQ topic: https://community.nodebb.org/topic/13388',
		);
	}
})();
