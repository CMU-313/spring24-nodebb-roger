'use strict';

define('forum/account/blocks', [
	'forum/account/header',
	'api',
	'hooks',
	'alerts',
], (header, api, hooks, alerts) => {
	const Blocks = {};

	Blocks.init = function () {
		header.init();

		$('#user-search').on('keyup', function () {
			const username = this.value;

			api.get('/api/users', {
				query: username,
				searchBy: 'username',
				paginate: false,
			}, (error, data) => {
				if (error) {
					return alerts.error(error);
				}

				// Only show first 10 matches
				if (data.matchCount > 10) {
					data.users.length = 10;
				}

				app.parseAndTranslate('account/blocks', 'edit', {
					edit: data.users,
				}, html => {
					$('.block-edit').html(html);
				});
			});
		});

		$('.block-edit').on('click', '[data-action="toggle"]', function () {
			const uid = Number.parseInt(this.dataset.uid, 10);
			socket.emit('user.toggleBlock', {
				blockeeUid: uid,
				blockerUid: ajaxify.data.uid,
			}, Blocks.refreshList);
		});
	};

	Blocks.refreshList = function (error) {
		if (error) {
			return alerts.error(error);
		}

		$.get(config.relative_path + '/api/' + ajaxify.currentPage)
			.done(payload => {
				app.parseAndTranslate('account/blocks', 'users', payload, html => {
					$('#users-container').html(html);
					$('#users-container').siblings('div.alert')[html.length > 0 ? 'hide' : 'show']();
				});
				hooks.fire('action:user.blocks.toggle', {data: payload});
			})
			.fail(() => {
				ajaxify.go(ajaxify.currentPage);
			});
	};

	return Blocks;
});
