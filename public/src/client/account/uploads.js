'use strict';

define('forum/account/uploads', ['forum/account/header', 'alerts'], (header, alerts) => {
	const AccountUploads = {};

	AccountUploads.init = function () {
		header.init();

		$('[data-action="delete"]').on('click', function () {
			const element = $(this).parents('[data-name]');
			const name = element.attr('data-name');

			socket.emit('user.deleteUpload', {name, uid: ajaxify.data.uid}, error => {
				if (error) {
					return alerts.error(error);
				}

				element.remove();
			});
			return false;
		});
	};

	return AccountUploads;
});
