'use strict';

define('uploadHelpers', ['alerts'], alerts => {
	const uploadHelpers = {};

	uploadHelpers.init = function (options) {
		const formElement = options.uploadFormEl;
		if (formElement.length === 0) {
			return;
		}

		formElement.attr('action', config.relative_path + options.route);

		if (options.dragDropAreaEl) {
			uploadHelpers.handleDragDrop({
				container: options.dragDropAreaEl,
				callback(upload) {
					uploadHelpers.ajaxSubmit({
						uploadForm: formElement,
						upload,
						callback: options.callback,
					});
				},
			});
		}

		if (options.pasteEl) {
			uploadHelpers.handlePaste({
				container: options.pasteEl,
				callback(upload) {
					uploadHelpers.ajaxSubmit({
						uploadForm: formElement,
						upload,
						callback: options.callback,
					});
				},
			});
		}
	};

	uploadHelpers.handleDragDrop = function (options) {
		let draggingDocument = false;
		const postContainer = options.container;
		const drop = options.container.find('.imagedrop');

		postContainer.on('dragenter', function onDragEnter() {
			if (draggingDocument) {
				return;
			}

			drop.css('top', '0px');
			drop.css('height', postContainer.height() + 'px');
			drop.css('line-height', postContainer.height() + 'px');
			drop.show();

			drop.on('dragleave', () => {
				drop.hide();
				drop.off('dragleave');
			});
		});

		drop.on('drop', function onDragDrop(e) {
			e.preventDefault();
			const files = e.originalEvent.dataTransfer.files;

			if (files.length > 0) {
				let formData;
				if (window.FormData) {
					formData = new FormData();
					for (const file of files) {
						formData.append('files[]', file, file.name);
					}
				}

				options.callback({
					files,
					formData,
				});
			}

			drop.hide();
			return false;
		});

		function cancel(e) {
			e.preventDefault();
			return false;
		}

		$(document)
			.off('dragstart')
			.on('dragstart', () => {
				draggingDocument = true;
			})
			.off('dragend')
			.on('dragend, mouseup', () => {
				draggingDocument = false;
			});

		drop.on('dragover', cancel);
		drop.on('dragenter', cancel);
	};

	uploadHelpers.handlePaste = function (options) {
		const container = options.container;
		container.on('paste', event => {
			const items = (event.clipboardData || event.originalEvent.clipboardData || {}).items;
			const files = [];
			const fileNames = [];
			let formData = null;
			if (window.FormData) {
				formData = new FormData();
			}

			Array.prototype.forEach.call(items, item => {
				const file = item.getAsFile();
				if (file) {
					const fileName = utils.generateUUID() + '-' + file.name;
					if (formData) {
						formData.append('files[]', file, fileName);
					}

					files.push(file);
					fileNames.push(fileName);
				}
			});

			if (files.length > 0) {
				options.callback({
					files,
					fileNames,
					formData,
				});
			}
		});
	};

	uploadHelpers.ajaxSubmit = function (options) {
		const files = [...options.upload.files];

		for (const file of files) {
			const isImage = file.type.match(/image./);
			if ((isImage && !app.user.privileges['upload:post:image']) || (!isImage && !app.user.privileges['upload:post:file'])) {
				return alerts.error('[[error:no-privileges]]');
			}

			if (file.size > Number.parseInt(config.maximumFileSize, 10) * 1024) {
				options.uploadForm[0].reset();
				return alerts.error('[[error:file-too-big, ' + config.maximumFileSize + ']]');
			}
		}

		const alert_id = Date.now();
		options.uploadForm.off('submit').on('submit', function () {
			$(this).ajaxSubmit({
				headers: {
					'x-csrf-token': config.csrf_token,
				},
				resetForm: true,
				clearForm: true,
				formData: options.upload.formData,
				error(xhr) {
					let errorMessage = (xhr.responseJSON
                        && (xhr.responseJSON.error || (xhr.responseJSON.status && xhr.responseJSON.status.message)))
                        || '[[error:parse-error]]';

					if (xhr && xhr.status === 413) {
						errorMessage = xhr.statusText || 'Request Entity Too Large';
					}

					alerts.error(errorMessage);
					alerts.remove(alert_id);
				},

				uploadProgress(event, position, total, percent) {
					alerts.alert({
						alert_id,
						message: '[[modules:composer.uploading, ' + percent + '%]]',
					});
				},

				success(res) {
					const uploads = res.response.images;
					if (uploads && uploads.length > 0) {
						for (const [i, upload] of uploads.entries()) {
							upload.filename = files[i].name;
							upload.isImage = /image./.test(files[i].type);
						}
					}

					options.callback(uploads);
				},

				complete() {
					options.uploadForm[0].reset();
					setTimeout(alerts.remove, 100, alert_id);
				},
			});

			return false;
		});

		options.uploadForm.submit();
	};

	return uploadHelpers;
});
