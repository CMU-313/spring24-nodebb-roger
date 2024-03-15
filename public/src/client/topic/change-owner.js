'use strict';

define('forum/topic/change-owner', [
	'postSelect',
	'autocomplete',
	'alerts',
], (postSelect, autocomplete, alerts) => {
	const ChangeOwner = {};

	let modal;
	let commit;
	let toUid = 0;
	ChangeOwner.init = function (postElement) {
		if (modal) {
			return;
		}

		app.parseAndTranslate('partials/change_owner_modal', {}, html => {
			modal = html;

			commit = modal.find('#change_owner_commit');

			$('body').append(modal);

			modal.find('.close,#change_owner_cancel').on('click', closeModal);
			modal.find('#username').on('keyup', checkButtonEnable);
			postSelect.init(onPostToggled, {
				allowMainPostSelect: true,
			});
			showPostsSelected();

			if (postElement) {
				postSelect.togglePostSelection(postElement, postElement.attr('data-pid'));
			}

			commit.on('click', () => {
				changeOwner();
			});

			autocomplete.user(modal.find('#username'), {filters: ['notbanned']}, (event, ui) => {
				toUid = ui.item.user.uid;
				checkButtonEnable();
			});
		});
	};

	function showPostsSelected() {
		if (postSelect.pids.length > 0) {
			modal.find('#pids').translateHtml('[[topic:fork_pid_count, ' + postSelect.pids.length + ']]');
		} else {
			modal.find('#pids').translateHtml('[[topic:fork_no_pids]]');
		}
	}

	function checkButtonEnable() {
		if (toUid && modal.find('#username').length > 0 && modal.find('#username').val().length > 0 && postSelect.pids.length > 0) {
			commit.removeAttr('disabled');
		} else {
			commit.attr('disabled', true);
		}
	}

	function onPostToggled() {
		checkButtonEnable();
		showPostsSelected();
	}

	function changeOwner() {
		if (!toUid) {
			return;
		}

		socket.emit('posts.changeOwner', {pids: postSelect.pids, toUid}, error => {
			if (error) {
				return alerts.error(error);
			}

			ajaxify.refresh();

			closeModal();
		});
	}

	function closeModal() {
		if (modal) {
			modal.remove();
			modal = null;
			postSelect.disable();
		}
	}

	return ChangeOwner;
});
