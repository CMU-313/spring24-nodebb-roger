'use strict';

define('forum/topic', [
	'forum/infinitescroll',
	'forum/topic/threadTools',
	'forum/topic/postTools',
	'forum/topic/events',
	'forum/topic/posts',
	'navigator',
	'sort',
	'components',
	'storage',
	'hooks',
	'api',
	'alerts',
], (
	infinitescroll, threadTools, postTools,
	events, posts, navigator, sort,
	components, storage, hooks, api, alerts,
) => {
	const Topic = {};
	let tid = 0;
	let currentUrl = '';

	$(window).on('action:ajaxify.start', (event, data) => {
		events.removeListeners();

		if (!String(data.url).startsWith('topic/')) {
			navigator.disable();
			components.get('navbar/title').find('span').text('').hide();
			alerts.remove('bookmark');
		}
	});

	Topic.init = function () {
		const tidChanged = !tid || Number.parseInt(tid, 10) !== Number.parseInt(ajaxify.data.tid, 10);
		tid = ajaxify.data.tid;
		currentUrl = ajaxify.currentPage;
		hooks.fire('action:topic.loading');

		app.enterRoom('topic_' + tid);

		if (tidChanged) {
			posts.signaturesShown = {};
		}

		posts.onTopicPageLoad(components.get('post'));
		navigator.init('[component="post"]', ajaxify.data.postcount, Topic.toTop, Topic.toBottom, utils.debounce(Topic.navigatorCallback, 500));

		postTools.init(tid);
		threadTools.init(tid, $('.topic'));
		events.init();

		sort.handleSort('topicPostSort', 'topic/' + ajaxify.data.slug);

		if (!config.usePagination) {
			infinitescroll.init($('[component="topic"]'), posts.loadMorePosts);
		}

		addBlockQuoteHandler();
		addParentHandler();
		addDropupHandler();
		addRepliesHandler();
		addPostsPreviewHandler();

		handleBookmark(tid);

		$(window).on('scroll', utils.debounce(updateTopicTitle, 250));

		handleTopicSearch();

		hooks.fire('action:topic.loaded', ajaxify.data);
	};

	function handleTopicSearch() {
		require(['mousetrap'], mousetrap => {
			if (config.topicSearchEnabled) {
				require(['search'], search => {
					mousetrap.bind(['command+f', 'ctrl+f'], e => {
						e.preventDefault();
						$('#search-fields input').val('in:topic-' + ajaxify.data.tid + ' ');
						search.showAndFocusInput();
					});

					hooks.onPage('action:ajaxify.cleanup', () => {
						mousetrap.unbind(['command+f', 'ctrl+f']);
					});
				});
			}

			mousetrap.bind('j', () => {
				const index = navigator.getIndex();
				const count = navigator.getCount();
				if (index === count) {
					return;
				}

				navigator.scrollToIndex(index, true, 0);
			});

			mousetrap.bind('k', () => {
				const index = navigator.getIndex();
				if (index === 1) {
					return;
				}

				navigator.scrollToIndex(index - 2, true, 0);
			});
		});
	}

	Topic.toTop = function () {
		navigator.scrollTop(0);
	};

	Topic.toBottom = function () {
		socket.emit('topics.postcount', ajaxify.data.tid, (error, postCount) => {
			if (error) {
				return alerts.error(error);
			}

			navigator.scrollBottom(postCount - 1);
		});
	};

	function handleBookmark(tid) {
		if (window.location.hash) {
			const element = $(utils.escapeHTML(window.location.hash));
			if (element.length > 0) {
				return navigator.scrollToElement(element, true, 0);
			}
		}

		const bookmark = ajaxify.data.bookmark || storage.getItem('topic:' + tid + ':bookmark');
		const postIndex = ajaxify.data.postIndex;

		if (postIndex > 1) {
			if (components.get('post/anchor', postIndex - 1).length > 0) {
				return navigator.scrollToPostIndex(postIndex - 1, true, 0);
			}
		} else if (bookmark && (
			!config.usePagination
            || (config.usePagination && ajaxify.data.pagination.currentPage === 1)
		) && ajaxify.data.postcount > ajaxify.data.bookmarkThreshold) {
			alerts.alert({
				alert_id: 'bookmark',
				message: '[[topic:bookmark_instructions]]',
				timeout: 0,
				type: 'info',
				clickfn() {
					navigator.scrollToIndex(Number.parseInt(bookmark, 10), true);
				},
				closefn() {
					storage.removeItem('topic:' + tid + ':bookmark');
				},
			});
			setTimeout(() => {
				alerts.remove('bookmark');
			}, 10_000);
		}
	}

	function addBlockQuoteHandler() {
		components.get('topic').on('click', 'blockquote .toggle', function () {
			const blockQuote = $(this).parent('blockquote');
			const toggle = $(this);
			blockQuote.toggleClass('uncollapsed');
			const collapsed = !blockQuote.hasClass('uncollapsed');
			toggle.toggleClass('fa-angle-down', collapsed).toggleClass('fa-angle-up', !collapsed);
		});
	}

	function addParentHandler() {
		components.get('topic').on('click', '[component="post/parent"]', function (e) {
			const toPid = $(this).attr('data-topid');

			const toPost = $('[component="topic"]>[component="post"][data-pid="' + toPid + '"]');
			if (toPost.length > 0) {
				e.preventDefault();
				navigator.scrollToIndex(toPost.attr('data-index'), true);
				return false;
			}
		});
	}

	Topic.applyDropup = function () {
		const containerRect = this.getBoundingClientRect();
		const dropdownElement = this.querySelector('.dropdown-menu');
		const dropdownStyle = window.getComputedStyle(dropdownElement);
		const dropdownHeight = dropdownStyle.getPropertyValue('height').slice(0, -2);
		const offset = 60;

		// Toggler position (including its height, since the menu spawns above it),
		// minus the dropdown's height and navbar offset
		const dropUp = (containerRect.top + containerRect.height - dropdownHeight - offset) > 0;
		this.classList.toggle('dropup', dropUp);
	};

	function addDropupHandler() {
		// Locate all dropdowns
		const target = $('#content .dropdown-menu').parent();
		$(target).on('shown.bs.dropdown', function () {
			const dropdownElement = this.querySelector('.dropdown-menu');
			if (dropdownElement.innerHTML) {
				Topic.applyDropup.call(this);
			}
		});
		hooks.onPage('action:topic.tools.load', ({element}) => {
			Topic.applyDropup.call(element.get(0).parentNode);
		});
		hooks.onPage('action:post.tools.load', ({element}) => {
			Topic.applyDropup.call(element.get(0).parentNode);
		});
	}

	function addRepliesHandler() {
		$('[component="topic"]').on('click', '[component="post/reply-count"]', function () {
			const button = $(this);
			require(['forum/topic/replies'], replies => {
				replies.init(button);
			});
		});
	}

	function addPostsPreviewHandler() {
		if (!ajaxify.data.showPostPreviewsOnHover || utils.isMobile()) {
			return;
		}

		let timeoutId = 0;
		const postCache = {};
		$(window).one('action:ajaxify.start', () => {
			clearTimeout(timeoutId);
			$('#post-tooltip').remove();
		});
		$('[component="topic"]').on('mouseenter', '[component="post"] a, [component="topic/event"] a', async function () {
			const link = $(this);

			async function renderPost(pid) {
				const postData = postCache[pid] || await socket.emit('posts.getPostSummaryByPid', {pid});
				$('#post-tooltip').remove();
				if (postData && ajaxify.data.template.topic) {
					postCache[pid] = postData;
					const tooltip = await app.parseAndTranslate('partials/topic/post-preview', {post: postData});
					tooltip.hide().find('.timeago').timeago();
					tooltip.appendTo($('body')).fadeIn(300);
					const postContent = link.parents('[component="topic"]').find('[component="post/content"]').first();
					const postRect = postContent.offset();
					const postWidth = postContent.width();
					const linkRect = link.offset();
					tooltip.css({
						top: linkRect.top + 30,
						left: postRect.left,
						width: postWidth,
					});
				}
			}

			const href = link.attr('href');
			const location = utils.urlToLocation(href);
			const pathname = location.pathname;
			const validHref = href && href !== '#' && window.location.hostname === location.hostname;
			$('#post-tooltip').remove();
			const postMatch = validHref && pathname && pathname.match(/\/post\/(\d+)/);
			const topicMatch = validHref && pathname && pathname.match(/\/topic\/(\d+)/);
			if (postMatch) {
				const pid = postMatch[1];
				if (Number.parseInt(link.parents('[component="post"]').attr('data-pid'), 10) === Number.parseInt(pid, 10)) {
					return; // Dont render self post
				}

				timeoutId = setTimeout(async () => {
					renderPost(pid);
				}, 300);
			} else if (topicMatch) {
				timeoutId = setTimeout(async () => {
					const tid = topicMatch[1];
					const topicData = await api.get('/topics/' + tid, {});
					renderPost(topicData.mainPid);
				}, 300);
			}
		}).on('mouseleave', '[component="post"] a, [component="topic/event"] a', () => {
			clearTimeout(timeoutId);
			$('#post-tooltip').remove();
		});
	}

	function updateTopicTitle() {
		const span = components.get('navbar/title').find('span');
		if ($(window).scrollTop() > 50 && span.hasClass('hidden')) {
			span.html(ajaxify.data.title).removeClass('hidden');
		} else if ($(window).scrollTop() <= 50 && !span.hasClass('hidden')) {
			span.html('').addClass('hidden');
		}

		if ($(window).scrollTop() > 300) {
			alerts.remove('bookmark');
		}
	}

	Topic.navigatorCallback = function (index, elementCount) {
		if (!ajaxify.data.template.topic || navigator.scrollActive) {
			return;
		}

		const newUrl = 'topic/' + ajaxify.data.slug + (index > 1 ? ('/' + index) : '');
		if (newUrl !== currentUrl) {
			currentUrl = newUrl;

			if (index >= elementCount && app.user.uid) {
				socket.emit('topics.markAsRead', [ajaxify.data.tid]);
			}

			updateUserBookmark(index);

			Topic.replaceURLTimeout = 0;
			if (ajaxify.data.updateUrlWithPostIndex && history.replaceState) {
				let search = window.location.search || '';
				if (!config.usePagination) {
					search = (search && !/^\?page=\d+$/.test(search) ? search : '');
				}

				history.replaceState({
					url: newUrl + search,
				}, null, window.location.protocol + '//' + window.location.host + config.relative_path + '/' + newUrl + search);
			}
		}
	};

	function updateUserBookmark(index) {
		const bookmarkKey = 'topic:' + ajaxify.data.tid + ':bookmark';
		const currentBookmark = ajaxify.data.bookmark || storage.getItem(bookmarkKey);
		if (config.topicPostSort === 'newest_to_oldest') {
			index = Math.max(1, ajaxify.data.postcount - index + 2);
		}

		if (
			ajaxify.data.postcount > ajaxify.data.bookmarkThreshold
            && (
            	!currentBookmark
                || Number.parseInt(index, 10) > Number.parseInt(currentBookmark, 10)
                || ajaxify.data.postcount < Number.parseInt(currentBookmark, 10)
            )
		) {
			if (app.user.uid) {
				socket.emit('topics.bookmark', {
					tid: ajaxify.data.tid,
					index,
				}, error => {
					if (error) {
						return alerts.error(error);
					}

					ajaxify.data.bookmark = index + 1;
				});
			} else {
				storage.setItem(bookmarkKey, index);
			}
		}

		// Removes the bookmark alert when we get to / past the bookmark
		if (!currentBookmark || Number.parseInt(index, 10) >= Number.parseInt(currentBookmark, 10)) {
			alerts.remove('bookmark');
		}
	}

	return Topic;
});
