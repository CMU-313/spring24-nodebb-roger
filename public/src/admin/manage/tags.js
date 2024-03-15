'use strict';

define('admin/manage/tags', [
	'bootbox',
	'alerts',
	'admin/modules/selectable',
], (bootbox, alerts, selectable) => {
	const Tags = {};

	Tags.init = function () {
		selectable.enable('.tag-management', '.tag-row');

		handleCreate();
		handleSearch();
		handleRename();
		handleDeleteSelected();
	};

	function handleCreate() {
		const createModal = $('#create-modal');
		const createTagName = $('#create-tag-name');
		const createModalGo = $('#create-modal-go');

		createModal.on('keypress', e => {
			if (e.keyCode === 13) {
				createModalGo.click();
			}
		});

		$('#create').on('click', () => {
			createModal.modal('show');
			setTimeout(() => {
				createTagName.focus();
			}, 250);
		});

		createModalGo.on('click', () => {
			socket.emit('admin.tags.create', {
				tag: createTagName.val(),
			}, error => {
				if (error) {
					return alerts.error(error);
				}

				createTagName.val('');
				createModal.on('hidden.bs.modal', () => {
					ajaxify.refresh();
				});
				createModal.modal('hide');
			});
		});
	}

	function handleSearch() {
		$('#tag-search').on('input propertychange', utils.debounce(() => {
			socket.emit('topics.searchAndLoadTags', {
				query: $('#tag-search').val(),
			}, (error, result) => {
				if (error) {
					return alerts.error(error);
				}

				app.parseAndTranslate('admin/manage/tags', 'tags', {
					tags: result.tags,
				}, html => {
					$('.tag-list').html(html);
					utils.makeNumbersHumanReadable(html.find('.human-readable-number'));
					selectable.enable('.tag-management', '.tag-row');
				});
			});
		}, 250));
	}

	function handleRename() {
		$('#rename').on('click', () => {
			const tagsToModify = $('.tag-row.ui-selected');
			if (tagsToModify.length === 0) {
				return;
			}

			const modal = bootbox.dialog({
				title: '[[admin/manage/tags:alerts.editing]]',
				message: $('.rename-modal').html(),
				buttons: {
					success: {
						label: 'Save',
						className: 'btn-primary save',
						callback() {
							const data = [];
							tagsToModify.each((index, tag) => {
								tag = $(tag);
								data.push({
									value: tag.attr('data-tag'),
									newName: modal.find('[data-name="value"]').val(),
								});
							});

							socket.emit('admin.tags.rename', data, error => {
								if (error) {
									return alerts.error(error);
								}

								alerts.success('[[admin/manage/tags:alerts.update-success]]');
								ajaxify.refresh();
							});
						},
					},
				},
			});
		});
	}

	function handleDeleteSelected() {
		$('#deleteSelected').on('click', () => {
			const tagsToDelete = $('.tag-row.ui-selected');
			if (tagsToDelete.length === 0) {
				return;
			}

			bootbox.confirm('[[admin/manage/tags:alerts.confirm-delete]]', confirm => {
				if (!confirm) {
					return;
				}

				const tags = [];
				tagsToDelete.each((index, element) => {
					tags.push($(element).attr('data-tag'));
				});
				socket.emit('admin.tags.deleteTags', {
					tags,
				}, error => {
					if (error) {
						return alerts.error(error);
					}

					tagsToDelete.remove();
				});
			});
		});
	}

	return Tags;
});
