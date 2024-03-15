
'use strict';

define('forum/category/tools', [
	'topicSelect',
	'forum/topic/threadTools',
	'components',
	'api',
	'bootbox',
	'alerts',
], (topicSelect, threadTools, components, api, bootbox, alerts) => {
	const CategoryTools = {};

	CategoryTools.init = function () {
		topicSelect.init(updateDropdownOptions);

		handlePinnedTopicSort();

		components.get('topic/delete').on('click', () => {
			categoryCommand('del', '/state', 'delete', onDeletePurgeComplete);
			return false;
		});

		components.get('topic/restore').on('click', () => {
			categoryCommand('put', '/state', 'restore', onDeletePurgeComplete);
			return false;
		});

		components.get('topic/purge').on('click', () => {
			categoryCommand('del', '', 'purge', onDeletePurgeComplete);
			return false;
		});

		components.get('topic/lock').on('click', () => {
			categoryCommand('put', '/lock', 'lock', onCommandComplete);
			return false;
		});

		components.get('topic/unlock').on('click', () => {
			categoryCommand('del', '/lock', 'unlock', onCommandComplete);
			return false;
		});

		components.get('topic/private').on('click', () => {
			categoryCommand('put', '/private', 'private', onCommandComplete);
			return false;
		});

		components.get('topic/public').on('click', () => {
			categoryCommand('del', '/private', 'public', onCommandComplete);
			return false;
		});

		components.get('topic/pin').on('click', () => {
			categoryCommand('put', '/pin', 'pin', onCommandComplete);
			return false;
		});

		components.get('topic/unpin').on('click', () => {
			categoryCommand('del', '/pin', 'unpin', onCommandComplete);
			return false;
		});

		// Todo: should also use categoryCommand, but no write api call exists for this yet
		components.get('topic/mark-unread-for-all').on('click', () => {
			const tids = topicSelect.getSelectedTids();
			if (tids.length === 0) {
				return alerts.error('[[error:no-topics-selected]]');
			}

			socket.emit('topics.markAsUnreadForAll', tids, error => {
				if (error) {
					return alerts.error(error);
				}

				alerts.success('[[topic:markAsUnreadForAll.success]]');
				for (const tid of tids) {
					$('[component="category/topic"][data-tid="' + tid + '"]').addClass('unread');
				}

				onCommandComplete();
			});
			return false;
		});

		components.get('topic/move').on('click', () => {
			require(['forum/topic/move'], move => {
				const tids = topicSelect.getSelectedTids();

				if (tids.length === 0) {
					return alerts.error('[[error:no-topics-selected]]');
				}

				move.init(tids, null, onCommandComplete);
			});

			return false;
		});

		components.get('topic/move-all').on('click', () => {
			const cid = ajaxify.data.cid;
			if (!ajaxify.data.template.category) {
				return alerts.error('[[error:invalid-data]]');
			}

			require(['forum/topic/move'], move => {
				move.init(null, cid, error => {
					if (error) {
						return alerts.error(error);
					}

					ajaxify.refresh();
				});
			});
		});

		components.get('topic/merge').on('click', () => {
			const tids = topicSelect.getSelectedTids();
			require(['forum/topic/merge'], merge => {
				merge.init(() => {
					if (tids.length > 0) {
						for (const tid of tids) {
							merge.addTopic(tid);
						}
					}
				});
			});
		});

		CategoryTools.removeListeners();
		socket.on('event:topic_deleted', setDeleteState);
		socket.on('event:topic_restored', setDeleteState);
		socket.on('event:topic_purged', onTopicPurged);
		socket.on('event:topic_locked', setLockedState);
		socket.on('event:topic_unlocked', setLockedState);
		socket.on('event:topic_private', setPrivateState);
		socket.on('event:topic_public', setPrivateState);
		socket.on('event:topic_pinned', setPinnedState);
		socket.on('event:topic_unpinned', setPinnedState);
		socket.on('event:topic_moved', onTopicMoved);
	};

	function categoryCommand(method, path, command, onComplete) {
		onComplete ||= function () {};

		const tids = topicSelect.getSelectedTids();
		const body = {};
		const execute = function (ok) {
			if (ok) {
				Promise.all(tids.map(tid => api[method](`/topics/${tid}${path}`, body)))
					.then(onComplete)
					.catch(alerts.error);
			}
		};

		if (tids.length === 0) {
			return alerts.error('[[error:no-topics-selected]]');
		}

		switch (command) {
			case 'delete':
			case 'restore':
			case 'purge': {
				bootbox.confirm(`[[topic:thread_tools.${command}_confirm]]`, execute);
				break;
			}

			case 'pin': {
				threadTools.requestPinExpiry(body, execute.bind(null, true));
				break;
			}

			default: {
				execute(true);
				break;
			}
		}
	}

	CategoryTools.removeListeners = function () {
		socket.removeListener('event:topic_deleted', setDeleteState);
		socket.removeListener('event:topic_restored', setDeleteState);
		socket.removeListener('event:topic_purged', onTopicPurged);
		socket.removeListener('event:topic_locked', setLockedState);
		socket.removeListener('event:topic_unlocked', setLockedState);
		socket.removeListener('event:topic_private', setPrivateState);
		socket.removeListener('event:topic_public', setPrivateState);
		socket.removeListener('event:topic_pinned', setPinnedState);
		socket.removeListener('event:topic_unpinned', setPinnedState);
		socket.removeListener('event:topic_moved', onTopicMoved);
	};

	function closeDropDown() {
		$('.thread-tools.open').find('.dropdown-toggle').trigger('click');
	}

	function onCommandComplete() {
		closeDropDown();
		topicSelect.unselectAll();
	}

	function onDeletePurgeComplete() {
		closeDropDown();
		updateDropdownOptions();
	}

	function updateDropdownOptions() {
		const tids = topicSelect.getSelectedTids();
		const isAnyDeleted = isAny(isTopicDeleted, tids);
		const areAllDeleted = areAll(isTopicDeleted, tids);
		const isAnyPinned = isAny(isTopicPinned, tids);
		const isAnyLocked = isAny(isTopicLocked, tids);
		const isAnyScheduled = isAny(isTopicScheduled, tids);
		const areAllScheduled = areAll(isTopicScheduled, tids);

		components.get('topic/delete').toggleClass('hidden', isAnyDeleted);
		components.get('topic/restore').toggleClass('hidden', isAnyScheduled || !isAnyDeleted);
		components.get('topic/purge').toggleClass('hidden', !areAllDeleted);

		components.get('topic/lock').toggleClass('hidden', isAnyLocked);
		components.get('topic/unlock').toggleClass('hidden', !isAnyLocked);

		components.get('topic/pin').toggleClass('hidden', areAllScheduled || isAnyPinned);
		components.get('topic/unpin').toggleClass('hidden', areAllScheduled || !isAnyPinned);

		components.get('topic/merge').toggleClass('hidden', isAnyScheduled);
	}

	function isAny(method, tids) {
		for (const tid of tids) {
			if (method(tid)) {
				return true;
			}
		}

		return false;
	}

	function areAll(method, tids) {
		for (const tid of tids) {
			if (!method(tid)) {
				return false;
			}
		}

		return true;
	}

	function isTopicDeleted(tid) {
		return getTopicElement(tid).hasClass('deleted');
	}

	function isTopicLocked(tid) {
		return getTopicElement(tid).hasClass('locked');
	}

	function isTopicPinned(tid) {
		return getTopicElement(tid).hasClass('pinned');
	}

	function isTopicScheduled(tid) {
		return getTopicElement(tid).hasClass('scheduled');
	}

	function getTopicElement(tid) {
		return components.get('category/topic', 'tid', tid);
	}

	function setDeleteState(data) {
		const topic = getTopicElement(data.tid);
		topic.toggleClass('deleted', data.isDeleted);
		topic.find('[component="topic/locked"]').toggleClass('hide', !data.isDeleted);
	}

	function setPrivateState(data) {
		const topic = getTopicElement(data.tid);
		topic.toggleClass('private', data.isPrivate);
		topic.find('[component="topic/locked"]').toggleClass('hide', !data.isPrivate);
	}

	function setPinnedState(data) {
		const topic = getTopicElement(data.tid);
		topic.toggleClass('pinned', data.isPinned);
		topic.find('[component="topic/pinned"]').toggleClass('hide', !data.isPinned);
		ajaxify.refresh();
	}

	function setLockedState(data) {
		const topic = getTopicElement(data.tid);
		topic.toggleClass('locked', data.isLocked);
		topic.find('[component="topic/locked"]').toggleClass('hide', !data.isLocked);
	}

	function onTopicMoved(data) {
		getTopicElement(data.tid).remove();
	}

	function onTopicPurged(data) {
		getTopicElement(data.tid).remove();
	}

	function handlePinnedTopicSort() {
		if (!ajaxify.data.topics || !ajaxify.data.template.category) {
			return;
		}

		const numberPinned = ajaxify.data.topics.filter(topic => topic.pinned).length;
		if ((!app.user.isAdmin && !app.user.isMod) || numberPinned < 2) {
			return;
		}

		app.loadJQueryUI(() => {
			const topicListElement = $('[component="category"]').filter((i, e) => $(e).parents('[widget-area],[data-widget-area]').length === 0);
			let baseIndex = 0;
			topicListElement.sortable({
				handle: '[component="topic/pinned"]',
				items: '[component="category/topic"].pinned',
				start() {
					baseIndex = Number.parseInt(topicListElement.find('[component="category/topic"].pinned').first().attr('data-index'), 10);
				},
				update(event, ui) {
					socket.emit('topics.orderPinnedTopics', {
						tid: ui.item.attr('data-tid'),
						order: baseIndex + ui.item.index(),
					}, error => {
						if (error) {
							return alerts.error(error);
						}

						topicListElement.find('[component="category/topic"].pinned').each((index, element) => {
							$(element).attr('data-index', baseIndex + index);
						});
					});
				},
			});
		});
	}

	return CategoryTools;
});
