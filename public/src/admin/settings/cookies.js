'use strict';

define('admin/settings/cookies', ['alerts'], alerts => {
	const Module = {};

	Module.init = function () {
		$('#delete-all-sessions').on('click', () => {
			socket.emit('admin.deleteAllSessions', error => {
				if (error) {
					return alerts.error(error);
				}

				window.location.href = config.relative_path + '/login';
			});
			return false;
		});
	};

	return Module;
});
