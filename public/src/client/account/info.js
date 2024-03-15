'use strict';

define('forum/account/info', ['forum/account/header', 'alerts', 'forum/account/sessions'], (header, alerts, sessions) => {
	const Info = {};

	Info.init = function () {
		header.init();
		handleModerationNote();
		sessions.prepareSessionRevocation();
	};

	function handleModerationNote() {
		$('[component="account/save-moderation-note"]').on('click', () => {
			const note = $('[component="account/moderation-note"]').val();
			socket.emit('user.setModerationNote', {uid: ajaxify.data.uid, note}, error => {
				if (error) {
					return alerts.error(error);
				}

				$('[component="account/moderation-note"]').val('');
				alerts.success('[[user:info.moderation-note.success]]');
				const timestamp = Date.now();
				const data = [{
					note: utils.escapeHTML(note),
					user: app.user,
					timestamp,
					timestampISO: utils.toISOString(timestamp),
				}];
				app.parseAndTranslate('account/info', 'moderationNotes', {moderationNotes: data}, html => {
					$('[component="account/moderation-note/list"]').prepend(html);
					html.find('.timeago').timeago();
				});
			});
		});
	}

	return Info;
});
