'use strict';

define('forum/category', [
	'forum/infinitescroll',
	'share',
	'navigator',
	'topicList',
	'sort',
	'categorySelector',
	'hooks',
	'alerts',
], (infinitescroll, share, navigator, topicList, sort, categorySelector, hooks, alerts) => {
	const Category = {};

	$(window).on('action:ajaxify.start', (event, data) => {
		if (!String(data.url).startsWith('category/')) {
			navigator.disable();
		}
	});

	Category.init = function () {
		const cid = ajaxify.data.cid;

		app.enterRoom('category_' + cid);

		share.addShareHandlers(ajaxify.data.name);

		topicList.init('category', loadTopicsAfter);

		sort.handleSort('categoryTopicSort', 'category/' + ajaxify.data.slug);

		if (config.usePagination) {
			navigator.disable();
		} else {
			navigator.init('[component="category/topic"]', ajaxify.data.topic_count, Category.toTop, Category.toBottom, Category.navigatorCallback);
		}

		handleScrollToTopicIndex();

		handleIgnoreWatch(cid);

		handleLoadMoreSubcategories();

		categorySelector.init($('[component="category-selector"]'), {
			privilege: 'find',
			parentCid: ajaxify.data.cid,
			onSelect(category) {
				ajaxify.go('/category/' + category.cid);
			},
		});

		hooks.fire('action:topics.loaded', {topics: ajaxify.data.topics});
		hooks.fire('action:category.loaded', {cid: ajaxify.data.cid});
	};

	function handleScrollToTopicIndex() {
		let topicIndex = ajaxify.data.topicIndex;
		if (topicIndex && utils.isNumber(topicIndex)) {
			topicIndex = Math.max(0, Number.parseInt(topicIndex, 10));
			if (topicIndex && !window.location.search.includes('page=')) {
				navigator.scrollToElement($('[component="category/topic"][data-index="' + topicIndex + '"]'), true, 0);
			}
		}
	}

	function handleIgnoreWatch(cid) {
		$('[component="category/watching"], [component="category/ignoring"], [component="category/notwatching"]').on('click', function () {
			const $this = $(this);
			const state = $this.attr('data-state');

			socket.emit('categories.setWatchState', {cid, state}, error => {
				if (error) {
					return alerts.error(error);
				}

				$('[component="category/watching/menu"]').toggleClass('hidden', state !== 'watching');
				$('[component="category/watching/check"]').toggleClass('fa-check', state === 'watching');

				$('[component="category/notwatching/menu"]').toggleClass('hidden', state !== 'notwatching');
				$('[component="category/notwatching/check"]').toggleClass('fa-check', state === 'notwatching');

				$('[component="category/ignoring/menu"]').toggleClass('hidden', state !== 'ignoring');
				$('[component="category/ignoring/check"]').toggleClass('fa-check', state === 'ignoring');

				alerts.success('[[category:' + state + '.message]]');
			});
		});
	}

	function handleLoadMoreSubcategories() {
		$('[component="category/load-more-subcategories"]').on('click', function () {
			const button = $(this);
			socket.emit('categories.loadMoreSubCategories', {
				cid: ajaxify.data.cid,
				start: ajaxify.data.nextSubCategoryStart,
			}, (error, data) => {
				if (error) {
					return alerts.error(error);
				}

				button.toggleClass('hidden', data.length === 0 || data.length < ajaxify.data.subCategoriesPerPage);
				if (data.length === 0) {
					return;
				}

				app.parseAndTranslate('category', 'children', {children: data}, html => {
					html.find('.timeago').timeago();
					$('[component="category/subcategory/container"]').append(html);
					utils.makeNumbersHumanReadable(html.find('.human-readable-number'));
					app.createUserTooltips(html);
					ajaxify.data.nextSubCategoryStart += ajaxify.data.subCategoriesPerPage;
					ajaxify.data.subCategoriesLeft -= data.length;
					button.toggleClass('hidden', ajaxify.data.subCategoriesLeft <= 0)
						.translateText('[[category:x-more-categories, ' + ajaxify.data.subCategoriesLeft + ']]');
				});
			});
			return false;
		});
	}

	Category.toTop = function () {
		navigator.scrollTop(0);
	};

	Category.toBottom = function () {
		socket.emit('categories.getTopicCount', ajaxify.data.cid, (error, count) => {
			if (error) {
				return alerts.error(error);
			}

			navigator.scrollBottom(count - 1);
		});
	};

	Category.navigatorCallback = function (topIndex, bottomIndex) {
		return bottomIndex;
	};

	function loadTopicsAfter(after, direction, callback) {
		callback ||= function () {};

		hooks.fire('action:topics.loading');
		const parameters = utils.params();
		infinitescroll.loadMore('categories.loadMore', {
			cid: ajaxify.data.cid,
			after,
			direction,
			query: parameters,
			categoryTopicSort: config.categoryTopicSort,
		}, (data, done) => {
			hooks.fire('action:topics.loaded', {topics: data.topics});
			callback(data, done);
		});
	}

	return Category;
});
