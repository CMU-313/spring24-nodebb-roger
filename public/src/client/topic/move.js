'use strict';

define('forum/topic/move', ['categorySelector', 'alerts', 'hooks'], (categorySelector, alerts, hooks) => {
	const Move = {};
	let modal;
	let selectedCategory;

	Move.init = function (tids, currentCid, onComplete) {
		Move.tids = tids;
		Move.currentCid = currentCid;
		Move.onComplete = onComplete;
		Move.moveAll = !tids;

		showModal();
	};

	function showModal() {
		app.parseAndTranslate('partials/move_thread_modal', {}, html => {
			modal = html;
			modal.on('hidden.bs.modal', () => {
				modal.remove();
			});

			modal.find('#move-confirm').addClass('hide');

			if (Move.moveAll || (Move.tids && Move.tids.length > 1)) {
				modal.find('.modal-header h3').translateText('[[topic:move_topics]]');
			}

			categorySelector.init(modal.find('[component="category-selector"]'), {
				onSelect: onCategorySelected,
				privilege: 'moderate',
			});

			modal.find('#move_thread_commit').on('click', onCommitClicked);

			modal.modal('show');
		});
	}

	function onCategorySelected(category) {
		selectedCategory = category;
		modal.find('#move_thread_commit').prop('disabled', false);
	}

	function onCommitClicked() {
		const commitElement = modal.find('#move_thread_commit');

		if (!commitElement.prop('disabled') && selectedCategory && selectedCategory.cid) {
			commitElement.prop('disabled', true);

			modal.modal('hide');
			let message = '[[topic:topic_move_success, ' + selectedCategory.name + ']]';
			if (Move.tids && Move.tids.length > 1) {
				message = '[[topic:topic_move_multiple_success, ' + selectedCategory.name + ']]';
			} else if (!Move.tids) {
				message = '[[topic:topic_move_all_success, ' + selectedCategory.name + ']]';
			}

			const data = {
				tids: Move.tids ? Move.tids.slice() : null,
				cid: selectedCategory.cid,
				currentCid: Move.currentCid,
				onComplete: Move.onComplete,
			};
			if (config.undoTimeout > 0) {
				return alerts.alert({
					alert_id: 'tids_move_' + (Move.tids ? Move.tids.join('-') : 'all'),
					title: '[[topic:thread_tools.move]]',
					message,
					type: 'success',
					timeout: config.undoTimeout,
					timeoutfn() {
						moveTopics(data);
					},
					clickfn(alert, parameters) {
						delete parameters.timeoutfn;
						alerts.success('[[topic:topic_move_undone]]');
					},
				});
			}

			moveTopics(data);
		}
	}

	function moveTopics(data) {
		hooks.fire('action:topic.move', data);

		socket.emit(data.tids ? 'topics.move' : 'topics.moveAll', data, error => {
			if (error) {
				return alerts.error(error);
			}

			if (typeof data.onComplete === 'function') {
				data.onComplete();
			}
		});
	}

	return Move;
});
