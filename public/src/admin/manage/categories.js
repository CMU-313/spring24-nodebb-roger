'use strict';

define('admin/manage/categories', [
	'translator',
	'benchpress',
	'categorySelector',
	'api',
	'Sortable',
	'bootbox',
	'alerts',
], (translator, Benchpress, categorySelector, api, Sortable, bootbox, alerts) => {
	Sortable = Sortable.default;
	const Categories = {};
	let newCategoryId = -1;
	let sortables;

	Categories.init = function () {
		categorySelector.init($('.category [component="category-selector"]'), {
			parentCid: ajaxify.data.selectedCategory ? ajaxify.data.selectedCategory.cid : 0,
			onSelect(selectedCategory) {
				ajaxify.go('/admin/manage/categories' + (selectedCategory.cid ? '?cid=' + selectedCategory.cid : ''));
			},
			localCategories: [],
		});
		Categories.render(ajaxify.data.categoriesTree);

		$('button[data-action="create"]').on('click', Categories.throwCreateModal);

		// Enable/Disable toggle events
		$('.categories').on('click', '.category-tools [data-action="toggle"]', function () {
			const $this = $(this);
			const cid = $this.attr('data-disable-cid');
			const parentElement = $this.parents('li[data-cid="' + cid + '"]');
			const disabled = parentElement.hasClass('disabled');
			const childrenEls = parentElement.find('li[data-cid]');
			const childrenCids = childrenEls.map(function () {
				return $(this).attr('data-cid');
			}).get();

			Categories.toggle([cid].concat(childrenCids), !disabled);
		});

		$('.categories').on('click', '.toggle', function () {
			const element = $(this);
			element.find('i').toggleClass('fa-chevron-down').toggleClass('fa-chevron-right');
			element.closest('[data-cid]').find('> ul[data-cid]').toggleClass('hidden');
		});

		$('.categories').on('click', '.set-order', function () {
			const cid = $(this).attr('data-cid');
			const order = $(this).attr('data-order');
			const modal = bootbox.dialog({
				title: '[[admin/manage/categories:set-order]]',
				message: '<input type="number" min="1" class="form-control input-lg" value=' + order + ' /><p class="help-block">[[admin/manage/categories:set-order-help]]</p>',
				show: true,
				buttons: {
					save: {
						label: '[[modules:bootbox.confirm]]',
						className: 'btn-primary',
						callback() {
							const value = modal.find('input').val();
							if (value && cid) {
								const modified = {};
								modified[cid] = {order: Math.max(1, Number.parseInt(value, 10))};
								api.put('/categories/' + cid, modified[cid]).then(() => {
									ajaxify.refresh();
								}).catch(alerts.error);
							} else {
								return false;
							}
						},
					},
				},
			});
		});

		$('#collapse-all').on('click', () => {
			toggleAll(false);
		});

		$('#expand-all').on('click', () => {
			toggleAll(true);
		});

		function toggleAll(expand) {
			const element = $('.categories .toggle');
			element.find('i').toggleClass('fa-chevron-down', expand).toggleClass('fa-chevron-right', !expand);
			element.closest('[data-cid]').find('> ul[data-cid]').toggleClass('hidden', !expand);
		}
	};

	Categories.throwCreateModal = function () {
		Benchpress.render('admin/partials/categories/create', {}).then(html => {
			const modal = bootbox.dialog({
				title: '[[admin/manage/categories:alert.create]]',
				message: html,
				buttons: {
					save: {
						label: '[[global:save]]',
						className: 'btn-primary',
						callback: submit,
					},
				},
			});
			const options = {
				localCategories: [
					{
						cid: 0,
						name: '[[admin/manage/categories:parent-category-none]]',
						icon: 'fa-none',
					},
				],
			};
			const parentSelector = categorySelector.init(modal.find('#parentCidGroup [component="category-selector"]'), options);
			const cloneFromSelector = categorySelector.init(modal.find('#cloneFromCidGroup [component="category-selector"]'), options);
			function submit() {
				const formData = modal.find('form').serializeObject();
				formData.description = '';
				formData.icon = 'fa-comments';
				formData.uid = app.user.uid;
				formData.parentCid = parentSelector.getSelectedCid();
				formData.cloneFromCid = cloneFromSelector.getSelectedCid();

				Categories.create(formData);
				modal.modal('hide');
				return false;
			}

			$('#cloneChildren').on('change', function () {
				const check = $(this);
				const parentSelect = modal.find('#parentCidGroup [component="category-selector"] .dropdown-toggle');

				if (check.prop('checked')) {
					parentSelect.attr('disabled', 'disabled');
					parentSelector.selectCategory(0);
				} else {
					parentSelect.removeAttr('disabled');
				}
			});

			modal.find('form').on('submit', submit);
		});
	};

	Categories.create = function (payload) {
		api.post('/categories', payload, (error, data) => {
			if (error) {
				return alerts.error(error);
			}

			alerts.alert({
				alert_id: 'category_created',
				title: '[[admin/manage/categories:alert.created]]',
				message: '[[admin/manage/categories:alert.create-success]]',
				type: 'success',
				timeout: 2000,
			});

			ajaxify.go('admin/manage/categories/' + data.cid);
		});
	};

	Categories.render = function (categories) {
		const container = $('.categories');

		if (!categories || categories.length === 0) {
			translator.translate('[[admin/manage/categories:alert.none-active]]', text => {
				$('<div></div>')
					.addClass('alert alert-info text-center')
					.text(text)
					.appendTo(container);
			});
		} else {
			sortables = {};
			renderList(categories, container, {cid: 0});
		}
	};

	Categories.toggle = function (cids, disabled) {
		const listElement = document.querySelector('.categories ul');
		Promise.all(cids.map(cid => api.put('/categories/' + cid, {
			disabled: disabled ? 1 : 0,
		}).then(() => {
			const categoryElement = listElement.querySelector(`li[data-cid="${cid}"]`);
			categoryElement.classList[disabled ? 'add' : 'remove']('disabled');
			$(categoryElement).find('li a[data-action="toggle"]').first().translateText(disabled ? '[[admin/manage/categories:enable]]' : '[[admin/manage/categories:disable]]');
		}).catch(alerts.error)));
	};

	function itemDidAdd(e) {
		newCategoryId = e.to.dataset.cid;
	}

	function itemDragDidEnd(e) {
		const isCategoryUpdate = Number.parseInt(newCategoryId, 10) !== -1;

		// Update needed?
		if ((e.newIndex != null && Number.parseInt(e.oldIndex, 10) !== Number.parseInt(e.newIndex, 10)) || isCategoryUpdate) {
			const cid = e.item.dataset.cid;
			const modified = {};
			// On page 1 baseIndex is 0, on page n baseIndex is (n - 1) * ajaxify.data.categoriesPerPage
			// this makes sure order is correct when drag & drop is used on pages > 1
			const baseIndex = (ajaxify.data.pagination.currentPage - 1) * ajaxify.data.categoriesPerPage;
			modified[cid] = {
				order: baseIndex + e.newIndex + 1,
			};

			if (isCategoryUpdate) {
				modified[cid].parentCid = newCategoryId;

				// Show/hide expand buttons after drag completion
				const oldParentCid = Number.parseInt(e.from.dataset.cid, 10);
				const newParentCid = Number.parseInt(e.to.dataset.cid, 10);
				if (oldParentCid !== newParentCid) {
					const toggle = document.querySelector(`.categories li[data-cid="${newParentCid}"] .toggle`);
					if (toggle) {
						toggle.classList.toggle('hide', false);
					}

					const children = document.querySelectorAll(`.categories li[data-cid="${oldParentCid}"] ul[data-cid] li[data-cid]`);
					if (children.length === 0) {
						const toggle = document.querySelector(`.categories li[data-cid="${oldParentCid}"] .toggle`);
						if (toggle) {
							toggle.classList.toggle('hide', true);
						}
					}

					e.item.dataset.parentCid = newParentCid;
				}
			}

			newCategoryId = -1;
			api.put('/categories/' + cid, modified[cid]).catch(alerts.error);
		}
	}

	/**
     * Render categories - recursively
     *
     * @param categories {array} categories tree
     * @param level {number} current sub-level of rendering
     * @param container {object} parent jquery element for the list
     * @param parentId {number} parent category identifier
     */
	function renderList(categories, container, parentCategory) {
		// Translate category names if needed
		let count = 0;
		const parentId = parentCategory.cid;
		categories.forEach((category, index, parent) => {
			translator.translate(category.name, translated => {
				if (category.name !== translated) {
					category.name = translated;
				}

				count += 1;

				if (count === parent.length) {
					continueRender();
				}
			});
		});

		if (categories.length === 0) {
			continueRender();
		}

		function continueRender() {
			app.parseAndTranslate('admin/partials/categories/category-rows', {
				cid: parentCategory.cid,
				categories,
				parentCategory,
			}, html => {
				if (container.find('.category-row').length > 0) {
					container.find('.category-row').after(html);
				} else {
					container.append(html);
				}

				// Disable expand toggle
				if (categories.length === 0) {
					const toggleElement = container.get(0).querySelector('.toggle');
					toggleElement.classList.toggle('hide', true);
				}

				// Handle and children categories in this level have
				for (let x = 0, numberCategories = categories.length; x < numberCategories; x += 1) {
					renderList(categories[x].children, $('li[data-cid="' + categories[x].cid + '"]'), categories[x]);
				}

				// Make list sortable
				sortables[parentId] = Sortable.create($('ul[data-cid="' + parentId + '"]')[0], {
					group: 'cross-categories',
					animation: 150,
					handle: '.information',
					dataIdAttr: 'data-cid',
					ghostClass: 'placeholder',
					onAdd: itemDidAdd,
					onEnd: itemDragDidEnd,
				});
			});
		}
	}

	return Categories;
});
