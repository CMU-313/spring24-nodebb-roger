'use strict';

const {utils} = require('sortablejs');

define('forum/topic/threadTools', [
	'components',
	'translator',
	'handleBack',
	'forum/topic/posts',
	'api',
	'hooks',
	'bootbox',
	'alerts',
], (components, translator, handleBack, posts, api, hooks, bootbox, alerts) => {
	const ThreadTools = {};

	ThreadTools.init = function (tid, topicContainer) {
		renderMenu(topicContainer);

		// Function topicCommand(method, path, command, onComplete) {
		topicContainer.on('click', '[component="topic/delete"]', () => {
			topicCommand('del', '/state', 'delete');
			return false;
		});

		topicContainer.on('click', '[component="topic/restore"]', () => {
			topicCommand('put', '/state', 'restore');
			return false;
		});

		topicContainer.on('click', '[component="topic/purge"]', () => {
			topicCommand('del', '', 'purge');
			return false;
		});

		topicContainer.on('click', '[component="topic/lock"]', () => {
			topicCommand('put', '/lock', 'lock');
			return false;
		});

		topicContainer.on('click', '[component="topic/unlock"]', () => {
			topicCommand('del', '/lock', 'unlock');
			return false;
		});

		topicContainer.on('click', '[component="topic/pin"]', () => {
			topicCommand('put', '/pin', 'pin');
			return false;
		});

		topicContainer.on('click', '[component="topic/unpin"]', () => {
			topicCommand('del', '/pin', 'unpin');
			return false;
		});

		topicContainer.on('click', '[component="topic/private"]', () => {
			topicCommand('put', '/private', 'private');
			return false;
		});

		topicContainer.on('click', '[component="topic/public"]', () => {
			topicCommand('del', '/private', 'public');
			return false;
		});

		topicContainer.on('click', '[component="topic/event/delete"]', function () {
			const eventId = $(this).attr('data-topic-event-id');
			const eventElement = $(this).parents('[component="topic/event"]');
			bootbox.confirm('[[topic:delete-event-confirm]]', ok => {
				if (ok) {
					api.del(`/topics/${tid}/events/${eventId}`, {})
						.then(() => {
							eventElement.remove();
						})
						.catch(alerts.error);
				}
			});
		});

		// Todo: should also use topicCommand, but no write api call exists for this yet
		topicContainer.on('click', '[component="topic/mark-unread"]', () => {
			socket.emit('topics.markUnread', tid, error => {
				if (error) {
					return alerts.error(error);
				}

				if (app.previousUrl && !app.previousUrl.match('^/topic')) {
					ajaxify.go(app.previousUrl, () => {
						handleBack.onBackClicked(true);
					});
				} else if (ajaxify.data.category) {
					ajaxify.go('category/' + ajaxify.data.category.slug, handleBack.onBackClicked);
				}

				alerts.success('[[topic:mark_unread.success]]');
			});
			return false;
		});

		topicContainer.on('click', '[component="topic/mark-unread-for-all"]', function () {
			const button = $(this);
			socket.emit('topics.markAsUnreadForAll', [tid], error => {
				if (error) {
					return alerts.error(error);
				}

				alerts.success('[[topic:markAsUnreadForAll.success]]');
				button.parents('.thread-tools.open').find('.dropdown-toggle').trigger('click');
			});
			return false;
		});

		topicContainer.on('click', '[component="topic/move"]', () => {
			require(['forum/topic/move'], move => {
				move.init([tid], ajaxify.data.cid);
			});
			return false;
		});

		topicContainer.on('click', '[component="topic/delete/posts"]', () => {
			require(['forum/topic/delete-posts'], deletePosts => {
				deletePosts.init();
			});
		});

		topicContainer.on('click', '[component="topic/fork"]', () => {
			require(['forum/topic/fork'], fork => {
				fork.init();
			});
		});

		topicContainer.on('click', '[component="topic/move-posts"]', () => {
			require(['forum/topic/move-post'], movePosts => {
				movePosts.init();
			});
		});

		topicContainer.on('click', '[component="topic/following"]', () => {
			changeWatching('follow');
		});
		topicContainer.on('click', '[component="topic/not-following"]', () => {
			changeWatching('follow', 0);
		});
		topicContainer.on('click', '[component="topic/ignoring"]', () => {
			changeWatching('ignore');
		});

		function changeWatching(type, state = 1) {
			const method = state ? 'put' : 'del';
			api[method](`/topics/${tid}/${type}`, {}, () => {
				let message = '';
				if (type === 'follow') {
					message = state ? '[[topic:following_topic.message]]' : '[[topic:not_following_topic.message]]';
				} else if (type === 'ignore') {
					message = state ? '[[topic:ignoring_topic.message]]' : '[[topic:not_following_topic.message]]';
				}

				// From here on out, type changes to 'unfollow' if state is falsy
				if (!state) {
					type = 'unfollow';
				}

				setFollowState(type);

				alerts.alert({
					alert_id: 'follow_thread',
					message,
					type: 'success',
					timeout: 5000,
				});

				hooks.fire('action:topics.changeWatching', {tid, type});
			}, () => {
				alerts.alert({
					type: 'danger',
					alert_id: 'topic_follow',
					title: '[[global:please_log_in]]',
					message: '[[topic:login_to_subscribe]]',
					timeout: 5000,
				});
			});

			return false;
		}
	};

	function renderMenu(container) {
		container.on('show.bs.dropdown', '.thread-tools', function () {
			const $this = $(this);
			const dropdownMenu = $this.find('.dropdown-menu');
			if (dropdownMenu.html()) {
				return;
			}

			dropdownMenu.toggleClass('hidden', true);
			socket.emit('topics.loadTopicTools', {tid: ajaxify.data.tid, cid: ajaxify.data.cid}, (error, data) => {
				if (error) {
					return alerts.error(error);
				}

				app.parseAndTranslate('partials/topic/topic-menu-list', data, html => {
					dropdownMenu.html(html);
					dropdownMenu.toggleClass('hidden', false);

					hooks.fire('action:topic.tools.load', {
						element: dropdownMenu,
					});
				});
			});
		});
	}

	function topicCommand(method, path, command, onComplete) {
		onComplete ||= function () {};

		const tid = ajaxify.data.tid;
		const body = {};
		const execute = function (ok) {
			if (ok) {
				api[method](`/topics/${tid}${path}`, body)
					.then(onComplete)
					.catch(alerts.error);
			}
		};

		switch (command) {
			case 'delete':
			case 'restore':
			case 'purge': {
				bootbox.confirm(`[[topic:thread_tools.${command}_confirm]]`, execute);
				break;
			}

			case 'pin': {
				ThreadTools.requestPinExpiry(body, execute.bind(null, true));
				break;
			}

			default: {
				execute(true);
				break;
			}
		}
	}

	ThreadTools.requestPinExpiry = function (body, onSuccess) {
		app.parseAndTranslate('modals/set-pin-expiry', {}, html => {
			const modal = bootbox.dialog({
				title: '[[topic:thread_tools.pin]]',
				message: html,
				onEscape: true,
				size: 'small',
				buttons: {
					cancel: {
						label: '[[modules:bootbox.cancel]]',
						className: 'btn-link',
					},
					save: {
						label: '[[global:save]]',
						className: 'btn-primary',
						callback() {
							const expiryElement = modal.get(0).querySelector('#expiry');
							let expiry = expiryElement.value;

							// No expiry set
							if (expiry === '') {
								return onSuccess();
							}

							// Expiration date set
							expiry = new Date(expiry);

							if (expiry && expiry.getTime() > Date.now()) {
								body.expiry = expiry.getTime();
								onSuccess();
							} else {
								alerts.error('[[error:invalid-date]]');
							}
						},
					},
				},
			});
		});
	};

	ThreadTools.setLockedState = function (data) {
		const threadElement = components.get('topic');
		if (Number.parseInt(data.tid, 10) !== Number.parseInt(threadElement.attr('data-tid'), 10)) {
			return;
		}

		const isLocked = data.isLocked && !ajaxify.data.privileges.isAdminOrMod;

		components.get('topic/lock').toggleClass('hidden', data.isLocked).parent().attr('hidden', data.isLocked ? '' : null);
		components.get('topic/unlock').toggleClass('hidden', !data.isLocked).parent().attr('hidden', data.isLocked ? null : '');

		const hideReply = Boolean((data.isLocked || ajaxify.data.deleted) && !ajaxify.data.privileges.isAdminOrMod);

		components.get('topic/reply/container').toggleClass('hidden', hideReply);
		components.get('topic/reply/locked').toggleClass('hidden', ajaxify.data.privileges.isAdminOrMod || !data.isLocked || ajaxify.data.deleted);

		threadElement.find('[component="post"]:not(.deleted) [component="post/reply"], [component="post"]:not(.deleted) [component="post/quote"]').toggleClass('hidden', hideReply);
		threadElement.find('[component="post/edit"], [component="post/delete"]').toggleClass('hidden', isLocked);

		threadElement.find('[component="post"][data-uid="' + app.user.uid + '"].deleted [component="post/tools"]').toggleClass('hidden', isLocked);

		$('[component="topic/labels"] [component="topic/locked"]').toggleClass('hidden', !data.isLocked);
		$('[component="post/tools"] .dropdown-menu').html('');
		ajaxify.data.locked = data.isLocked;

		posts.addTopicEvents(data.events);
	};

	ThreadTools.setPrivateState = function (data) {
		const threadElement = components.get('topic');
		if (Number.parseInt(data.tid, 10) !== Number.parseInt(threadElement.attr('data-tid'), 10)) {
			return;
		}

		components.get('topic/private').toggleClass('hidden', data.isPrivate).parent().attr('hidden', data.isPrivate ? '' : null);
		components.get('topic/public').toggleClass('hidden', !data.isPrivate).parent().attr('hidden', data.isPrivate ? null : '');

		/* If (data.isPrivate) {
            app.parseAndTranslate('partials/topic/privated-message', {
                privater: data.user,
                private: true,
                privatedTimestampISO: utils.toISOString(Date.now()),
            }, function (html) {
                components.get('topic/private/message').replaceWith(html);
                html.find('.timeago').timeago();
            });
        } */

		threadElement.toggleClass('private', data.isPrivate);
		ajaxify.data.private = data.isPrivate ? 1 : 0;

		posts.addTopicEvents(data.event);
	};

	ThreadTools.setDeleteState = function (data) {
		const threadElement = components.get('topic');
		if (Number.parseInt(data.tid, 10) !== Number.parseInt(threadElement.attr('data-tid'), 10)) {
			return;
		}

		components.get('topic/delete').toggleClass('hidden', data.isDelete).parent().attr('hidden', data.isDelete ? '' : null);
		components.get('topic/restore').toggleClass('hidden', !data.isDelete).parent().attr('hidden', data.isDelete ? null : '');
		components.get('topic/purge').toggleClass('hidden', !data.isDelete).parent().attr('hidden', data.isDelete ? null : '');
		components.get('topic/deleted/message').toggleClass('hidden', !data.isDelete);

		if (data.isDelete) {
			app.parseAndTranslate('partials/topic/deleted-message', {
				deleter: data.user,
				deleted: true,
				deletedTimestampISO: utils.toISOString(Date.now()),
			}, html => {
				components.get('topic/deleted/message').replaceWith(html);
				html.find('.timeago').timeago();
			});
		}

		const hideReply = data.isDelete && !ajaxify.data.privileges.isAdminOrMod;

		components.get('topic/reply/container').toggleClass('hidden', hideReply);
		components.get('topic/reply/locked').toggleClass('hidden', ajaxify.data.privileges.isAdminOrMod || !ajaxify.data.locked || data.isDelete);
		threadElement.find('[component="post"]:not(.deleted) [component="post/reply"], [component="post"]:not(.deleted) [component="post/quote"]').toggleClass('hidden', hideReply);

		threadElement.toggleClass('deleted', data.isDelete);
		ajaxify.data.deleted = data.isDelete ? 1 : 0;

		posts.addTopicEvents(data.events);
	};

	ThreadTools.setPinnedState = function (data) {
		const threadElement = components.get('topic');
		if (Number.parseInt(data.tid, 10) !== Number.parseInt(threadElement.attr('data-tid'), 10)) {
			return;
		}

		components.get('topic/pin').toggleClass('hidden', data.pinned).parent().attr('hidden', data.pinned ? '' : null);
		components.get('topic/unpin').toggleClass('hidden', !data.pinned).parent().attr('hidden', data.pinned ? null : '');
		const icon = $('[component="topic/labels"] [component="topic/pinned"]');
		icon.toggleClass('hidden', !data.pinned);
		if (data.pinned) {
			icon.translateAttr('title', (
				data.pinExpiry && data.pinExpiryISO
					? '[[topic:pinned-with-expiry, ' + data.pinExpiryISO + ']]'
					: '[[topic:pinned]]'
			));
		}

		ajaxify.data.pinned = data.pinned;

		posts.addTopicEvents(data.events);
	};

	function setFollowState(state) {
		const titles = {
			follow: '[[topic:watching]]',
			unfollow: '[[topic:not-watching]]',
			ignore: '[[topic:ignoring]]',
		};
		translator.translate(titles[state], translatedTitle => {
			$('[component="topic/watch"] button')
				.attr('title', translatedTitle)
				.tooltip('fixTitle');
		});

		let menu = components.get('topic/following/menu');
		menu.toggleClass('hidden', state !== 'follow');
		components.get('topic/following/check').toggleClass('fa-check', state === 'follow');

		menu = components.get('topic/not-following/menu');
		menu.toggleClass('hidden', state !== 'unfollow');
		components.get('topic/not-following/check').toggleClass('fa-check', state === 'unfollow');

		menu = components.get('topic/ignoring/menu');
		menu.toggleClass('hidden', state !== 'ignore');
		components.get('topic/ignoring/check').toggleClass('fa-check', state === 'ignore');
	}

	return ThreadTools;
});
