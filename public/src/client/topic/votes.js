'use strict';

define('forum/topic/votes', [
	'components', 'translator', 'api', 'hooks', 'bootbox', 'alerts',
], (components, translator, api, hooks, bootbox, alerts) => {
	const Votes = {};

	Votes.addVoteHandler = function () {
		components.get('topic').on('mouseenter', '[data-pid] [component="post/vote-count"]', loadDataAndCreateTooltip);
	};

	function loadDataAndCreateTooltip(e) {
		e.stopPropagation();

		const $this = $(this);
		const element = $this.parent();
		element.find('.tooltip').css('display', 'none');
		const pid = element.parents('[data-pid]').attr('data-pid');

		socket.emit('posts.getUpvoters', [pid], (error, data) => {
			if (error) {
				return alerts.error(error);
			}

			if (data.length > 0) {
				createTooltip($this, data[0]);
			}
		});
		return false;
	}

	function createTooltip(element, data) {
		function doCreateTooltip(title) {
			element.attr('title', title).tooltip('fixTitle').tooltip('show');
			element.parent().find('.tooltip').css('display', '');
		}

		let usernames = data.usernames
			.filter(name => name !== '[[global:former_user]]');
		if (usernames.length === 0) {
			return;
		}

		if (usernames.length + data.otherCount > 6) {
			usernames = usernames.join(', ').replaceAll(',', '|');
			translator.translate('[[topic:users_and_others, ' + usernames + ', ' + data.otherCount + ']]', translated => {
				translated = translated.replaceAll('|', ',');
				doCreateTooltip(translated);
			});
		} else {
			usernames = usernames.join(', ');
			doCreateTooltip(usernames);
		}
	}

	Votes.toggleVote = function (button, className, delta) {
		const post = button.closest('[data-pid]');
		const currentState = post.find(className).length;

		const method = currentState ? 'del' : 'put';
		const pid = post.attr('data-pid');
		api[method](`/posts/${pid}/vote`, {
			delta,
		}, error => {
			if (error) {
				if (!app.user.uid) {
					ajaxify.go('login');
					return;
				}

				return alerts.error(error);
			}

			hooks.fire('action:post.toggleVote', {
				pid,
				delta,
				unvote: method === 'del',
			});
		});

		return false;
	};

	Votes.showVotes = function (pid) {
		socket.emit('posts.getVoters', {pid, cid: ajaxify.data.cid}, (error, data) => {
			if (error) {
				if (error.message === '[[error:no-privileges]]') {
					return;
				}

				// Only show error if it's an unexpected error.
				return alerts.error(error);
			}

			app.parseAndTranslate('partials/modals/votes_modal', data, html => {
				const dialog = bootbox.dialog({
					title: '[[global:voters]]',
					message: html,
					className: 'vote-modal',
					show: true,
				});

				dialog.on('click', () => {
					dialog.modal('hide');
				});
			});
		});
	};

	return Votes;
});
