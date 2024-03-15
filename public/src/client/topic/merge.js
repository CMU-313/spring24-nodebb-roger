'use strict';

define('forum/topic/merge', ['search', 'alerts', 'api'], (search, alerts, api) => {
	const Merge = {};
	let modal;
	let mergeButton;

	let selectedTids = {};

	Merge.init = function (callback) {
		callback ||= function () {};
		if (modal) {
			return;
		}

		app.parseAndTranslate('partials/merge_topics_modal', {}, html => {
			modal = html;

			$('body').append(modal);

			mergeButton = modal.find('#merge_topics_confirm');

			modal.find('.close,#merge_topics_cancel').on('click', closeModal);

			$('#content').on('click', '[component="topic/select"]', onTopicClicked);

			showTopicsSelected();

			mergeButton.on('click', () => {
				mergeTopics(mergeButton);
			});

			search.enableQuickSearch({
				searchElements: {
					inputEl: modal.find('.topic-search-input'),
					resultEl: modal.find('.quick-search-container'),
				},
				searchOptions: {
					in: 'titles',
				},
			});
			modal.on('click', '[data-tid]', function () {
				if ($(this).attr('data-tid')) {
					Merge.addTopic($(this).attr('data-tid'));
				}

				return false;
			});

			callback();
		});
	};

	Merge.addTopic = function (tid, callback) {
		callback ||= function () {};
		api.get(`/topics/${tid}`, {}).then(topicData => {
			const title = topicData ? topicData.title : 'No title';
			if (selectedTids[tid]) {
				delete selectedTids[tid];
			} else {
				selectedTids[tid] = title;
			}

			checkButtonEnable();
			showTopicsSelected();
			callback();
		}).catch(alerts.error);
	};

	function onTopicClicked(event) {
		if (!modal) {
			return;
		}

		const tid = $(this).parents('[component="category/topic"]').attr('data-tid');
		Merge.addTopic(tid);

		event.preventDefault();
		event.stopPropagation();
		return false;
	}

	function mergeTopics(button) {
		button.attr('disabled', true);
		const tids = Object.keys(selectedTids);
		const options = {};
		if (modal.find('.merge-main-topic-radio').is(':checked')) {
			options.mainTid = modal.find('.merge-main-topic-select').val();
		} else if (modal.find('.merge-new-title-radio').is(':checked')) {
			options.newTopicTitle = modal.find('.merge-new-title-input').val();
		}

		socket.emit('topics.merge', {tids, options}, (error, tid) => {
			button.removeAttr('disabled');
			if (error) {
				return alerts.error(error);
			}

			ajaxify.go('/topic/' + tid);
			closeModal();
		});
	}

	function showTopicsSelected() {
		if (!modal) {
			return;
		}

		const tids = Object.keys(selectedTids);
		tids.sort((a, b) => a - b);

		const topics = tids.map(tid => ({tid, title: selectedTids[tid]}));

		if (tids.length > 0) {
			app.parseAndTranslate('partials/merge_topics_modal', {
				config,
				topics,
			}, html => {
				modal.find('.topics-section').html(html.find('.topics-section').html());
				modal.find('.merge-main-topic-select').html(html.find('.merge-main-topic-select').html());
			});
		} else {
			modal.find('.topics-section').translateHtml('[[error:no-topics-selected]]');
		}
	}

	function checkButtonEnable() {
		if (Object.keys(selectedTids).length > 0) {
			mergeButton.removeAttr('disabled');
		} else {
			mergeButton.attr('disabled', true);
		}
	}

	function closeModal() {
		if (modal) {
			modal.remove();
			modal = null;
		}

		selectedTids = {};
		$('#content').off('click', '[component="topic/select"]', onTopicClicked);
	}

	return Merge;
});
