'use strict';

define('forum/notifications', ['components', 'alerts'], (components, alerts) => {
	const Notifications = {};

	Notifications.init = function () {
		const listElement = $('.notifications-list');
		listElement.on('click', '[component="notifications/item/link"]', function () {
			const nid = $(this).parents('[data-nid]').attr('data-nid');
			socket.emit('notifications.markRead', nid, error => {
				if (error) {
					return alerts.error(error);
				}
			});
		});

		components.get('notifications/mark_all').on('click', () => {
			socket.emit('notifications.markAllRead', error => {
				if (error) {
					return alerts.error(error);
				}

				components.get('notifications/item').removeClass('unread');
			});
		});
	};

	return Notifications;
});
