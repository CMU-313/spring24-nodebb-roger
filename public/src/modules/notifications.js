'use strict';

define('notifications', [
	'translator',
	'components',
	'navigator',
	'tinycon',
	'hooks',
	'alerts',
], (translator, components, navigator, Tinycon, hooks, alerts) => {
	const Notifications = {};

	let unreadNotifs = {};

	const _addShortTimeagoString = ({notifications: notifs}) => new Promise(resolve => {
		translator.toggleTimeagoShorthand(() => {
			for (const notification of notifs) {
				notification.timeago = $.timeago(new Date(Number.parseInt(notification.datetime, 10)));
			}

			translator.toggleTimeagoShorthand();
			resolve({notifications: notifs});
		});
	});
	hooks.on('filter:notifications.load', _addShortTimeagoString);

	Notifications.loadNotifications = function (notificationList, callback) {
		callback ||= function () {};
		socket.emit('notifications.get', null, (error, data) => {
			if (error) {
				return alerts.error(error);
			}

			const notifs = data.unread.concat(data.read).sort((a, b) => Number.parseInt(a.datetime, 10) > Number.parseInt(b.datetime, 10) ? -1 : 1);

			hooks.fire('filter:notifications.load', {notifications: notifs}).then(({notifications}) => {
				app.parseAndTranslate('partials/notifications_list', {notifications}, html => {
					notificationList.html(html);
					notificationList.off('click').on('click', '[data-nid]', function (event) {
						const notificationElement = $(this);
						if (scrollToPostIndexIfOnPage(notificationElement)) {
							event.stopPropagation();
							event.preventDefault();
							components.get('notifications/list').dropdown('toggle');
						}

						const unread = notificationElement.hasClass('unread');
						if (!unread) {
							return;
						}

						const nid = notificationElement.attr('data-nid');
						markNotification(nid, true);
					});
					components.get('notifications').on('click', '.mark-all-read', Notifications.markAllRead);

					notificationList.on('click', '.mark-read', function () {
						const liElement = $(this).parents('li');
						const unread = liElement.hasClass('unread');
						const nid = liElement.attr('data-nid');
						markNotification(nid, unread, () => {
							liElement.toggleClass('unread');
						});
						return false;
					});

					hooks.fire('action:notifications.loaded', {
						notifications: notifs,
						list: notificationList,
					});
					callback();
				});
			});
		});
	};

	Notifications.onNewNotification = function (notificationData) {
		if (ajaxify.currentPage === 'notifications') {
			ajaxify.refresh();
		}

		socket.emit('notifications.getCount', (error, count) => {
			if (error) {
				return alerts.error(error);
			}

			Notifications.updateNotifCount(count);
		});

		if (!unreadNotifs[notificationData.nid]) {
			unreadNotifs[notificationData.nid] = true;
		}
	};

	function markNotification(nid, read, callback) {
		socket.emit('notifications.mark' + (read ? 'Read' : 'Unread'), nid, error => {
			if (error) {
				return alerts.error(error);
			}

			if (read && unreadNotifs[nid]) {
				delete unreadNotifs[nid];
			}

			if (callback) {
				callback();
			}
		});
	}

	function scrollToPostIndexIfOnPage(notificationElement) {
		// Scroll to index if already in topic (gh#5873)
		const pid = notificationElement.attr('data-pid');
		const path = notificationElement.attr('data-path');
		const postElement = components.get('post', 'pid', pid);
		if (path.startsWith(config.relative_path + '/post/') && pid && postElement.length > 0 && ajaxify.data.template.topic) {
			navigator.scrollToIndex(postElement.attr('data-index'), true);
			return true;
		}

		return false;
	}

	Notifications.updateNotifCount = function (count) {
		const notificationIcon = components.get('notifications/icon');
		count = Math.max(0, count);
		if (count > 0) {
			notificationIcon.removeClass('fa-bell-o').addClass('fa-bell');
		} else {
			notificationIcon.removeClass('fa-bell').addClass('fa-bell-o');
		}

		notificationIcon.toggleClass('unread-count', count > 0);
		notificationIcon.attr('data-content', count > 99 ? '99+' : count);

		const payload = {
			count,
			updateFavicon: true,
		};
		hooks.fire('action:notification.updateCount', payload);

		if (payload.updateFavicon) {
			Tinycon.setBubble(count > 99 ? '99+' : count);
		}

		if (navigator.setAppBadge) { // Feature detection
			navigator.setAppBadge(count);
		}
	};

	Notifications.markAllRead = function () {
		socket.emit('notifications.markAllRead', error => {
			if (error) {
				alerts.error(error);
			}

			unreadNotifs = {};
		});
	};

	return Notifications;
});
