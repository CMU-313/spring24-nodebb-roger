'use strict';

define('forum/flags/detail', [
	'components', 'translator', 'benchpress', 'forum/account/header', 'accounts/delete', 'api', 'bootbox', 'alerts',
], (components, translator, Benchpress, AccountHeader, AccountsDelete, api, bootbox, alerts) => {
	const Detail = {};

	Detail.init = function () {
		// Update attributes
		$('#state').val(ajaxify.data.state).removeAttr('disabled');
		$('#assignee').val(ajaxify.data.assignee).removeAttr('disabled');

		$('#content > div').on('click', '[data-action]', function () {
			const action = this.dataset.action;
			const uid = $(this).parents('[data-uid]').attr('data-uid');
			const noteElement = document.querySelector('#note');

			switch (action) {
				case 'assign': {
					$('#assignee').val(app.user.uid);
				}
				// Falls through

				case 'update': {
					const data = $('#attributes').serializeArray().reduce((memo, current) => {
						memo[current.name] = current.value;
						return memo;
					}, {});

					api.put(`/flags/${ajaxify.data.flagId}`, data).then(({history}) => {
						alerts.success('[[flags:updated]]');
						Detail.reloadHistory(history);
					}).catch(alerts.error);
					break;
				}

				case 'appendNote': {
					api.post(`/flags/${ajaxify.data.flagId}/notes`, {
						note: noteElement.value,
						datetime: Number.parseInt(noteElement.dataset.datetime, 10),
					}).then(payload => {
						alerts.success('[[flags:note-added]]');
						Detail.reloadNotes(payload.notes);
						Detail.reloadHistory(payload.history);

						delete noteElement.dataset.datetime;
					}).catch(alerts.error);
					break;
				}

				case 'delete-note': {
					const datetime = Number.parseInt(this.closest('[data-datetime]').dataset.datetime, 10);
					bootbox.confirm('[[flags:delete-note-confirm]]', ok => {
						if (ok) {
							api.delete(`/flags/${ajaxify.data.flagId}/notes/${datetime}`, {}).then(payload => {
								alerts.success('[[flags:note-deleted]]');
								Detail.reloadNotes(payload.notes);
								Detail.reloadHistory(payload.history);
							}).catch(alerts.error);
						}
					});
					break;
				}

				case 'chat': {
					require(['chat'], chat => {
						chat.newChat(uid);
					});
					break;
				}

				case 'ban': {
					AccountHeader.banAccount(uid, ajaxify.refresh);
					break;
				}

				case 'unban': {
					AccountHeader.unbanAccount(uid);
					break;
				}

				case 'mute': {
					AccountHeader.muteAccount(uid, ajaxify.refresh);
					break;
				}

				case 'unmute': {
					AccountHeader.unmuteAccount(uid);
					break;
				}

				case 'delete-account': {
					AccountsDelete.account(uid, ajaxify.refresh);
					break;
				}

				case 'delete-content': {
					AccountsDelete.content(uid, ajaxify.refresh);
					break;
				}

				case 'delete-all': {
					AccountsDelete.purge(uid, ajaxify.refresh);
					break;
				}

				case 'delete-post': {
					postAction('delete', api.del, `/posts/${ajaxify.data.target.pid}/state`);
					break;
				}

				case 'purge-post': {
					postAction('purge', api.del, `/posts/${ajaxify.data.target.pid}`);
					break;
				}

				case 'restore-post': {
					postAction('restore', api.put, `/posts/${ajaxify.data.target.pid}/state`);
					break;
				}

				case 'prepare-edit': {
					const selectedNoteElement = this.closest('[data-index]');
					const index = selectedNoteElement.dataset.index;
					const textareaElement = document.querySelector('#note');
					textareaElement.value = ajaxify.data.notes[index].content;
					textareaElement.dataset.datetime = ajaxify.data.notes[index].datetime;

					const siblings = selectedNoteElement.parentElement.children;
					for (const element in siblings) {
						if (siblings.hasOwnProperty(element)) {
							siblings[element].classList.remove('editing');
						}
					}

					selectedNoteElement.classList.add('editing');
					textareaElement.focus();
					break;
				}

				case 'delete-flag': {
					bootbox.confirm('[[flags:delete-flag-confirm]]', ok => {
						if (ok) {
							api.delete(`/flags/${ajaxify.data.flagId}`, {}).then(() => {
								alerts.success('[[flags:flag-deleted]]');
								ajaxify.go('flags');
							}).catch(alerts.error);
						}
					});
					break;
				}
			}
		});
	};

	function postAction(action, method, path) {
		translator.translate('[[topic:post_' + action + '_confirm]]', message => {
			bootbox.confirm(message, confirm => {
				if (!confirm) {
					return;
				}

				method(path).then(ajaxify.refresh).catch(alerts.error);
			});
		});
	}

	Detail.reloadNotes = function (notes) {
		ajaxify.data.notes = notes;
		Benchpress.render('flags/detail', {
			notes,
		}, 'notes').then(html => {
			const wrapperElement = components.get('flag/notes');
			wrapperElement.empty();
			wrapperElement.html(html);
			wrapperElement.find('span.timeago').timeago();
			document.querySelector('#note').value = '';
		});
	};

	Detail.reloadHistory = function (history) {
		app.parseAndTranslate('flags/detail', 'history', {
			history,
		}, html => {
			const wrapperElement = components.get('flag/history');
			wrapperElement.empty();
			wrapperElement.html(html);
			wrapperElement.find('span.timeago').timeago();
		});
	};

	return Detail;
});
