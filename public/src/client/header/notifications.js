'use strict';

define('forum/header/notifications', ['components'], components => {
	const notifications = {};

	notifications.prepareDOM = function () {
		const notificationContainer = components.get('notifications');
		const notificationTrigger = notificationContainer.children('a');
		const notificationList = components.get('notifications/list');

		notificationTrigger.on('click', e => {
			e.preventDefault();
			if (notificationContainer.hasClass('open')) {
				return;
			}

			requireAndCall('loadNotifications', notificationList);
		});

		if (notificationTrigger.parents('.dropdown').hasClass('open')) {
			requireAndCall('loadNotifications', notificationList);
		}

		socket.removeListener('event:new_notification', onNewNotification);
		socket.on('event:new_notification', onNewNotification);

		socket.removeListener('event:notifications.updateCount', onUpdateCount);
		socket.on('event:notifications.updateCount', onUpdateCount);
	};

	function onNewNotification(data) {
		requireAndCall('onNewNotification', data);
	}

	function onUpdateCount(data) {
		requireAndCall('updateNotifCount', data);
	}

	function requireAndCall(method, parameter) {
		require(['notifications'], notifications => {
			notifications[method](parameter);
		});
	}

	return notifications;
});
