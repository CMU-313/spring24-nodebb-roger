'use strict';

define('topicList', [
	'forum/infinitescroll',
	'handleBack',
	'topicSelect',
	'categoryFilter',
	'forum/category/tools',
	'hooks',
], (infinitescroll, handleBack, topicSelect, categoryFilter, categoryTools, hooks) => {
	const TopicList = {};
	let templateName = '';

	let newTopicCount = 0;
	let newPostCount = 0;

	let loadTopicsCallback;
	let topicListElement;

	const scheduledTopics = [];

	$(window).on('action:ajaxify.start', () => {
		TopicList.removeListeners();
		categoryTools.removeListeners();
	});

	TopicList.init = function (template, callback) {
		topicListElement = findTopicListElement();

		templateName = template;
		loadTopicsCallback = callback || loadTopicsAfter;

		categoryTools.init();

		TopicList.watchForNewPosts();
		const states = ['watching'];
		if (ajaxify.data.selectedFilter && ajaxify.data.selectedFilter.filter === 'watched') {
			states.push('notwatching', 'ignoring');
		} else if (template !== 'unread') {
			states.push('notwatching');
		}

		categoryFilter.init($('[component="category/dropdown"]'), {
			states,
		});

		if (!config.usePagination) {
			infinitescroll.init(TopicList.loadMoreTopics);
		}

		handleBack.init((after, handleBackCallback) => {
			loadTopicsCallback(after, 1, (data, loadCallback) => {
				onTopicsLoaded(templateName, data.topics, ajaxify.data.showSelect, 1, () => {
					handleBackCallback();
					loadCallback();
				});
			});
		});

		if ($('body').height() <= $(window).height() && topicListElement.children().length >= 20) {
			$('#load-more-btn').show();
		}

		$('#load-more-btn').on('click', () => {
			TopicList.loadMoreTopics(1);
		});

		hooks.fire('action:topics.loaded', {topics: ajaxify.data.topics});
	};

	function findTopicListElement() {
		return $('[component="category"]').filter((i, e) => $(e).parents('[widget-area],[data-widget-area]').length === 0);
	}

	TopicList.watchForNewPosts = function () {
		$('#new-topics-alert').on('click', function () {
			$(this).addClass('hide');
		});
		newPostCount = 0;
		newTopicCount = 0;
		TopicList.removeListeners();
		socket.on('event:new_topic', onNewTopic);
		socket.on('event:new_post', onNewPost);
	};

	TopicList.removeListeners = function () {
		socket.removeListener('event:new_topic', onNewTopic);
		socket.removeListener('event:new_post', onNewPost);
	};

	function onNewTopic(data) {
		const d = ajaxify.data;

		const categories = d.selectedCids
            && d.selectedCids.length
            && !d.selectedCids.includes(Number.parseInt(data.cid, 10));
		const filterWatched = d.selectedFilter
            && d.selectedFilter.filter === 'watched';
		const category = d.template.category
            && Number.parseInt(d.cid, 10) !== Number.parseInt(data.cid, 10);

		const preventAlert = Boolean(categories || filterWatched || category || scheduledTopics.includes(data.tid));
		hooks.fire('filter:topicList.onNewTopic', {topic: data, preventAlert}).then(result => {
			if (result.preventAlert) {
				return;
			}

			if (data.scheduled && data.tid) {
				scheduledTopics.push(data.tid);
			}

			newTopicCount += 1;
			updateAlertText();
		});
	}

	function onNewPost(data) {
		const post = data.posts[0];
		if (!post || !post.topic || post.topic.isFollowing) {
			return;
		}

		const d = ajaxify.data;

		const isMain = Number.parseInt(post.topic.mainPid, 10) === Number.parseInt(post.pid, 10);
		const categories = d.selectedCids
            && d.selectedCids.length
            && !d.selectedCids.includes(Number.parseInt(post.topic.cid, 10));
		const filterNew = d.selectedFilter
            && d.selectedFilter.filter === 'new';
		const filterWatched = d.selectedFilter
            && d.selectedFilter.filter === 'watched'
            && !post.topic.isFollowing;
		const category = d.template.category
            && Number.parseInt(d.cid, 10) !== Number.parseInt(post.topic.cid, 10);

		const preventAlert = Boolean(isMain || categories || filterNew || filterWatched || category);
		hooks.fire('filter:topicList.onNewPost', {post, preventAlert}).then(result => {
			if (result.preventAlert) {
				return;
			}

			newPostCount += 1;
			updateAlertText();
		});
	}

	function updateAlertText() {
		let text = '';

		if (newTopicCount === 0) {
			if (newPostCount === 1) {
				text = '[[recent:there-is-a-new-post]]';
			} else if (newPostCount > 1) {
				text = '[[recent:there-are-new-posts, ' + newPostCount + ']]';
			}
		} else if (newTopicCount === 1) {
			if (newPostCount === 0) {
				text = '[[recent:there-is-a-new-topic]]';
			} else if (newPostCount === 1) {
				text = '[[recent:there-is-a-new-topic-and-a-new-post]]';
			} else if (newPostCount > 1) {
				text = '[[recent:there-is-a-new-topic-and-new-posts, ' + newPostCount + ']]';
			}
		} else if (newTopicCount > 1) {
			if (newPostCount === 0) {
				text = '[[recent:there-are-new-topics, ' + newTopicCount + ']]';
			} else if (newPostCount === 1) {
				text = '[[recent:there-are-new-topics-and-a-new-post, ' + newTopicCount + ']]';
			} else if (newPostCount > 1) {
				text = '[[recent:there-are-new-topics-and-new-posts, ' + newTopicCount + ', ' + newPostCount + ']]';
			}
		}

		text += ' [[recent:click-here-to-reload]]';

		$('#new-topics-alert').translateText(text).removeClass('hide').fadeIn('slow');
		$('#category-no-topics').addClass('hide');
	}

	TopicList.loadMoreTopics = function (direction) {
		if (topicListElement.length === 0 || topicListElement.children().length === 0) {
			return;
		}

		const topics = topicListElement.find('[component="category/topic"]');
		const afterElement = direction > 0 ? topics.last() : topics.first();
		const after = (Number.parseInt(afterElement.attr('data-index'), 10) || 0) + (direction > 0 ? 1 : 0);

		if (!utils.isNumber(after) || (after === 0 && topicListElement.find('[component="category/topic"][data-index="0"]').length > 0)) {
			return;
		}

		loadTopicsCallback(after, direction, (data, done) => {
			onTopicsLoaded(templateName, data.topics, ajaxify.data.showSelect, direction, done);
		});
	};

	function calculateNextPage(after, direction) {
		return Math.floor(after / config.topicsPerPage) + (direction > 0 ? 1 : 0);
	}

	function loadTopicsAfter(after, direction, callback) {
		callback ||= function () {};
		const query = utils.params();
		query.page = calculateNextPage(after, direction);
		infinitescroll.loadMoreXhr(query, callback);
	}

	function filterTopicsOnDom(topics) {
		return topics.filter(topic => topicListElement.find('[component="category/topic"][data-tid="' + topic.tid + '"]').length === 0);
	}

	function onTopicsLoaded(templateName, topics, showSelect, direction, callback) {
		if (!topics || topics.length === 0) {
			$('#load-more-btn').hide();
			return callback();
		}

		topics = filterTopicsOnDom(topics);

		if (topics.length === 0) {
			$('#load-more-btn').hide();
			return callback();
		}

		let after;
		let before;
		const topicEls = topicListElement.find('[component="category/topic"]');

		if (direction > 0 && topics.length > 0) {
			after = topicEls.last();
		} else if (direction < 0 && topics.length > 0) {
			before = topicEls.first();
		}

		const tplData = {
			topics,
			showSelect,
			template: {
				name: templateName,
			},
		};
		tplData.template[templateName] = true;

		hooks.fire('action:topics.loading', {topics, after, before});

		app.parseAndTranslate(templateName, 'topics', tplData, html => {
			topicListElement.removeClass('hidden');
			$('#category-no-topics').remove();

			if (after && after.length > 0) {
				html.insertAfter(after);
			} else if (before && before.length > 0) {
				const height = $(document).height();
				const scrollTop = $(window).scrollTop();

				html.insertBefore(before);

				$(window).scrollTop(scrollTop + ($(document).height() - height));
			} else {
				topicListElement.append(html);
			}

			if (topicSelect.getSelectedTids().length === 0) {
				infinitescroll.removeExtra(topicListElement.find('[component="category/topic"]'), direction, Math.max(60, config.topicsPerPage * 3));
			}

			html.find('.timeago').timeago();
			app.createUserTooltips(html);
			utils.makeNumbersHumanReadable(html.find('.human-readable-number'));
			hooks.fire('action:topics.loaded', {topics, template: templateName});
			callback();
		});
	}

	return TopicList;
});
