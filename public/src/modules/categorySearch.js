'use strict';

define('categorySearch', ['alerts'], alerts => {
	const categorySearch = {};

	categorySearch.init = function (element, options) {
		let categoriesList = null;
		options ||= {};
		options.privilege = options.privilege || 'topics:read';
		options.states = options.states || ['watching', 'notwatching', 'ignoring'];

		let localCategories = [];
		if (Array.isArray(options.localCategories)) {
			localCategories = options.localCategories.map(c => ({...c}));
		}

		options.selectedCids = options.selectedCids || ajaxify.data.selectedCids || [];

		const searchElement = element.find('[component="category-selector-search"]');
		if (searchElement.length === 0) {
			return;
		}

		const toggleVisibility = searchElement.parent('[component="category/dropdown"]').length > 0
            || searchElement.parent('[component="category-selector"]').length > 0;

		element.on('show.bs.dropdown', () => {
			if (toggleVisibility) {
				element.find('.dropdown-toggle').addClass('hidden');
				searchElement.removeClass('hidden');
			}

			function doSearch() {
				const value = searchElement.find('input').val();
				if (value.length > 1 || (!value && !categoriesList)) {
					loadList(value, categories => {
						categoriesList ||= categories;
						renderList(categories);
					});
				} else if (!value && categoriesList) {
					for (const c of categoriesList) {
						c.selected = options.selectedCids.includes(c.cid);
					}

					renderList(categoriesList);
				}
			}

			searchElement.on('click', event => {
				event.preventDefault();
				event.stopPropagation();
			});
			searchElement.find('input').val('').on('keyup', utils.debounce(doSearch, 300));
			doSearch();
		});

		element.on('shown.bs.dropdown', () => {
			searchElement.find('input').focus();
		});

		element.on('hide.bs.dropdown', () => {
			if (toggleVisibility) {
				element.find('.dropdown-toggle').removeClass('hidden');
				searchElement.addClass('hidden');
			}

			searchElement.off('click');
			searchElement.find('input').off('keyup');
		});

		function loadList(search, callback) {
			socket.emit('categories.categorySearch', {
				search,
				query: utils.params(),
				parentCid: options.parentCid || 0,
				selectedCids: options.selectedCids,
				privilege: options.privilege,
				states: options.states,
				showLinks: options.showLinks,
			}, (error, categories) => {
				if (error) {
					return alerts.error(error);
				}

				callback(localCategories.concat(categories));
			});
		}

		function renderList(categories) {
			app.parseAndTranslate(options.template, {
				categoryItems: categories.slice(0, 200),
				selectedCategory: ajaxify.data.selectedCategory,
				allCategoriesUrl: ajaxify.data.allCategoriesUrl,
			}, html => {
				element.find('[component="category/list"]')
					.replaceWith(html.find('[component="category/list"]'));
				element.find('[component="category/list"] [component="category/no-matches"]')
					.toggleClass('hidden', categories.length > 0);
			});
		}
	};

	return categorySearch;
});
