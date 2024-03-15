'use strict';

define('logout', ['hooks'], hooks => function logout(redirect) {
	redirect = redirect === undefined ? true : redirect;
	hooks.fire('action:app.logout');

	$.ajax(config.relative_path + '/logout', {
		type: 'POST',
		headers: {
			'x-csrf-token': config.csrf_token,
		},
		beforeSend() {
			app.flags._logout = true;
		},
		success(data) {
			hooks.fire('action:app.loggedOut', data);
			if (redirect) {
				if (data.next) {
					window.location.href = data.next;
				} else {
					window.location.reload();
				}
			}
		},
	});
});
