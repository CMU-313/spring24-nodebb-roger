'use strict';

define('categorySelector', [
	'categorySearch', 'bootbox', 'hooks',
], (categorySearch, bootbox, hooks) => {
	const categorySelector = {};

	categorySelector.init = function (element, options) {
		if (!element || element.length === 0) {
			return;
		}

		options ||= {};
		const onSelect = options.onSelect || function () {};

		options.states = options.states || ['watching', 'notwatching', 'ignoring'];
		options.template = 'partials/category-selector';
		hooks.fire('action:category.selector.options', {el: element, options});

		categorySearch.init(element, options);

		const selector = {
			el: element,
			selectedCategory: null,
		};
		element.on('click', '[data-cid]', function () {
			const categoryElement = $(this);
			if (categoryElement.hasClass('disabled')) {
				return false;
			}

			selector.selectCategory(categoryElement.attr('data-cid'));
			onSelect(selector.selectedCategory);
		});
		const defaultSelectHtml = selector.el.find('[component="category-selector-selected"]').html();
		selector.selectCategory = function (cid) {
			const categoryElement = selector.el.find('[data-cid="' + cid + '"]');
			selector.selectedCategory = {
				cid,
				name: categoryElement.attr('data-name'),
			};

			if (categoryElement.length > 0) {
				selector.el.find('[component="category-selector-selected"]').html(
					categoryElement.find('[component="category-markup"]').html(),
				);
			} else {
				selector.el.find('[component="category-selector-selected"]').html(
					defaultSelectHtml,
				);
			}
		};

		selector.getSelectedCategory = function () {
			return selector.selectedCategory;
		};

		selector.getSelectedCid = function () {
			return selector.selectedCategory ? selector.selectedCategory.cid : 0;
		};

		return selector;
	};

	categorySelector.modal = function (options) {
		options ||= {};
		options.onSelect = options.onSelect || function () {};
		options.onSubmit = options.onSubmit || function () {};
		app.parseAndTranslate('admin/partials/categories/select-category', {message: options.message}, html => {
			const modal = bootbox.dialog({
				title: options.title || '[[modules:composer.select_category]]',
				message: html,
				buttons: {
					save: {
						label: '[[global:select]]',
						className: 'btn-primary',
						callback: submit,
					},
				},
			});

			const selector = categorySelector.init(modal.find('[component="category-selector"]'), options);
			function submit(event) {
				event.preventDefault();
				if (selector.selectedCategory) {
					options.onSubmit(selector.selectedCategory);
					modal.modal('hide');
				}

				return false;
			}

			if (options.openOnLoad) {
				modal.on('shown.bs.modal', () => {
					modal.find('.dropdown-toggle').dropdown('toggle');
				});
			}

			modal.find('form').on('submit', submit);
		});
	};

	return categorySelector;
});
