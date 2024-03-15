'use strict';

define('forum/post-queue', [
	'categoryFilter', 'categorySelector', 'api', 'alerts', 'bootbox',
], (categoryFilter, categorySelector, api, alerts, bootbox) => {
	const PostQueue = {};

	PostQueue.init = function () {
		$('[data-toggle="tooltip"]').tooltip();

		categoryFilter.init($('[component="category/dropdown"]'), {
			privilege: 'moderate',
		});

		handleBulkActions();

		$('.posts-list').on('click', '[data-action]', async function () {
			function getMessage() {
				return new Promise(resolve => {
					const modal = bootbox.dialog({
						title: '[[post-queue:notify-user]]',
						message: '<textarea class="form-control"></textarea>',
						buttons: {
							OK: {
								label: '[[modules:bootbox.send]]',
								callback() {
									const value = modal.find('textarea').val();
									if (value) {
										resolve(value);
									}
								},
							},
						},
					});
				});
			}

			const parent = $(this).parents('[data-id]');
			const action = $(this).attr('data-action');
			const id = parent.attr('data-id');
			const listContainer = parent.get(0).parentNode;

			if ((!['accept', 'reject', 'notify'].includes(action)) || (action === 'reject' && !await confirmReject('[[post-queue:confirm-reject]]'))) {
				return;
			}

			socket.emit('posts.' + action, {
				id,
				message: action === 'notify' ? await getMessage() : undefined,
			}, error => {
				if (error) {
					return alerts.error(error);
				}

				if (action === 'accept' || action === 'reject') {
					parent.remove();
				}

				if (listContainer.childElementCount === 0) {
					if (ajaxify.data.singlePost) {
						ajaxify.go('/post-queue' + window.location.search);
					} else {
						ajaxify.refresh();
					}
				}
			});
			return false;
		});

		handleContentEdit('.post-content', '.post-content-editable', 'textarea');
		handleContentEdit('.topic-title', '.topic-title-editable', 'input');

		$('.posts-list').on('click', '.topic-category[data-editable]', function () {
			const $this = $(this);
			const id = $this.parents('[data-id]').attr('data-id');
			categorySelector.modal({
				onSubmit(selectedCategory) {
					Promise.all([
						api.get(`/categories/${selectedCategory.cid}`, {}),
						socket.emit('posts.editQueuedContent', {
							id,
							cid: selectedCategory.cid,
						}),
					]).then(result => {
						const category = result[0];
						app.parseAndTranslate('post-queue', 'posts', {
							posts: [{
								category,
							}],
						}, html => {
							if ($this.find('.category-text').length > 0) {
								$this.find('.category-text').text(html.find('.topic-category .category-text').text());
							} else {
								// For backwards compatibility, remove in 1.16.0
								$this.replaceWith(html.find('.topic-category'));
							}
						});
					}).catch(alerts.error);
				},
			});
			return false;
		});

		$('[component="post/content"] img:not(.not-responsive)').addClass('img-responsive');
	};

	function confirmReject(message) {
		return new Promise(resolve => {
			bootbox.confirm(message, resolve);
		});
	}

	function handleContentEdit(displayClass, editableClass, inputSelector) {
		$('.posts-list').on('click', displayClass, function () {
			const element = $(this);
			const inputElement = element.parent().find(editableClass);
			if (inputElement.length > 0) {
				element.addClass('hidden');
				inputElement.removeClass('hidden').find(inputSelector).focus();
			}
		});

		$('.posts-list').on('blur', editableClass + ' ' + inputSelector, function () {
			const textarea = $(this);
			const preview = textarea.parent().parent().find(displayClass);
			const id = textarea.parents('[data-id]').attr('data-id');
			const titleEdit = displayClass === '.topic-title';

			socket.emit('posts.editQueuedContent', {
				id,
				title: titleEdit ? textarea.val() : undefined,
				content: titleEdit ? undefined : textarea.val(),
			}, (error, data) => {
				if (error) {
					return alerts.error(error);
				}

				if (titleEdit) {
					if (preview.find('.title-text').length > 0) {
						preview.find('.title-text').text(data.postData.title);
					} else {
						// For backwards compatibility, remove in 1.16.0
						preview.html(data.postData.title);
					}
				} else {
					preview.html(data.postData.content);
				}

				textarea.parent().addClass('hidden');
				preview.removeClass('hidden');
			});
		});
	}

	function handleBulkActions() {
		$('[component="post-queue/bulk-actions"]').on('click', '[data-action]', async function () {
			const bulkAction = $(this).attr('data-action');
			let queueEls = $('.posts-list [data-id]');
			if (bulkAction === 'accept-selected' || bulkAction === 'reject-selected') {
				queueEls = queueEls.filter(
					(i, element) => $(element).find('input[type="checkbox"]').is(':checked'),
				);
			}

			const ids = queueEls.map((i, element) => $(element).attr('data-id')).get();
			const showConfirm = bulkAction === 'reject-all' || bulkAction === 'reject-selected';
			if (ids.length === 0 || (showConfirm && !(await confirmReject(`[[post-queue:${bulkAction}-confirm, ${ids.length}]]`)))) {
				return;
			}

			const action = bulkAction.split('-')[0];
			const promises = ids.map(id => socket.emit('posts.' + action, {id}));

			Promise.allSettled(promises).then(results => {
				const fulfilled = results.filter(res => res.status === 'fulfilled').length;
				const errors = results.filter(res => res.status === 'rejected');
				if (fulfilled) {
					alerts.success(`[[post-queue:bulk-${action}-success, ${fulfilled}]]`);
					ajaxify.refresh();
				}

				for (const res of errors) {
					alerts.error(res.reason);
				}
			});
		});
	}

	return PostQueue;
});
