'use strict';

define('forum/reset_code', ['alerts', 'zxcvbn'], (alerts, zxcvbn) => {
	const ResetCode = {};

	ResetCode.init = function () {
		const reset_code = ajaxify.data.code;

		const resetElement = $('#reset');
		const password = $('#password');
		const repeat = $('#repeat');

		resetElement.on('click', () => {
			try {
				utils.assertPasswordValidity(password.val(), zxcvbn);

				if (password.val() !== repeat.val()) {
					throw new Error('[[reset_password:passwords_do_not_match]]');
				}

				resetElement.prop('disabled', true).translateHtml('<i class="fa fa-spin fa-refresh"></i> [[reset_password:changing_password]]');
				socket.emit('user.reset.commit', {
					code: reset_code,
					password: password.val(),
				}, error => {
					if (error) {
						ajaxify.refresh();
						return alerts.error(error);
					}

					window.location.href = config.relative_path + '/login';
				});
			} catch (error) {
				$('#notice').removeClass('hidden');
				$('#notice strong').translateText(error.message);
			}

			return false;
		});
	};

	return ResetCode;
});
