'use strict';

define('admin/manage/category', [
	'uploader',
	'iconSelect',
	'categorySelector',
	'benchpress',
	'api',
	'bootbox',
	'alerts',
], (uploader, iconSelect, categorySelector, Benchpress, api, bootbox, alerts) => {
	const Category = {};
	let updateHash = {};

	Category.init = function () {
		$('#category-settings select').each(function () {
			const $this = $(this);
			$this.val($this.attr('data-value'));
		});

		categorySelector.init($('[component="category-selector"]'), {
			onSelect(selectedCategory) {
				ajaxify.go('admin/manage/categories/' + selectedCategory.cid);
			},
			showLinks: true,
		});

		handleTags();

		$('#category-settings input, #category-settings select, #category-settings textarea').on('change', event => {
			modified(event.target);
		});

		$('[data-name="imageClass"]').on('change', function () {
			$('.category-preview').css('background-size', $(this).val());
		});

		$('[data-name="bgColor"], [data-name="color"]').on('input', function () {
			const $inputElement = $(this);
			const previewElement = $inputElement.parents('[data-cid]').find('.category-preview');
			if ($inputElement.attr('data-name') === 'bgColor') {
				previewElement.css('background-color', $inputElement.val());
			} else if ($inputElement.attr('data-name') === 'color') {
				previewElement.css('color', $inputElement.val());
			}

			modified($inputElement[0]);
		});

		$('#save').on('click', () => {
			const tags = $('#tag-whitelist').val() ? $('#tag-whitelist').val().split(',') : [];
			if (tags.length > 0 && tags.length < Number.parseInt($('#cid-min-tags').val(), 10)) {
				return alerts.error('[[admin/manage/categories:alert.not-enough-whitelisted-tags]]');
			}

			const cid = ajaxify.data.category.cid;
			api.put('/categories/' + cid, updateHash).then(res => {
				app.flags._unsaved = false;
				alerts.alert({
					title: 'Updated Categories',
					message: 'Category "' + res.name + '" was successfully updated.',
					type: 'success',
					timeout: 5000,
				});
				updateHash = {};
			}).catch(alerts.error);

			return false;
		});

		$('.purge').on('click', e => {
			e.preventDefault();

			Benchpress.render('admin/partials/categories/purge', {
				name: ajaxify.data.category.name,
				topic_count: ajaxify.data.category.topic_count,
			}).then(html => {
				const modal = bootbox.dialog({
					title: '[[admin/manage/categories:purge]]',
					message: html,
					size: 'large',
					buttons: {
						save: {
							label: '[[modules:bootbox.confirm]]',
							className: 'btn-primary',
							callback() {
								modal.find('.modal-footer button').prop('disabled', true);

								const intervalId = setInterval(() => {
									socket.emit('categories.getTopicCount', ajaxify.data.category.cid, (error, count) => {
										if (error) {
											return alerts.error(error);
										}

										let percent = 0;
										if (ajaxify.data.category.topic_count > 0) {
											percent
                                                = Math.max(0, (1 - (count / ajaxify.data.category.topic_count))) * 100;
										}

										modal.find('.progress-bar').css({width: percent + '%'});
									});
								}, 1000);

								api.del('/categories/' + ajaxify.data.category.cid).then(() => {
									if (intervalId) {
										clearInterval(intervalId);
									}

									modal.modal('hide');
									alerts.success('[[admin/manage/categories:alert.purge-success]]');
									ajaxify.go('admin/manage/categories');
								}).catch(alerts.error);

								return false;
							},
						},
					},
				});
			});
		});

		$('.copy-settings').on('click', () => {
			Benchpress.render('admin/partials/categories/copy-settings', {}).then(html => {
				let selectedCid;
				const modal = bootbox.dialog({
					title: '[[modules:composer.select_category]]',
					message: html,
					buttons: {
						save: {
							label: '[[modules:bootbox.confirm]]',
							className: 'btn-primary',
							callback() {
								if (!selectedCid
                                    || Number.parseInt(selectedCid, 10) === Number.parseInt(ajaxify.data.category.cid, 10)) {
									return;
								}

								socket.emit('admin.categories.copySettingsFrom', {
									fromCid: selectedCid,
									toCid: ajaxify.data.category.cid,
									copyParent: modal.find('#copyParent').prop('checked'),
								}, error => {
									if (error) {
										return alerts.error(error);
									}

									modal.modal('hide');
									alert.success('[[admin/manage/categories:alert.copy-success]]');
									ajaxify.refresh();
								});
								return false;
							},
						},
					},
				});
				modal.find('.modal-footer button').prop('disabled', true);
				categorySelector.init(modal.find('[component="category-selector"]'), {
					onSelect(selectedCategory) {
						selectedCid = selectedCategory && selectedCategory.cid;
						if (selectedCid) {
							modal.find('.modal-footer button').prop('disabled', false);
						}
					},
					showLinks: true,
				});
			});
			return false;
		});

		$('.upload-button').on('click', function () {
			const inputElement = $(this);
			const cid = inputElement.attr('data-cid');

			uploader.show({
				title: '[[admin/manage/categories:alert.upload-image]]',
				route: config.relative_path + '/api/admin/category/uploadpicture',
				params: {cid},
			}, imageUrlOnServer => {
				$('#category-image').val(imageUrlOnServer);
				const previewBox = inputElement.parent().parent().siblings('.category-preview');
				previewBox.css('background', 'url(' + imageUrlOnServer + '?' + Date.now() + ')');

				modified($('#category-image'));
			});
		});

		$('#category-image').on('change', function () {
			$('.category-preview').css('background-image', $(this).val() ? ('url("' + $(this).val() + '")') : '');
			modified($('#category-image'));
		});

		$('.delete-image').on('click', function (e) {
			e.preventDefault();

			const inputElement = $('#category-image');
			const previewBox = $('.category-preview');

			inputElement.val('');
			previewBox.css('background-image', '');
			modified(inputElement[0]);
			$(this).parent().addClass('hide').hide();
		});

		$('.category-preview').on('click', function () {
			iconSelect.init($(this).find('i'), modified);
		});

		$('[type="checkbox"]').on('change', function () {
			modified($(this));
		});

		$('button[data-action="setParent"], button[data-action="changeParent"]').on('click', Category.launchParentSelector);
		$('button[data-action="removeParent"]').on('click', () => {
			api.put('/categories/' + ajaxify.data.category.cid, {
				parentCid: 0,
			}).then(() => {
				$('button[data-action="removeParent"]').parent().addClass('hide');
				$('button[data-action="changeParent"]').parent().addClass('hide');
				$('button[data-action="setParent"]').removeClass('hide');
			}).catch(alerts.error);
		});
		$('button[data-action="toggle"]').on('click', function () {
			const $this = $(this);
			const disabled = $this.attr('data-disabled') === '1';
			api.put('/categories/' + ajaxify.data.category.cid, {
				disabled: disabled ? 0 : 1,
			}).then(() => {
				$this.translateText(disabled ? '[[admin/manage/categories:disable]]' : '[[admin/manage/categories:enable]]');
				$this.toggleClass('btn-primary', !disabled).toggleClass('btn-danger', disabled);
				$this.attr('data-disabled', disabled ? 0 : 1);
			}).catch(alerts.error);
		});
	};

	function modified(element) {
		let value;
		if ($(element).is(':checkbox')) {
			value = $(element).is(':checked') ? 1 : 0;
		} else {
			value = $(element).val();
		}

		const dataName = $(element).attr('data-name');
		const fields = dataName.match(/[^\][.]+/g);

		function setNestedFields(object, index) {
			if (index === fields.length) {
				return;
			}

			object[fields[index]] = object[fields[index]] || {};
			if (index === fields.length - 1) {
				object[fields[index]] = value;
			}

			setNestedFields(object[fields[index]], index + 1);
		}

		if (fields && fields.length > 0) {
			if (fields.length === 1) { // Simple field name ie data-name="name"
				updateHash[fields[0]] = value;
			} else if (fields.length > 1) { // Nested field name ie data-name="name[sub1][sub2]"
				setNestedFields(updateHash, 0);
			}
		}

		app.flags = app.flags || {};
		app.flags._unsaved = true;
	}

	function handleTags() {
		const tagElement = $('#tag-whitelist');
		tagElement.tagsinput({
			confirmKeys: [13, 44],
			trimValue: true,
		});

		for (const tag of ajaxify.data.category.tagWhitelist) {
			tagElement.tagsinput('add', tag);
		}

		tagElement.on('itemAdded itemRemoved', () => {
			modified(tagElement);
		});
	}

	Category.launchParentSelector = function () {
		categorySelector.modal({
			onSubmit(selectedCategory) {
				const parentCid = selectedCategory.cid;
				if (!parentCid) {
					return;
				}

				api.put('/categories/' + ajaxify.data.category.cid, {
					parentCid,
				}).then(() => {
					api.get(`/categories/${parentCid}`, {}).then(parent => {
						if (parent && parent.icon && parent.name) {
							const buttonHtml = '<i class="fa ' + parent.icon + '"></i> ' + parent.name;
							$('button[data-action="changeParent"]').html(buttonHtml).parent().removeClass('hide');
						}
					});

					$('button[data-action="removeParent"]').parent().removeClass('hide');
					$('button[data-action="setParent"]').addClass('hide');
				}).catch(alerts.error);
			},
			showLinks: true,
		});
	};

	return Category;
});
