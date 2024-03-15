'use strict';

define('groupSearch', () => {
	const groupSearch = {};

	groupSearch.init = function (element) {
		if (utils.isTouchDevice()) {
			return;
		}

		const searchElement = element.find('[component="group-selector-search"]');
		if (searchElement.length === 0) {
			return;
		}

		const toggleVisibility = searchElement.parent('[component="group-selector"]').length > 0;

		const groupEls = element.find('[component="group-list"] [data-name]');
		element.on('show.bs.dropdown', () => {
			function updateList() {
				const value = searchElement.find('input').val().toLowerCase();
				let noMatch = true;
				groupEls.each(function () {
					const liElement = $(this);
					const isMatch = liElement.attr('data-name').toLowerCase().includes(value);
					if (noMatch && isMatch) {
						noMatch = false;
					}

					liElement.toggleClass('hidden', !isMatch);
				});

				element.find('[component="group-list"] [component="group-no-matches"]').toggleClass('hidden', !noMatch);
			}

			if (toggleVisibility) {
				element.find('.dropdown-toggle').addClass('hidden');
				searchElement.removeClass('hidden');
			}

			searchElement.on('click', event => {
				event.preventDefault();
				event.stopPropagation();
			});
			searchElement.find('input').val('').on('keyup', updateList);
			updateList();
		});

		element.on('shown.bs.dropdown', () => {
			searchElement.find('input').focus();
		});

		element.on('hide.bs.dropdown', () => {
			if (toggleVisibility) {
				element.find('.dropdown-toggle').removeClass('hidden');
				searchElement.addClass('hidden');
			}

			searchElement.off('click').find('input').off('keyup');
		});
	};

	return groupSearch;
});
