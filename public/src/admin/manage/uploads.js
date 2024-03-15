'use strict';

define('admin/manage/uploads', ['api', 'bootbox', 'alerts', 'uploader'], (api, bootbox, alerts, uploader) => {
	const Uploads = {};

	Uploads.init = function () {
		$('#upload').on('click', () => {
			uploader.show({
				title: '[[admin/manage/uploads:upload-file]]',
				route: config.relative_path + '/api/admin/upload/file',
				params: {folder: ajaxify.data.currentFolder},
			}, () => {
				ajaxify.refresh();
			});
		});

		$('.delete').on('click', function () {
			const file = $(this).parents('[data-path]');
			bootbox.confirm('[[admin/manage/uploads:confirm-delete]]', ok => {
				if (!ok) {
					return;
				}

				api.del('/files', {
					path: file.attr('data-path'),
				}).then(() => {
					file.remove();
				}).catch(alerts.error);
			});
		});

		$('#new-folder').on('click', async () => {
			bootbox.prompt('[[admin/manage/uploads:name-new-folder]]', newFolderName => {
				if (!newFolderName || !newFolderName.trim()) {
					return;
				}

				api.put('/files/folder', {
					path: ajaxify.data.currentFolder,
					folderName: newFolderName,
				}).then(() => {
					ajaxify.refresh();
				}).catch(alerts.error);
			});
		});
	};

	return Uploads;
});
