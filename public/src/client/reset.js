'use strict';

define('forum/reset', ['alerts'], alerts => {
	const ResetPassword = {};

	ResetPassword.init = function () {
		const inputElement = $('#email');
		const errorElement = $('#error');
		const successElement = $('#success');

		$('#reset').on('click', () => {
			if (inputElement.val() && inputElement.val().includes('@')) {
				socket.emit('user.reset.send', inputElement.val(), error => {
					if (error) {
						return alerts.error(error);
					}

					errorElement.addClass('hide');
					successElement.removeClass('hide');
					inputElement.val('');
				});
			} else {
				successElement.addClass('hide');
				errorElement.removeClass('hide');
			}

			return false;
		});
	};

	return ResetPassword;
});
