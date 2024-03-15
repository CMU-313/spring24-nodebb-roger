'use strict';

define('admin/settings/api', ['settings', 'alerts', 'hooks'], (settings, alerts, hooks) => {
	const ACP = {};

	ACP.init = function () {
		settings.load('core.api', $('.core-api-settings'));
		$('#save').on('click', saveSettings);

		hooks.on('action:settings.sorted-list.itemLoaded', ({element}) => {
			element.addEventListener('click', event => {
				if (event.target.closest('input[readonly]')) {
					// Select entire input text
					event.target.selectionStart = 0;
					event.target.selectionEnd = event.target.value.length;
				}
			});
		});
	};

	function saveSettings() {
		settings.save('core.api', $('.core-api-settings'), () => {
			alerts.alert({
				type: 'success',
				alert_id: 'core.api-saved',
				title: 'Settings Saved',
				timeout: 5000,
			});
			ajaxify.refresh();
		});
	}

	return ACP;
});
