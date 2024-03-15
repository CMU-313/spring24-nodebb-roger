'use strict';

define('forum/account/settings', [
	'forum/account/header', 'components', 'translator', 'api', 'alerts',
], (header, components, translator, api, alerts) => {
	const AccountSettings = {};

	// If page skin is changed but not saved, switch the skin back
	$(window).on('action:ajaxify.start', () => {
		if (ajaxify.data.template.name === 'account/settings' && $('#bootswatchSkin').length > 0 && $('#bootswatchSkin').val() !== config.bootswatchSkin) {
			reskin(config.bootswatchSkin);
		}
	});

	AccountSettings.init = function () {
		header.init();

		$('#submitBtn').on('click', () => {
			const settings = loadSettings();

			if (settings.homePageRoute === 'custom' && settings.homePageCustom) {
				$.get(config.relative_path + '/' + settings.homePageCustom, () => {
					saveSettings(settings);
				}).fail(() => {
					alerts.error('[[error:invalid-home-page-route]]');
				});
			} else {
				saveSettings(settings);
			}

			return false;
		});

		$('#bootswatchSkin').on('change', function () {
			reskin($(this).val());
		});

		$('[data-property="homePageRoute"]').on('change', toggleCustomRoute);

		toggleCustomRoute();

		components.get('user/sessions').find('.timeago').timeago();
	};

	function loadSettings() {
		const settings = {};

		$('.account').find('input, textarea, select').each((id, input) => {
			input = $(input);
			const setting = input.attr('data-property');
			if (input.is('select')) {
				settings[setting] = input.val();
				return;
			}

			switch (input.attr('type')) {
				case 'checkbox': {
					settings[setting] = input.is(':checked') ? 1 : 0;
					break;
				}

				default: {
					settings[setting] = input.val();
					break;
				}
			}
		});

		return settings;
	}

	function saveSettings(settings) {
		api.put(`/users/${ajaxify.data.uid}/settings`, {settings}).then(newSettings => {
			alerts.success('[[success:settings-saved]]');
			let languageChanged = false;
			for (const key in newSettings) {
				if (newSettings.hasOwnProperty(key)) {
					if (key === 'userLang' && config.userLang !== newSettings.userLang) {
						languageChanged = true;
					}

					if (config.hasOwnProperty(key)) {
						config[key] = newSettings[key];
					}
				}
			}

			if (languageChanged && Number.parseInt(app.user.uid, 10) === Number.parseInt(ajaxify.data.theirid, 10)) {
				translator.translate('[[language:dir]]', config.userLang, translated => {
					const htmlElement = $('html');
					htmlElement.attr('data-dir', translated);
					htmlElement.css('direction', translated);
				});

				translator.switchTimeagoLanguage(utils.userLangToTimeagoCode(config.userLang), () => {
					overrides.overrideTimeago();
					ajaxify.refresh();
				});
			}
		});
	}

	function toggleCustomRoute() {
		if ($('[data-property="homePageRoute"]').val() === 'custom') {
			$('#homePageCustom').show();
		} else {
			$('#homePageCustom').hide();
			$('[data-property="homePageCustom"]').val('');
		}
	}

	function reskin(skinName) {
		const clientElement = Array.prototype.filter.call(document.querySelectorAll('link[rel="stylesheet"]'), element => element.href.includes(config.relative_path + '/assets/client'))[0] || null;
		if (!clientElement) {
			return;
		}

		const currentSkinClassName = $('body').attr('class').split(/\s+/).filter(className => className.startsWith('skin-'));
		if (!currentSkinClassName[0]) {
			return;
		}

		let currentSkin = currentSkinClassName[0].slice(5);
		currentSkin = currentSkin === 'noskin' ? '' : currentSkin;

		// Stop execution if skin didn't change
		if (skinName === currentSkin) {
			return;
		}

		const linkElement = document.createElement('link');
		linkElement.rel = 'stylesheet';
		linkElement.type = 'text/css';
		linkElement.href = config.relative_path + '/assets/client' + (skinName ? '-' + skinName : '') + '.css';
		linkElement.addEventListener('load', () => {
			clientElement.remove();

			// Update body class with proper skin name
			$('body').removeClass(currentSkinClassName.join(' '));
			$('body').addClass('skin-' + (skinName || 'noskin'));
		});

		document.head.append(linkElement);
	}

	return AccountSettings;
});
