'use strict';

define('forum/account/sessions', ['forum/account/header', 'components', 'api', 'alerts'], (header, components, api, alerts) => {
	const Sessions = {};

	Sessions.init = function () {
		header.init();
		Sessions.prepareSessionRevocation();
	};

	Sessions.prepareSessionRevocation = function () {
		components.get('user/sessions').on('click', '[data-action]', function () {
			const parentElement = $(this).parents('[data-uuid]');
			const uuid = parentElement.attr('data-uuid');

			if (uuid) {
				// This is done via DELETE because a user shouldn't be able to
				// revoke his own session! This is what logout is for
				api.del(`/users/${ajaxify.data.uid}/sessions/${uuid}`, {}).then(() => {
					parentElement.remove();
				}).catch(error => {
					try {
						const errorObject = JSON.parse(error.responseText);
						if (errorObject.loggedIn === false) {
							window.location.href = config.relative_path + '/login?error=' + errorObject.title;
						}

						alerts.error(errorObject.title);
					} catch {
						alerts.error('[[error:invalid-data]]');
					}
				});
			}
		});
	};

	return Sessions;
});
