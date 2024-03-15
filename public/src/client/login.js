'use strict';

define('forum/login', ['hooks', 'translator', 'jquery-form'], (hooks, translator) => {
	const Login = {
		_capsState: false,
	};

	Login.init = function () {
		const errorElement = $('#login-error-notify');
		const submitElement = $('#login');
		const formElement = $('#login-form');

		submitElement.on('click', e => {
			e.preventDefault();

			if (!$('#username').val() || !$('#password').val()) {
				errorElement.find('p').translateText('[[error:invalid-username-or-password]]');
				errorElement.show();
			} else {
				errorElement.hide();

				if (submitElement.hasClass('disabled')) {
					return;
				}

				submitElement.addClass('disabled');

				hooks.fire('action:app.login');
				formElement.ajaxSubmit({
					headers: {
						'x-csrf-token': config.csrf_token,
					},
					beforeSend() {
						app.flags._login = true;
					},
					success(data) {
						hooks.fire('action:app.loggedIn', data);
						const pathname = utils.urlToLocation(data.next).pathname;
						const parameters = utils.params({url: data.next});
						parameters.loggedin = true;
						delete parameters.register; // Clear register message incase it exists
						const qs = decodeURIComponent($.param(parameters));

						window.location.href = pathname + '?' + qs;
					},
					error(data) {
						let message = data.responseText;
						const errorInfo = data.responseJSON;
						if (data.status === 403 && data.responseText === 'Forbidden') {
							window.location.href = config.relative_path + '/login?error=csrf-invalid';
						} else if (errorInfo && errorInfo.hasOwnProperty('banned_until')) {
							message = errorInfo.banned_until
								? translator.compile('error:user-banned-reason-until', (new Date(errorInfo.banned_until).toLocaleString()), errorInfo.reason)
								: '[[error:user-banned-reason, ' + errorInfo.reason + ']]';
						}

						errorElement.find('p').translateText(message);
						errorElement.show();
						submitElement.removeClass('disabled');

						// Select the entire password if that field has focus
						if ($('#password:focus').length > 0) {
							$('#password').select();
						}
					},
				});
			}
		});

		// Guard against caps lock
		Login.capsLockCheck(document.querySelector('#password'), document.querySelector('#caps-lock-warning'));

		$('#login-error-notify button').on('click', e => {
			e.preventDefault();
			errorElement.hide();
			return false;
		});

		if ($('#content #username').val()) {
			$('#content #password').val('').focus();
		} else {
			$('#content #username').focus();
		}

		$('#content #noscript').val('false');
	};

	Login.capsLockCheck = (inputElement, warningElement) => {
		const toggle = state => {
			warningElement.classList[state ? 'remove' : 'add']('hidden');
			warningElement.parentNode.classList[state ? 'add' : 'remove']('has-warning');
		};

		if (!inputElement) {
			return;
		}

		inputElement.addEventListener('keyup', e => {
			if (Login._capsState && e.key === 'CapsLock') {
				toggle(false);
				Login._capsState = !Login._capsState;
				return;
			}

			Login._capsState = e.getModifierState && e.getModifierState('CapsLock');
			toggle(Login._capsState);
		});

		if (Login._capsState) {
			toggle(true);
		}
	};

	return Login;
});
