'use strict';

define('admin/settings/navigation', [
	'translator',
	'iconSelect',
	'benchpress',
	'alerts',
	'jquery-ui/widgets/draggable',
	'jquery-ui/widgets/droppable',
	'jquery-ui/widgets/sortable',
], (translator, iconSelect, Benchpress, alerts) => {
	const navigation = {};
	let available;

	navigation.init = function () {
		available = ajaxify.data.available;

		$('#available').find('li .drag-item').draggable({
			connectToSortable: '#active-navigation',
			helper: 'clone',
			distance: 10,
			stop: drop,
		});

		$('#active-navigation').sortable().droppable({
			accept: $('#available li .drag-item'),
		});

		$('#enabled').on('click', '.iconPicker', function () {
			const iconElement = $(this).find('i');
			iconSelect.init(iconElement, element => {
				const newIconClass = element.attr('value');
				const index = iconElement.parents('[data-index]').attr('data-index');
				$('#active-navigation [data-index="' + index + '"] i.nav-icon').attr('class', 'fa fa-fw ' + newIconClass);
				iconElement.siblings('[name="iconClass"]').val(newIconClass);
				iconElement.siblings('.change-icon-link').toggleClass('hidden', Boolean(newIconClass));
			});
		});

		$('#enabled').on('click', '[name="dropdown"]', function () {
			const element = $(this);
			const index = element.parents('[data-index]').attr('data-index');
			$('#active-navigation [data-index="' + index + '"] i.dropdown-icon').toggleClass('hidden', !element.is(':checked'));
		});

		$('#active-navigation').on('click', 'li', onSelect);

		$('#enabled')
			.on('click', '.delete', remove)
			.on('click', '.toggle', toggle);

		$('#save').on('click', save);
	};

	function onSelect() {
		const clickedIndex = $(this).attr('data-index');
		$('#active-navigation li').removeClass('active');
		$(this).addClass('active');

		const detailsForm = $('#enabled').children('[data-index="' + clickedIndex + '"]');
		$('#enabled li').addClass('hidden');

		if (detailsForm.length > 0) {
			detailsForm.removeClass('hidden');
		}

		return false;
	}

	function drop(event, ui) {
		const id = ui.helper.attr('data-id');
		const element = $('#active-navigation [data-id="' + id + '"]');
		const data = id === 'custom' ? {
			iconClass: 'fa-navicon',
			groups: available[0].groups,
			enabled: true,
		} : available[id];

		data.index = (Number.parseInt($('#enabled').children().last().attr('data-index'), 10) || 0) + 1;
		data.title = translator.escape(data.title);
		data.text = translator.escape(data.text);
		data.groups = ajaxify.data.groups;
		Benchpress.parse('admin/settings/navigation', 'navigation', {navigation: [data]}, li => {
			translator.translate(li, li => {
				li = $(translator.unescape(li));
				element.after(li);
				element.remove();
			});
		});
		Benchpress.parse('admin/settings/navigation', 'enabled', {enabled: [data]}, li => {
			translator.translate(li, li => {
				li = $(translator.unescape(li));
				$('#enabled').append(li);
				componentHandler.upgradeDom();
			});
		});
	}

	function save() {
		const nav = [];

		const indices = [];
		$('#active-navigation li').each(function () {
			indices.push($(this).attr('data-index'));
		});

		for (const index of indices) {
			const element = $('#enabled').children('[data-index="' + index + '"]');
			const form = element.find('form').serializeArray();
			const data = {};

			for (const input of form) {
				if (data[input.name]) {
					if (!Array.isArray(data[input.name])) {
						data[input.name] = [
							data[input.name],
						];
					}

					data[input.name].push(input.value);
				} else {
					data[input.name] = input.value;
				}
			}

			nav.push(data);
		}

		socket.emit('admin.navigation.save', nav, error => {
			if (error) {
				alerts.error(error);
			} else {
				alerts.success('Successfully saved navigation');
			}
		});
	}

	function remove() {
		const index = $(this).parents('[data-index]').attr('data-index');
		$('#active-navigation [data-index="' + index + '"]').remove();
		$('#enabled [data-index="' + index + '"]').remove();
		return false;
	}

	function toggle() {
		const button = $(this);
		const disabled = button.hasClass('btn-success');
		const index = button.parents('[data-index]').attr('data-index');
		translator.translate(disabled ? '[[admin/settings/navigation:btn.disable]]' : '[[admin/settings/navigation:btn.enable]]', html => {
			button.toggleClass('btn-warning').toggleClass('btn-success').html(html);
			button.parents('li').find('[name="enabled"]').val(disabled ? 'on' : '');
			$('#active-navigation [data-index="' + index + '"] a').toggleClass('text-muted', !disabled);
		});
		return false;
	}

	return navigation;
});
