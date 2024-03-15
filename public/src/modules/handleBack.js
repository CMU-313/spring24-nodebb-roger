'use strict';

define('handleBack', [
	'components',
	'storage',
	'navigator',
	'forum/pagination',
], (components, storage, navigator, pagination) => {
	const handleBack = {};
	let loadTopicsMethod;

	handleBack.init = function (_loadTopicsMethod) {
		loadTopicsMethod = _loadTopicsMethod;
		saveClickedIndex();
		$(window).off('action:popstate', onBackClicked).on('action:popstate', onBackClicked);
	};

	handleBack.onBackClicked = onBackClicked;

	function saveClickedIndex() {
		$('[component="category"]').on('click', '[component="topic/header"]', function () {
			const clickedIndex = $(this).parents('[data-index]').attr('data-index');
			const windowScrollTop = $(window).scrollTop();
			$('[component="category/topic"]').each((index, element) => {
				if ($(element).offset().top - windowScrollTop > 0) {
					storage.setItem('category:bookmark', $(element).attr('data-index'));
					storage.setItem('category:bookmark:clicked', clickedIndex);
					storage.setItem('category:bookmark:offset', $(element).offset().top - windowScrollTop);
					return false;
				}
			});
		});
	}

	function onBackClicked(isMarkedUnread) {
		const highlightUnread = isMarkedUnread && ajaxify.data.template.unread;
		if (
			ajaxify.data.template.category
            || ajaxify.data.template.recent
            || ajaxify.data.template.popular
            || highlightUnread
		) {
			let bookmarkIndex = storage.getItem('category:bookmark');
			let clickedIndex = storage.getItem('category:bookmark:clicked');

			storage.removeItem('category:bookmark');
			storage.removeItem('category:bookmark:clicked');
			if (!utils.isNumber(bookmarkIndex)) {
				return;
			}

			bookmarkIndex = Math.max(0, Number.parseInt(bookmarkIndex, 10) || 0);
			clickedIndex = Math.max(0, Number.parseInt(clickedIndex, 10) || 0);

			if (config.usePagination) {
				const page = Math.ceil((Number.parseInt(bookmarkIndex, 10) + 1) / config.topicsPerPage);
				if (Number.parseInt(page, 10) === ajaxify.data.pagination.currentPage) {
					handleBack.scrollToTopic(bookmarkIndex, clickedIndex);
				} else {
					pagination.loadPage(page, () => {
						handleBack.scrollToTopic(bookmarkIndex, clickedIndex);
					});
				}
			} else {
				if (bookmarkIndex === 0) {
					handleBack.scrollToTopic(bookmarkIndex, clickedIndex);
					return;
				}

				$('[component="category"]').empty();
				loadTopicsMethod(Math.max(0, bookmarkIndex - 1) + 1, () => {
					handleBack.scrollToTopic(bookmarkIndex, clickedIndex);
				});
			}
		}
	}

	handleBack.highlightTopic = function (topicIndex) {
		const highlight = components.get('category/topic', 'index', topicIndex);

		if (highlight.length > 0 && !highlight.hasClass('highlight')) {
			highlight.addClass('highlight');
			setTimeout(() => {
				highlight.removeClass('highlight');
			}, 5000);
		}
	};

	handleBack.scrollToTopic = function (bookmarkIndex, clickedIndex) {
		if (!utils.isNumber(bookmarkIndex)) {
			return;
		}

		const scrollTo = components.get('category/topic', 'index', bookmarkIndex);

		if (scrollTo.length > 0) {
			const offset = storage.getItem('category:bookmark:offset');
			storage.removeItem('category:bookmark:offset');
			$(window).scrollTop(scrollTo.offset().top - offset);
			handleBack.highlightTopic(clickedIndex);
			navigator.update();
		}
	};

	return handleBack;
});
