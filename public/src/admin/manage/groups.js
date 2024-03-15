'use strict';

define('admin/manage/groups', [
	'categorySelector',
	'slugify',
	'api',
	'bootbox',
	'alerts',
], (categorySelector, slugify, api, bootbox, alerts) => {
	const Groups = {};

	Groups.init = function () {
		const createModal = $('#create-modal');
		const createGroupName = $('#create-group-name');
		const createModalGo = $('#create-modal-go');
		const createModalError = $('#create-modal-error');

		handleSearch();

		createModal.on('keypress', e => {
			if (e.keyCode === 13) {
				createModalGo.click();
			}
		});

		$('#create').on('click', () => {
			createModal.modal('show');
			setTimeout(() => {
				createGroupName.focus();
			}, 250);
		});

		createModalGo.on('click', () => {
			const submitObject = {
				name: createGroupName.val(),
				description: $('#create-group-desc').val(),
				private: $('#create-group-private').is(':checked') ? 1 : 0,
				hidden: $('#create-group-hidden').is(':checked') ? 1 : 0,
			};

			api.post('/groups', submitObject).then(response => {
				createModalError.addClass('hide');
				createGroupName.val('');
				createModal.on('hidden.bs.modal', () => {
					ajaxify.go('admin/manage/groups/' + response.name);
				});
				createModal.modal('hide');
			}).catch(error => {
				if (!utils.hasLanguageKey(error.status.message)) {
					error.status.message = '[[admin/manage/groups:alerts.create-failure]]';
				}

				createModalError.translateHtml(error.status.message).removeClass('hide');
			});
		});

		$('.groups-list').on('click', '[data-action]', function () {
			const element = $(this);
			const action = element.attr('data-action');
			const groupName = element.parents('tr[data-groupname]').attr('data-groupname');

			switch (action) {
				case 'delete': {
					bootbox.confirm('[[admin/manage/groups:alerts.confirm-delete]]', confirm => {
						if (confirm) {
							api.del(`/groups/${slugify(groupName)}`, {}).then(ajaxify.refresh).catch(alerts.error);
						}
					});
					break;
				}
			}
		});

		enableCategorySelectors();
	};

	function enableCategorySelectors() {
		$('.groups-list [component="category-selector"]').each(function () {
			const nameEncoded = $(this).parents('[data-name-encoded]').attr('data-name-encoded');
			categorySelector.init($(this), {
				onSelect(selectedCategory) {
					ajaxify.go('admin/manage/privileges/' + selectedCategory.cid + '?group=' + nameEncoded);
				},
				showLinks: true,
			});
		});
	}

	function handleSearch() {
		const queryElement = $('#group-search');

		function doSearch() {
			if (!queryElement.val()) {
				return ajaxify.refresh();
			}

			$('.pagination').addClass('hide');
			const groupsElement = $('.groups-list');
			socket.emit('groups.search', {
				query: queryElement.val(),
				options: {
					sort: 'date',
				},
			}, (error, groups) => {
				if (error) {
					return alerts.error(error);
				}

				app.parseAndTranslate('admin/manage/groups', 'groups', {
					groups,
					categories: ajaxify.data.categories,
				}, html => {
					groupsElement.find('[data-groupname]').remove();
					groupsElement.find('tbody').append(html);
					enableCategorySelectors();
				});
			});
		}

		queryElement.on('keyup', utils.debounce(doSearch, 200));
	}

	return Groups;
});
