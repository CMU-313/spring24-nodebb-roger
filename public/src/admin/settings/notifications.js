'use strict';

define('admin/settings/notifications', [
	'autocomplete',
], autocomplete => {
	const Notifications = {};

	Notifications.init = function () {
		const searchInput = $('[data-field="welcomeUid"]');
		autocomplete.user(searchInput, (event, selected) => {
			setTimeout(() => {
				searchInput.val(selected.item.user.uid);
			});
		});
	};

	return Notifications;
});
