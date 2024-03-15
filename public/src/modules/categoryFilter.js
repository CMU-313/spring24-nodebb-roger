'use strict';

define('categoryFilter', ['categorySearch', 'api', 'hooks'], (categorySearch, api, hooks) => {
	const categoryFilter = {};

	categoryFilter.init = function (element, options) {
		if (!element || element.length === 0) {
			return;
		}

		options ||= {};
		options.states = options.states || ['watching', 'notwatching', 'ignoring'];
		options.template = 'partials/category-filter';

		hooks.fire('action:category.filter.options', {el: element, options});

		categorySearch.init(element, options);

		let selectedCids = [];
		let initialCids = [];
		if (Array.isArray(options.selectedCids)) {
			selectedCids = options.selectedCids.map(cid => Number.parseInt(cid, 10));
		} else if (Array.isArray(ajaxify.data.selectedCids)) {
			selectedCids = ajaxify.data.selectedCids.map(cid => Number.parseInt(cid, 10));
		}

		initialCids = selectedCids.slice();

		element.on('hidden.bs.dropdown', () => {
			let changed = initialCids.length !== selectedCids.length;
			for (const [index, cid] of initialCids.entries()) {
				if (cid !== selectedCids[index]) {
					changed = true;
				}
			}

			if (changed) {
				updateFilterButton(element, selectedCids);
			}

			if (options.onHidden) {
				options.onHidden({changed, selectedCids: selectedCids.slice()});
				return;
			}

			if (changed) {
				let url = window.location.pathname;
				const currentParameters = utils.params();
				if (selectedCids.length > 0) {
					currentParameters.cid = selectedCids;
					url += '?' + decodeURIComponent($.param(currentParameters));
				}

				ajaxify.go(url);
			}
		});

		element.on('click', '[component="category/list"] [data-cid]', function () {
			const listElement = element.find('[component="category/list"]');
			const categoryElement = $(this);
			const link = categoryElement.find('a').attr('href');
			if (link && link !== '#' && link.length > 0) {
				return;
			}

			const cid = Number.parseInt(categoryElement.attr('data-cid'), 10);
			const icon = categoryElement.find('[component="category/select/icon"]');

			if (selectedCids.includes(cid)) {
				selectedCids.splice(selectedCids.indexOf(cid), 1);
			} else {
				selectedCids.push(cid);
			}

			selectedCids.sort((a, b) => a - b);
			options.selectedCids = selectedCids;

			icon.toggleClass('invisible');
			listElement.find('li[data-all="all"] i').toggleClass('invisible', selectedCids.length > 0);
			if (options.onSelect) {
				options.onSelect({cid, selectedCids: selectedCids.slice()});
			}

			return false;
		});
	};

	function updateFilterButton(element, selectedCids) {
		if (selectedCids.length > 1) {
			renderButton({
				icon: 'fa-plus',
				name: '[[unread:multiple-categories-selected]]',
				bgColor: '#ddd',
			});
		} else if (selectedCids.length === 1) {
			api.get(`/categories/${selectedCids[0]}`, {}).then(renderButton);
		} else {
			renderButton();
		}

		function renderButton(category) {
			app.parseAndTranslate('partials/category-filter-content', {
				selectedCategory: category,
			}, html => {
				element.find('button').replaceWith($('<div/>').html(html).find('button'));
			});
		}
	}

	return categoryFilter;
});
