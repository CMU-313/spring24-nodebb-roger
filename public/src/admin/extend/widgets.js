'use strict';

define('admin/extend/widgets', [
	'bootbox',
	'alerts',
	'jquery-ui/widgets/sortable',
	'jquery-ui/widgets/draggable',
	'jquery-ui/widgets/droppable',
	'jquery-ui/widgets/datepicker',
], (bootbox, alerts) => {
	const Widgets = {};

	Widgets.init = function () {
		$('#widgets .nav-pills .dropdown-menu a').on('click', function (event) {
			const $this = $(this);
			$('#widgets .tab-pane').removeClass('active');
			const templateName = $this.attr('data-template');
			$('#widgets .tab-pane[data-template="' + templateName + '"]').addClass('active');
			$('#widgets .selected-template').text(templateName);
			$('#widgets .nav-pills .dropdown').trigger('click');
			event.preventDefault();
			return false;
		});

		$('#widget-selector').on('change', function () {
			$('.available-widgets [data-widget]').addClass('hide');
			$('.available-widgets [data-widget="' + $(this).val() + '"]').removeClass('hide');
		});

		$('#widget-selector').trigger('change');

		loadWidgetData();
		setupCloneButton();
	};

	function prepareWidgets() {
		$('[data-location="drafts"]').insertAfter($('[data-location="drafts"]').closest('.tab-content'));

		$('#widgets .available-widgets .widget-panel').draggable({
			helper(e) {
				return $(e.target).parents('.widget-panel').clone();
			},
			distance: 10,
			connectToSortable: '.widget-area',
		});

		$('#widgets .available-containers .containers > [data-container-html]')
			.draggable({
				helper(e) {
					let target = $(e.target);
					target = target.attr('data-container-html') ? target : target.parents('[data-container-html]');

					return target.clone().addClass('block').width(target.width()).css('opacity', '0.5');
				},
				distance: 10,
			})
			.each(function () {
				$(this).attr('data-container-html', $(this).attr('data-container-html').replaceAll(/\\{([\s\S]*?)\\}/g, '{$1}'));
			});

		$('#widgets .widget-area').sortable({
			update(event, ui) {
				createDatePicker(ui.item);
				appendToggle(ui.item);
			},
			connectWith: 'div',
		}).on('click', '.delete-widget', function () {
			const panel = $(this).parents('.widget-panel');

			bootbox.confirm('[[admin/extend/widgets:alert.confirm-delete]]', confirm => {
				if (confirm) {
					panel.remove();
				}
			});
		}).on('mouseup', '> .panel > .panel-heading', function (event) {
			if (!($(this).parent().is('.ui-sortable-helper') || $(event.target).closest('.delete-widget').length > 0)) {
				$(this).parent().children('.panel-body').toggleClass('hidden');
			}
		});

		$('#save').on('click', saveWidgets);

		function saveWidgets() {
			const saveData = [];
			$('#widgets [data-template][data-location]').each((i, element) => {
				element = $(element);

				const template = element.attr('data-template');
				const location = element.attr('data-location');
				const area = element.children('.widget-area');
				const widgets = [];

				area.find('.widget-panel[data-widget]').each(function () {
					const widgetData = {};
					const data = $(this).find('form').serializeArray();

					for (const d in data) {
						if (data.hasOwnProperty(d) && data[d].name) {
							if (widgetData[data[d].name]) {
								if (!Array.isArray(widgetData[data[d].name])) {
									widgetData[data[d].name] = [
										widgetData[data[d].name],
									];
								}

								widgetData[data[d].name].push(data[d].value);
							} else {
								widgetData[data[d].name] = data[d].value;
							}
						}
					}

					widgets.push({
						widget: $(this).attr('data-widget'),
						data: widgetData,
					});
				});

				saveData.push({
					template,
					location,
					widgets,
				});
			});

			socket.emit('admin.widgets.set', saveData, error => {
				if (error) {
					alerts.error(error);
				}

				alerts.alert({
					alert_id: 'admin:widgets',
					type: 'success',
					title: '[[admin/extend/widgets:alert.updated]]',
					message: '[[admin/extend/widgets:alert.update-success]]',
					timeout: 2500,
				});
			});
		}

		$('.color-selector').on('click', '.btn', function () {
			const button = $(this);
			const selector = button.parents('.color-selector');
			const container = selector.parents('[data-container-html]');
			const classList = [];

			selector.children().each(function () {
				classList.push($(this).attr('data-class'));
			});

			container
				.removeClass(classList.join(' '))
				.addClass(button.attr('data-class'));

			container.attr('data-container-html', container.attr('data-container-html')
				.replace(/class="[a-zA-Z\d-\s]+"/, 'class="' + container[0].className.replace(' pointer ui-draggable ui-draggable-handle', '') + '"'));
		});
	}

	function createDatePicker(element) {
		const currentYear = new Date().getFullYear();
		element.find('.date-selector').datepicker({
			changeMonth: true,
			changeYear: true,
			yearRange: currentYear + ':' + (currentYear + 100),
		});
	}

	function appendToggle(element) {
		if (!element.hasClass('block')) {
			element.addClass('block').css('width', '').css('height', '')
				.droppable({
					accept: '[data-container-html]',
					drop(event, ui) {
						const element = $(this);

						element.find('.panel-body .container-html').val(ui.draggable.attr('data-container-html'));
						element.find('.panel-body').removeClass('hidden');
					},
					hoverClass: 'panel-info',
				})
				.children('.panel-heading')
				.append('<div class="pull-right pointer"><span class="delete-widget"><i class="fa fa-times-circle"></i></span></div><div class="pull-left pointer"><span class="toggle-widget"><i class="fa fa-chevron-circle-down"></i></span>&nbsp;</div>')
				.children('small')
				.html('');
		}
	}

	function loadWidgetData() {
		function populateWidget(widget, data) {
			if (data.title) {
				const title = widget.find('.panel-heading strong');
				title.text(title.text() + ' - ' + data.title);
			}

			widget.find('input, textarea, select').each(function () {
				const input = $(this);
				const value = data[input.attr('name')];

				if (input.attr('type') === 'checkbox') {
					input.prop('checked', Boolean(value)).trigger('change');
				} else {
					input.val(value);
				}
			});

			return widget;
		}

		$.get(config.relative_path + '/api/admin/extend/widgets', data => {
			const areas = data.areas;

			for (const area of areas) {
				const widgetArea = $('#widgets .area[data-template="' + area.template + '"][data-location="' + area.location + '"]').find('.widget-area');

				widgetArea.html('');

				for (let k = 0; k < area.data.length; k += 1) {
					const widgetData = area.data[k];
					const widgetElement = $('.available-widgets [data-widget="' + widgetData.widget + '"]').clone(true).removeClass('hide');

					widgetArea.append(populateWidget(widgetElement, widgetData.data));
					appendToggle(widgetElement);
					createDatePicker(widgetElement);
				}
			}

			prepareWidgets();
		});
	}

	function setupCloneButton() {
		const clone = $('[component="clone"]');
		const cloneButton = $('[component="clone/button"]');

		clone.find('.dropdown-menu li').on('click', function () {
			const template = $(this).find('a').text();
			cloneButton.translateHtml('[[admin/extend/widgets:clone-from]] <strong>' + template + '</strong>');
			cloneButton.attr('data-template', template);
		});

		cloneButton.on('click', () => {
			const template = cloneButton.attr('data-template');
			if (!template) {
				return alerts.error('[[admin/extend/widgets:error.select-clone]]');
			}

			const currentTemplate = $('#active-widgets .active.tab-pane[data-template] .area');
			const templateToClone = $('#active-widgets .tab-pane[data-template="' + template + '"] .area');

			const currentAreas = currentTemplate.map(function () {
				return $(this).attr('data-location');
			}).get();

			const areasToClone = templateToClone.map(function () {
				const location = $(this).attr('data-location');
				return currentAreas.includes(location) ? location : undefined;
			}).get().filter(Boolean);

			function clone(location) {
				$('#active-widgets .tab-pane[data-template="' + template + '"] [data-location="' + location + '"]').each(function () {
					$(this).find('[data-widget]').each(function () {
						const widget = $(this).clone(true);
						$('#active-widgets .active.tab-pane[data-template]:not([data-template="global"]) [data-location="' + location + '"] .widget-area').append(widget);
					});
				});
			}

			for (let i = 0, ii = areasToClone.length; i < ii; i++) {
				const location = areasToClone[i];
				clone(location);
			}

			alerts.success('[[admin/extend/widgets:alert.clone-success]]');
		});
	}

	return Widgets;
});
