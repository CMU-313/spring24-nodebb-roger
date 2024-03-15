'use strict';

define('sort', ['components', 'api'], (components, api) => {
	const module = {};

	module.handleSort = function (field, gotoOnSave) {
		const threadSort = components.get('thread/sort');
		threadSort.find('i').removeClass('fa-check');
		const currentSetting = threadSort.find('a[data-sort="' + config[field] + '"]');
		currentSetting.find('i').addClass('fa-check');

		$('body')
			.off('click', '[component="thread/sort"] a')
			.on('click', '[component="thread/sort"] a', function () {
				function refresh(newSetting, parameters) {
					config[field] = newSetting;
					const qs = decodeURIComponent($.param(parameters));
					ajaxify.go(gotoOnSave + (qs ? '?' + qs : ''));
				}

				const newSetting = $(this).attr('data-sort');
				if (app.user.uid) {
					const payload = {settings: {}};
					payload.settings[field] = newSetting;
					api.put(`/users/${app.user.uid}/settings`, payload).then(() => {
						// Yes, this is normal. If you are logged in, sort is not
						// added to qs since it's saved to user settings
						refresh(newSetting, utils.params());
					});
				} else {
					const urlParameters = utils.params();
					urlParameters.sort = newSetting;
					refresh(newSetting, urlParameters);
				}
			});
	};

	return module;
});
