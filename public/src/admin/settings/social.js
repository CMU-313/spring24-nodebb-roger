'use strict';

define('admin/settings/social', ['alerts'], alerts => {
	const social = {};

	social.init = function () {
		$('#save').on('click', () => {
			const networks = [];
			$('#postSharingNetworks input[type="checkbox"]').each(function () {
				if ($(this).prop('checked')) {
					networks.push($(this).attr('id'));
				}
			});

			socket.emit('admin.social.savePostSharingNetworks', networks, error => {
				if (error) {
					return alerts.error(error);
				}

				alerts.success('[[admin/settings/social:save-success]]');
			});
		});
	};

	return social;
});
