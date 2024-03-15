'use strict';

define('forum/account/consent', ['forum/account/header', 'alerts', 'api'], (header, alerts, api) => {
	const Consent = {};

	Consent.init = function () {
		header.init();

		$('[data-action="consent"]').on('click', () => {
			socket.emit('user.gdpr.consent', {}, error => {
				if (error) {
					return alerts.error(error);
				}

				ajaxify.refresh();
			});
		});

		handleExport($('[data-action="export-profile"]'), 'profile', '[[user:consent.export-profile-success]]');
		handleExport($('[data-action="export-posts"]'), 'posts', '[[user:consent.export-posts-success]]');
		handleExport($('[data-action="export-uploads"]'), 'uploads', '[[user:consent.export-uploads-success]]');

		function handleExport(element, type, success) {
			element.on('click', () => {
				api.post(`/users/${ajaxify.data.uid}/exports/${type}`).then(() => {
					alerts.success(success);
				}).catch(alerts.error);
			});
		}
	};

	return Consent;
});
