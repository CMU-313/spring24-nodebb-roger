'use strict';

define('forum/register', [
	'translator', 'slugify', 'api', 'bootbox', 'forum/login', 'zxcvbn', 'jquery-form',
], (translator, slugify, api, bootbox, Login, zxcvbn) => {
	const Register = {};
	let validationError = false;
	const successIcon = '';

	Register.init = function () {
		const username = $('#username');
		const password = $('#password');
		const password_confirm = $('#password-confirm');
		const register = $('#register');

		handleLanguageOverride();

		$('#content #noscript').val('false');

		const query = utils.params();
		if (query.token) {
			$('#token').val(query.token);
		}

		// Update the "others can mention you via" text
		username.on('keyup', function () {
			$('#yourUsername').text(this.value.length > 0 ? slugify(this.value) : 'username');
		});

		username.on('blur', () => {
			if (username.val().length > 0) {
				validateUsername(username.val());
			}
		});

		password.on('blur', () => {
			if (password.val().length > 0) {
				validatePassword(password.val(), password_confirm.val());
			}
		});

		password_confirm.on('blur', () => {
			if (password_confirm.val().length > 0) {
				validatePasswordConfirm(password.val(), password_confirm.val());
			}
		});

		function validateForm(callback) {
			validationError = false;
			validatePassword(password.val(), password_confirm.val());
			validatePasswordConfirm(password.val(), password_confirm.val());
			validateUsername(username.val(), callback);
		}

		// Guard against caps lock
		Login.capsLockCheck(document.querySelector('#password'), document.querySelector('#caps-lock-warning'));

		register.on('click', function (e) {
			const registerButton = $(this);
			const errorElement = $('#register-error-notify');
			errorElement.addClass('hidden');
			e.preventDefault();
			validateForm(() => {
				if (validationError) {
					return;
				}

				registerButton.addClass('disabled');

				registerButton.parents('form').ajaxSubmit({
					headers: {
						'x-csrf-token': config.csrf_token,
					},
					success(data) {
						registerButton.removeClass('disabled');
						if (!data) {
							return;
						}

						if (data.next) {
							const pathname = utils.urlToLocation(data.next).pathname;

							const parameters = utils.params({url: data.next});
							parameters.registered = true;
							const qs = decodeURIComponent($.param(parameters));

							window.location.href = pathname + '?' + qs;
						} else if (data.message) {
							translator.translate(data.message, message => {
								bootbox.alert(message);
								ajaxify.go('/');
							});
						}
					},
					error(data) {
						translator.translate(data.responseText, config.defaultLang, translated => {
							if (data.status === 403 && data.responseText === 'Forbidden') {
								window.location.href = config.relative_path + '/register?error=csrf-invalid';
							} else {
								errorElement.find('p').text(translated);
								errorElement.removeClass('hidden');
								registerButton.removeClass('disabled');
							}
						});
					},
				});
			});
		});

		// Set initial focus
		$('#username').focus();
	};

	function validateUsername(username, callback) {
		callback ||= function () {};

		const username_notify = $('#username-notify');
		const userslug = slugify(username);
		if (username.length < ajaxify.data.minimumUsernameLength
            || userslug.length < ajaxify.data.minimumUsernameLength) {
			showError(username_notify, '[[error:username-too-short]]');
		} else if (username.length > ajaxify.data.maximumUsernameLength) {
			showError(username_notify, '[[error:username-too-long]]');
		} else if (!utils.isUserNameValid(username) || !userslug) {
			showError(username_notify, '[[error:invalid-username]]');
		} else {
			Promise.allSettled([
				api.head(`/users/bySlug/${username}`, {}),
				api.head(`/groups/${username}`, {}),
			]).then(results => {
				if (results.every(object => object.status === 'rejected')) {
					showSuccess(username_notify, successIcon);
				} else {
					showError(username_notify, '[[error:username-taken]]');
				}

				callback();
			});
		}
	}

	function validatePassword(password, password_confirm) {
		const password_notify = $('#password-notify');
		const password_confirm_notify = $('#password-confirm-notify');

		try {
			utils.assertPasswordValidity(password, zxcvbn);

			if (password === $('#username').val()) {
				throw new Error('[[user:password_same_as_username]]');
			}

			showSuccess(password_notify, successIcon);
		} catch (error) {
			showError(password_notify, error.message);
		}

		if (password !== password_confirm && password_confirm !== '') {
			showError(password_confirm_notify, '[[user:change_password_error_match]]');
		}
	}

	function validatePasswordConfirm(password, password_confirm) {
		const password_notify = $('#password-notify');
		const password_confirm_notify = $('#password-confirm-notify');

		if (!password || password_notify.hasClass('alert-error')) {
			return;
		}

		if (password === password_confirm) {
			showSuccess(password_confirm_notify, successIcon);
		} else {
			showError(password_confirm_notify, '[[user:change_password_error_match]]');
		}
	}

	function showError(element, message) {
		translator.translate(message, message_ => {
			element.html(message_);
			element.parent()
				.removeClass('register-success')
				.addClass('register-danger');
			element.show();
		});
		validationError = true;
	}

	function showSuccess(element, message) {
		translator.translate(message, message_ => {
			element.html(message_);
			element.parent()
				.removeClass('register-danger')
				.addClass('register-success');
			element.show();
		});
	}

	function handleLanguageOverride() {
		if (!app.user.uid && config.defaultLang !== config.userLang) {
			const formElement = $('[component="register/local"]');
			const langElement = $('<input type="hidden" name="userLang" value="' + config.userLang + '" />');

			formElement.append(langElement);
		}
	}

	return Register;
});
