'use strict';

define('iconSelect', ['benchpress', 'bootbox'], (Benchpress, bootbox) => {
	const iconSelect = {};

	iconSelect.init = function (element, onModified) {
		onModified ||= function () {};
		const doubleSize = element.hasClass('fa-2x');
		let selected = element.attr('class').replace('fa-2x', '').replace('fa', '').replaceAll(/\s+/g, '');

		$('#icons .selected').removeClass('selected');

		if (selected) {
			try {
				$('#icons .fa-icons .fa.' + selected).addClass('selected');
			} catch {
				selected = '';
			}
		}

		Benchpress.render('partials/fontawesome', {}).then(html => {
			html = $(html);
			html.find('.fa-icons').prepend($('<i class="fa fa-nbb-none"></i>'));

			const picker = bootbox.dialog({
				onEscape: true,
				backdrop: true,
				show: false,
				message: html,
				title: 'Select an Icon',
				buttons: {
					noIcon: {
						label: 'No Icon',
						className: 'btn-default',
						callback() {
							element.attr('class', 'fa ' + (doubleSize ? 'fa-2x ' : ''));
							element.val('');
							element.attr('value', '');

							onModified(element);
						},
					},
					success: {
						label: 'Select',
						className: 'btn-primary',
						callback() {
							const iconClass = $('.bootbox .selected').attr('class') || `fa fa-${$('.bootbox #fa-filter').val()}`;
							const categoryIconClass = $('<div></div>').addClass(iconClass).removeClass('fa').removeClass('selected')
								.attr('class');
							const searchElementValue = picker.find('input').val();

							if (categoryIconClass) {
								element.attr('class', 'fa ' + (doubleSize ? 'fa-2x ' : '') + categoryIconClass);
								element.val(categoryIconClass);
								element.attr('value', categoryIconClass);
							} else if (searchElementValue) {
								element.attr('class', searchElementValue);
								element.val(searchElementValue);
								element.attr('value', searchElementValue);
							}

							onModified(element);
						},
					},
				},
			});

			picker.on('show.bs.modal', function () {
				const modalElement = $(this);
				const searchElement = modalElement.find('input');

				if (selected) {
					modalElement.find('.' + selected).addClass('selected');
					searchElement.val(selected.replace('fa-', ''));
				}
			}).modal('show');

			picker.on('shown.bs.modal', function () {
				const modalElement = $(this);
				const searchElement = modalElement.find('input');
				const icons = modalElement.find('.fa-icons i');
				const submitElement = modalElement.find('button.btn-primary');

				function changeSelection(newSelection) {
					modalElement.find('i.selected').removeClass('selected');
					if (newSelection) {
						newSelection.addClass('selected');
					} else if (searchElement.val().length === 0) {
						if (selected) {
							modalElement.find('.' + selected).addClass('selected');
						}
					} else {
						modalElement.find('i:visible').first().addClass('selected');
					}
				}

				// Focus on the input box
				searchElement.selectRange(0, searchElement.val().length);

				modalElement.find('.icon-container').on('click', 'i', function () {
					searchElement.val($(this).attr('class').replace('fa fa-', '').replace('selected', ''));
					changeSelection($(this));
				});

				searchElement.on('keyup', e => {
					if (e.keyCode === 13) {
						submitElement.click();
					} else {
						// Filter
						icons.show();
						icons.each((index, element_) => {
							if (!new RegExp('^fa fa-.*' + searchElement.val() + '.*$').test(element_.className)) {
								$(element_).hide();
							}
						});
						changeSelection();
					}
				});
			});
		});
	};

	return iconSelect;
});
