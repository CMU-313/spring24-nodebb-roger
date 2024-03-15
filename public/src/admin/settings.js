'use strict';

define('admin/settings', ['uploader', 'mousetrap', 'hooks', 'alerts', 'settings'], (uploader, mousetrap, hooks, alerts, settings) => {
	const Settings = {};

	Settings.populateTOC = function () {
		const headers = $('.settings-header');

		if (headers.length > 1) {
			headers.each(function () {
				const header = $(this).text();
				const anchor = header.toLowerCase().replaceAll(' ', '-').trim();

				$(this).prepend('<a name="' + anchor + '"></a>');
				$('.section-content ul').append('<li><a href="#' + anchor + '">' + header + '</a></li>');
			});

			const scrollTo = $('a[name="' + window.location.hash.replace('#', '') + '"]');
			if (scrollTo.length > 0) {
				$('html, body').animate({
					scrollTop: (scrollTo.offset().top) + 'px',
				}, 400);
			}
		} else {
			$('.content-header').parents('.row').remove();
		}
	};

	Settings.prepare = function (callback) {
		// Populate the fields on the page from the config
		const fields = $('#content [data-field]');
		const numberFields = fields.length;
		const saveButton = $('#save');
		const revertButton = $('#revert');
		let x;
		let key;
		let inputType;
		let field;

		// Handle unsaved changes
		fields.on('change', () => {
			app.flags = app.flags || {};
			app.flags._unsaved = true;
		});
		const defaultInputs = new Set(['text', 'hidden', 'password', 'textarea', 'number']);
		for (x = 0; x < numberFields; x += 1) {
			field = fields.eq(x);
			key = field.attr('data-field');
			inputType = field.attr('type');
			if (app.config.hasOwnProperty(key)) {
				if (field.is('input') && inputType === 'checkbox') {
					const checked = Number.parseInt(app.config[key], 10) === 1;
					field.prop('checked', checked);
					field.parents('.mdl-switch').toggleClass('is-checked', checked);
				} else if (field.is('textarea') || field.is('select') || (field.is('input') && defaultInputs.has(inputType))) {
					field.val(app.config[key]);
				}
			}
		}

		revertButton.off('click').on('click', () => {
			ajaxify.refresh();
		});

		saveButton.off('click').on('click', e => {
			e.preventDefault();

			const ok = settings.check(document.querySelectorAll('#content [data-field]'));
			if (!ok) {
				return;
			}

			saveFields(fields, function onFieldsSaved(error) {
				if (error) {
					return alerts.alert({
						alert_id: 'config_status',
						timeout: 2500,
						title: '[[admin/admin:changes-not-saved]]',
						message: `[[admin/admin:changes-not-saved-message, ${error.message}]]`,
						type: 'danger',
					});
				}

				app.flags._unsaved = false;

				alerts.alert({
					alert_id: 'config_status',
					timeout: 2500,
					title: '[[admin/admin:changes-saved]]',
					message: '[[admin/admin:changes-saved-message]]',
					type: 'success',
				});

				hooks.fire('action:admin.settingsSaved');
			});
		});

		mousetrap.bind('ctrl+s', event => {
			saveButton.click();
			event.preventDefault();
		});

		handleUploads();
		setupTagsInput();

		$('#clear-sitemap-cache').off('click').on('click', () => {
			socket.emit('admin.settings.clearSitemapCache', () => {
				alerts.success('Sitemap Cache Cleared!');
			});
			return false;
		});

		if (typeof callback === 'function') {
			callback();
		}

		setTimeout(() => {
			hooks.fire('action:admin.settingsLoaded');
		}, 0);
	};

	function handleUploads() {
		$('#content input[data-action="upload"]').each(function () {
			const uploadButton = $(this);
			uploadButton.on('click', () => {
				uploader.show({
					title: uploadButton.attr('data-title'),
					description: uploadButton.attr('data-description'),
					route: uploadButton.attr('data-route'),
					params: {},
					showHelp: uploadButton.attr('data-help') ? uploadButton.attr('data-help') === 1 : undefined,
					accept: uploadButton.attr('data-accept'),
				}, image => {
					$('#' + uploadButton.attr('data-target')).val(image);
				});
			});
		});
	}

	function setupTagsInput() {
		$('[data-field-type="tagsinput"]').tagsinput({
			confirmKeys: [13, 44],
			trimValue: true,
		});
		app.flags._unsaved = false;
	}

	Settings.remove = function (key) {
		socket.emit('admin.config.remove', key);
	};

	function saveFields(fields, callback) {
		const data = {};

		fields.each(function () {
			const field = $(this);
			const key = field.attr('data-field');
			let value;
			let inputType;

			if (field.is('input')) {
				inputType = field.attr('type');
				switch (inputType) {
					case 'text':
					case 'password':
					case 'hidden':
					case 'textarea':
					case 'number': {
						value = field.val();
						break;
					}

					case 'checkbox': {
						value = field.prop('checked') ? '1' : '0';
						break;
					}
				}
			} else if (field.is('textarea') || field.is('select')) {
				value = field.val();
			}

			data[key] = value;
		});

		socket.emit('admin.config.setMultiple', data, error => {
			if (error) {
				return callback(error);
			}

			for (const field in data) {
				if (data.hasOwnProperty(field)) {
					app.config[field] = data[field];
				}
			}

			callback();
		});
	}

	return Settings;
});
