'use strict';

define('admin/advanced/cache', ['alerts'], alerts => {
	const Cache = {};
	Cache.init = function () {
		require(['admin/settings'], Settings => {
			Settings.prepare();
		});

		$('.clear').on('click', function () {
			const name = $(this).attr('data-name');
			socket.emit('admin.cache.clear', {name}, error => {
				if (error) {
					return alerts.error(error);
				}

				ajaxify.refresh();
			});
		});

		$('.checkbox').on('change', function () {
			const input = $(this).find('input');
			const flag = input.is(':checked');
			const name = $(this).attr('data-name');
			socket.emit('admin.cache.toggle', {name, enabled: flag}, error => {
				if (error) {
					return alerts.error(error);
				}
			});
		});
	};

	return Cache;
});
