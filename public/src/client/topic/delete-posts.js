'use strict';

define('forum/topic/delete-posts', [
	'postSelect', 'alerts', 'api',
], (postSelect, alerts, api) => {
	const DeletePosts = {};
	let modal;
	let deleteButton;
	let purgeButton;
	let tid;

	DeletePosts.init = function () {
		tid = ajaxify.data.tid;

		$(window).off('action:ajaxify.end', onAjaxifyEnd).on('action:ajaxify.end', onAjaxifyEnd);

		if (modal) {
			return;
		}

		app.parseAndTranslate('partials/delete_posts_modal', {}, html => {
			modal = html;

			$('body').append(modal);

			deleteButton = modal.find('#delete_posts_confirm');
			purgeButton = modal.find('#purge_posts_confirm');

			modal.find('.close,#delete_posts_cancel').on('click', closeModal);

			postSelect.init(() => {
				checkButtonEnable();
				showPostsSelected();
			});
			showPostsSelected();

			deleteButton.on('click', () => {
				deletePosts(deleteButton, pid => `/posts/${pid}/state`);
			});
			purgeButton.on('click', () => {
				deletePosts(purgeButton, pid => `/posts/${pid}`);
			});
		});
	};

	function onAjaxifyEnd() {
		if (ajaxify.data.template.name !== 'topic' || ajaxify.data.tid !== tid) {
			closeModal();
			$(window).off('action:ajaxify.end', onAjaxifyEnd);
		}
	}

	function deletePosts(button, route) {
		button.attr('disabled', true);
		Promise.all(postSelect.pids.map(pid => api.delete(route(pid), {})))
			.then(closeModal)
			.catch(alerts.error)
			.finally(() => {
				button.removeAttr('disabled');
			});
	}

	function showPostsSelected() {
		if (postSelect.pids.length > 0) {
			modal.find('#pids').translateHtml('[[topic:fork_pid_count, ' + postSelect.pids.length + ']]');
		} else {
			modal.find('#pids').translateHtml('[[topic:fork_no_pids]]');
		}
	}

	function checkButtonEnable() {
		if (postSelect.pids.length > 0) {
			deleteButton.removeAttr('disabled');
			purgeButton.removeAttr('disabled');
		} else {
			deleteButton.attr('disabled', true);
			purgeButton.attr('disabled', true);
		}
	}

	function closeModal() {
		if (modal) {
			modal.remove();
			modal = null;
			postSelect.disable();
		}
	}

	return DeletePosts;
});
