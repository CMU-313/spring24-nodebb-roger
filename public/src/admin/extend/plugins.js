'use strict';

define('admin/extend/plugins', [
	'translator',
	'benchpress',
	'bootbox',
	'alerts',
	'jquery-ui/widgets/sortable',
], (translator, Benchpress, bootbox, alerts) => {
	const Plugins = {};
	Plugins.init = function () {
		const pluginsList = $('.plugins');
		const numberPlugins = pluginsList[0].querySelectorAll('li').length;
		let pluginID;

		if (!numberPlugins) {
			translator.translate('<li><p><i>[[admin/extend/plugins:none-found]]</i></p></li>', html => {
				pluginsList.append(html);
			});
			return;
		}

		const searchInputElement = document.querySelector('#plugin-search');
		searchInputElement.value = '';

		pluginsList.on('click', 'button[data-action="toggleActive"]', function () {
			const pluginElement = $(this).parents('li');
			pluginID = pluginElement.attr('data-plugin-id');
			const button = $('[id="' + pluginID + '"] [data-action="toggleActive"]');

			const pluginData = ajaxify.data.installed[pluginElement.attr('data-plugin-index')];

			function toggleActivate() {
				socket.emit('admin.plugins.toggleActive', pluginID, (error, status) => {
					if (error) {
						return alerts.error(error);
					}

					translator.translate('<i class="fa fa-power-off"></i> [[admin/extend/plugins:plugin-item.' + (status.active ? 'deactivate' : 'activate') + ']]', buttonText => {
						button.html(buttonText);
						button.toggleClass('btn-warning', status.active).toggleClass('btn-success', !status.active);

						// Clone it to active plugins tab
						if (status.active && $('#active [id="' + pluginID + '"]').length === 0) {
							$('#active ul').prepend(pluginElement.clone(true));
						}

						// Toggle active state in template data
						pluginData.active = !pluginData.active;

						alerts.alert({
							alert_id: 'plugin_toggled',
							title: '[[admin/extend/plugins:alert.' + (status.active ? 'enabled' : 'disabled') + ']]',
							message: '[[admin/extend/plugins:alert.' + (status.active ? 'activate-success' : 'deactivate-success') + ']]',
							type: status.active ? 'warning' : 'success',
							timeout: 5000,
							clickfn() {
								require(['admin/modules/instance'], instance => {
									instance.rebuildAndRestart();
								});
							},
						});
					});
				});
			}

			if (pluginData.license && pluginData.active !== true) {
				Benchpress.render('admin/partials/plugins/license', pluginData).then(html => {
					bootbox.dialog({
						title: '[[admin/extend/plugins:license.title]]',
						message: html,
						size: 'large',
						buttons: {
							cancel: {
								label: '[[modules:bootbox.cancel]]',
								className: 'btn-link',
							},
							save: {
								label: '[[modules:bootbox.confirm]]',
								className: 'btn-primary',
								callback: toggleActivate,
							},
						},
						onShown() {
							const saveElement = this.querySelector('button.btn-primary');
							if (saveElement) {
								saveElement.focus();
							}
						},
					});
				});
			} else {
				toggleActivate(pluginID);
			}
		});

		pluginsList.on('click', 'button[data-action="toggleInstall"]', function () {
			const button = $(this);
			button.attr('disabled', true);
			pluginID = $(this).parents('li').attr('data-plugin-id');

			if ($(this).attr('data-installed') === '1') {
				return Plugins.toggleInstall(pluginID, $(this).parents('li').attr('data-version'));
			}

			Plugins.suggest(pluginID, (error, payload) => {
				if (error) {
					bootbox.confirm(translator.compile('admin/extend/plugins:alert.suggest-error', error.status, error.responseText), confirm => {
						if (confirm) {
							Plugins.toggleInstall(pluginID, 'latest');
						} else {
							button.removeAttr('disabled');
						}
					});
					return;
				}

				if (payload.version !== 'latest') {
					Plugins.toggleInstall(pluginID, payload.version);
				} else if (payload.version === 'latest') {
					confirmInstall(pluginID, confirm => {
						if (confirm) {
							Plugins.toggleInstall(pluginID, 'latest');
						} else {
							button.removeAttr('disabled');
						}
					});
				} else {
					button.removeAttr('disabled');
				}
			});
		});

		pluginsList.on('click', 'button[data-action="upgrade"]', function () {
			const button = $(this);
			const parent = button.parents('li');
			pluginID = parent.attr('data-plugin-id');

			Plugins.suggest(pluginID, (error, payload) => {
				if (error) {
					return bootbox.alert('[[admin/extend/plugins:alert.package-manager-unreachable]]');
				}

				require(['compare-versions'], compareVersions => {
					const currentVersion = parent.find('.currentVersion').text();
					if (payload.version !== 'latest' && compareVersions.compare(payload.version, currentVersion, '>')) {
						upgrade(pluginID, button, payload.version);
					} else if (payload.version === 'latest') {
						confirmInstall(pluginID, () => {
							upgrade(pluginID, button, payload.version);
						});
					} else {
						bootbox.alert(translator.compile('admin/extend/plugins:alert.incompatible', app.config.version, payload.version));
					}
				});
			});
		});

		$(searchInputElement).on('input propertychange', function () {
			const term = $(this).val();
			$('.plugins li').each(function () {
				const pluginId = $(this).attr('data-plugin-id');
				$(this).toggleClass('hide', pluginId && !pluginId.includes(term));
			});

			const tabEls = document.querySelectorAll('.plugins .tab-pane');
			for (const tabElement of tabEls) {
				const remaining = tabElement.querySelectorAll('li:not(.hide)').length;
				const noticeElement = tabElement.querySelector('.no-plugins');
				if (noticeElement) {
					noticeElement.classList.toggle('hide', remaining !== 0);
				}
			}
		});

		$('#plugin-submit-usage').on('click', function () {
			socket.emit('admin.config.setMultiple', {
				submitPluginUsage: $(this).prop('checked') ? '1' : '0',
			}, error => {
				if (error) {
					return alerts.error(error);
				}
			});
		});

		$('#plugin-order').on('click', () => {
			$('#order-active-plugins-modal').modal('show');
			socket.emit('admin.plugins.getActive', (error, activePlugins) => {
				if (error) {
					return alerts.error(error);
				}

				let html = '';
				for (const plugin of activePlugins) {
					html += '<li class="">' + plugin + '<span class="pull-right"><i class="fa fa-chevron-up"></i><i class="fa fa-chevron-down"></i></span></li>';
				}

				if (activePlugins.length === 0) {
					translator.translate('[[admin/extend/plugins:none-active]]', text => {
						$('#order-active-plugins-modal .plugin-list').html(text).sortable();
					});
					return;
				}

				const list = $('#order-active-plugins-modal .plugin-list');
				list.html(html).sortable();

				list.find('.fa-chevron-up').on('click', function () {
					const item = $(this).parents('li');
					item.prev().before(item);
				});

				list.find('.fa-chevron-down').on('click', function () {
					const item = $(this).parents('li');
					item.next().after(item);
				});
			});
		});

		$('#save-plugin-order').on('click', () => {
			const plugins = $('#order-active-plugins-modal .plugin-list').children();
			const data = [];
			plugins.each((index, element) => {
				data.push({name: $(element).text(), order: index});
			});

			socket.emit('admin.plugins.orderActivePlugins', data, error => {
				if (error) {
					return alerts.error(error);
				}

				$('#order-active-plugins-modal').modal('hide');

				alerts.alert({
					alert_id: 'plugin_reordered',
					title: '[[admin/extend/plugins:alert.reorder]]',
					message: '[[admin/extend/plugins:alert.reorder-success]]',
					type: 'success',
					timeout: 5000,
					clickfn() {
						require(['admin/modules/instance'], instance => {
							instance.rebuildAndRestart();
						});
					},
				});
			});
		});

		populateUpgradeablePlugins();
		populateActivePlugins();
		searchInputElement.focus();
	};

	function confirmInstall(pluginID, callback) {
		bootbox.confirm(translator.compile('admin/extend/plugins:alert.possibly-incompatible', pluginID), confirm => {
			callback(confirm);
		});
	}

	function upgrade(pluginID, button, version) {
		button.attr('disabled', true).find('i').attr('class', 'fa fa-refresh fa-spin');
		socket.emit('admin.plugins.upgrade', {
			id: pluginID,
			version,
		}, (error, isActive) => {
			if (error) {
				return alerts.error(error);
			}

			const parent = button.parents('li');
			parent.find('.fa-exclamation-triangle').remove();
			parent.find('.currentVersion').text(version);
			button.remove();
			if (isActive) {
				alerts.alert({
					alert_id: 'plugin_upgraded',
					title: '[[admin/extend/plugins:alert.upgraded]]',
					message: '[[admin/extend/plugins:alert.upgrade-success]]',
					type: 'warning',
					timeout: 5000,
					clickfn() {
						require(['admin/modules/instance'], instance => {
							instance.rebuildAndRestart();
						});
					},
				});
			}
		});
	}

	Plugins.toggleInstall = function (pluginID, version, callback) {
		const button = $('li[data-plugin-id="' + pluginID + '"] button[data-action="toggleInstall"]');
		button.find('i').attr('class', 'fa fa-refresh fa-spin');

		socket.emit('admin.plugins.toggleInstall', {
			id: pluginID,
			version,
		}, function (error, pluginData) {
			if (error) {
				button.removeAttr('disabled');
				return alerts.error(error);
			}

			ajaxify.refresh();

			alerts.alert({
				alert_id: 'plugin_toggled',
				title: '[[admin/extend/plugins:alert.' + (pluginData.installed ? 'installed' : 'uninstalled') + ']]',
				message: '[[admin/extend/plugins:alert.' + (pluginData.installed ? 'install-success' : 'uninstall-success') + ']]',
				type: 'info',
				timeout: 5000,
			});

			if (typeof callback === 'function') {
				Reflect.apply(callback, this, arguments);
			}
		});
	};

	Plugins.suggest = function (pluginId, callback) {
		const nbbVersion = app.config.version.match(/^\d+\.\d+\.\d+/);
		$.ajax((app.config.registry || 'https://packages.nodebb.org') + '/api/v1/suggest', {
			type: 'GET',
			data: {
				package: pluginId,
				version: nbbVersion[0],
			},
			dataType: 'json',
		}).done(payload => {
			callback(undefined, payload);
		}).fail(callback);
	};

	function populateUpgradeablePlugins() {
		$('#installed ul li').each(function () {
			if ($(this).children('[data-action="upgrade"]').length > 0) {
				$('#upgrade ul').append($(this).clone(true));
			}
		});
	}

	function populateActivePlugins() {
		$('#installed ul li').each(function () {
			if ($(this).hasClass('active')) {
				$('#active ul').append($(this).clone(true));
			} else {
				$('#deactive ul').append($(this).clone(true));
			}
		});
	}

	return Plugins;
});
