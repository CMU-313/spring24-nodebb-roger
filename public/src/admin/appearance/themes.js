'use strict';

define('admin/appearance/themes', ['bootbox', 'translator', 'alerts'], (bootbox, translator, alerts) => {
	const Themes = {};

	Themes.init = function () {
		$('#installed_themes').on('click', e => {
			const target = $(e.target);
			const action = target.attr('data-action');

			if (action && action === 'use') {
				const parentElement = target.parents('[data-theme]');
				const themeType = parentElement.attr('data-type');
				const cssSource = parentElement.attr('data-css');
				const themeId = parentElement.attr('data-theme');

				if (config['theme:id'] === themeId) {
					return;
				}

				socket.emit('admin.themes.set', {
					type: themeType,
					id: themeId,
					src: cssSource,
				}, error => {
					if (error) {
						return alerts.error(error);
					}

					config['theme:id'] = themeId;
					highlightSelectedTheme(themeId);

					alerts.alert({
						alert_id: 'admin:theme',
						type: 'info',
						title: '[[admin/appearance/themes:theme-changed]]',
						message: '[[admin/appearance/themes:restart-to-activate]]',
						timeout: 5000,
						clickfn() {
							require(['admin/modules/instance'], instance => {
								instance.rebuildAndRestart();
							});
						},
					});
				});
			}
		});

		$('#revert_theme').on('click', () => {
			if (config['theme:id'] === 'nodebb-theme-persona') {
				return;
			}

			bootbox.confirm('[[admin/appearance/themes:revert-confirm]]', confirm => {
				if (confirm) {
					socket.emit('admin.themes.set', {
						type: 'local',
						id: 'nodebb-theme-persona',
					}, error => {
						if (error) {
							return alerts.error(error);
						}

						config['theme:id'] = 'nodebb-theme-persona';
						highlightSelectedTheme('nodebb-theme-persona');
						alerts.alert({
							alert_id: 'admin:theme',
							type: 'success',
							title: '[[admin/appearance/themes:theme-changed]]',
							message: '[[admin/appearance/themes:revert-success]]',
							timeout: 3500,
						});
					});
				}
			});
		});

		socket.emit('admin.themes.getInstalled', (error, themes) => {
			if (error) {
				return alerts.error(error);
			}

			const instListElement = $('#installed_themes');

			if (themes.length === 0) {
				instListElement.append($('<li/ >').addClass('no-themes').translateHtml('[[admin/appearance/themes:no-themes]]'));
			} else {
				app.parseAndTranslate('admin/partials/theme_list', {
					themes,
				}, html => {
					instListElement.html(html);
					highlightSelectedTheme(config['theme:id']);
				});
			}
		});
	};

	function highlightSelectedTheme(themeId) {
		translator.translate('[[admin/appearance/themes:select-theme]]  ||  [[admin/appearance/themes:current-theme]]', text => {
			text = text.split('  ||  ');
			const select = text[0];
			const current = text[1];

			$('[data-theme]')
				.removeClass('selected')
				.find('[data-action="use"]')
				.html(select)
				.removeClass('btn-success')
				.addClass('btn-primary');

			$('[data-theme="' + themeId + '"]')
				.addClass('selected')
				.find('[data-action="use"]')
				.html(current)
				.removeClass('btn-primary')
				.addClass('btn-success');
		});
	}

	return Themes;
});
