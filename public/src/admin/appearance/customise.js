'use strict';

define('admin/appearance/customise', ['admin/settings', 'ace/ace'], (Settings, ace) => {
	const Customise = {};

	Customise.init = function () {
		Settings.prepare(() => {
			$('#customCSS').text($('#customCSS-holder').val());
			$('#customJS').text($('#customJS-holder').val());
			$('#customHTML').text($('#customHTML-holder').val());

			initACE('customCSS', 'less', '#customCSS-holder');
			initACE('customJS', 'javascript', '#customJS-holder');
			initACE('customHTML', 'html', '#customHTML-holder');

			$('#save').on('click', () => {
				if ($('#enableLiveReload').is(':checked')) {
					socket.emit('admin.reloadAllSessions');
				}
			});
		});
	};

	function initACE(aceElementId, mode, holder) {
		const editorElement = ace.edit(aceElementId, {
			mode: 'ace/mode/' + mode,
			theme: 'ace/theme/twilight',
			maxLines: 30,
			minLines: 30,
			fontSize: 14,
		});
		editorElement.on('change', () => {
			app.flags = app.flags || {};
			app.flags._unsaved = true;
			$(holder).val(editorElement.getValue());
		});
	}

	return Customise;
});
