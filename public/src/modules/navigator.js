'use strict';

define('navigator', ['forum/pagination', 'components', 'hooks', 'alerts'], (pagination, components, hooks, alerts) => {
	const navigator = {};
	let index = 0;
	let count = 0;
	let navigatorUpdateTimeoutId;

	let renderPostIntervalId;
	let touchX;
	let touchY;
	let renderPostIndex;
	let isNavigating = false;
	let firstMove = true;

	navigator.scrollActive = false;

	let paginationBlockElement = $('.pagination-block');
	let paginationTextElement = paginationBlockElement.find('.pagination-text');
	let paginationBlockMeterElement = paginationBlockElement.find('meter');
	let paginationBlockProgressElement = paginationBlockElement.find('.progress-bar');
	let thumb;
	let thumbText;
	let thumbIcon;
	let thumbIconHeight;
	let thumbIconHalfHeight;

	$(window).on('action:ajaxify.start', () => {
		$(window).off('keydown', onKeyDown);
	});

	navigator.init = function (selector, count, toTop, toBottom, callback) {
		index = 0;
		navigator.selector = selector;
		navigator.callback = callback;
		navigator.toTop = toTop || function () {};
		navigator.toBottom = toBottom || function () {};

		paginationBlockElement = $('.pagination-block');
		paginationTextElement = paginationBlockElement.find('.pagination-text');
		paginationBlockMeterElement = paginationBlockElement.find('meter');
		paginationBlockProgressElement = paginationBlockElement.find('.progress-bar');

		thumbIcon = $('.scroller-thumb-icon');
		thumbIconHeight = thumbIcon.height();
		thumbIconHalfHeight = thumbIconHeight / 2;
		thumb = $('.scroller-thumb');
		thumbText = thumb.find('.thumb-text');

		$(window).off('scroll', navigator.delayedUpdate).on('scroll', navigator.delayedUpdate);

		paginationBlockElement.find('.dropdown-menu').off('click').on('click', e => {
			e.stopPropagation();
		});

		paginationBlockElement.off('shown.bs.dropdown', '.wrapper').on('shown.bs.dropdown', '.wrapper', () => {
			setTimeout(async () => {
				if (utils.findBootstrapEnvironment() === 'lg') {
					$('.pagination-block input').focus();
				}

				const postCountInTopic = await socket.emit('topics.getPostCountInTopic', ajaxify.data.tid);
				if (postCountInTopic > 0) {
					paginationBlockElement.find('#myNextPostBtn').removeAttr('disabled');
				}
			}, 100);
		});
		paginationBlockElement.find('.pageup').off('click').on('click', navigator.scrollUp);
		paginationBlockElement.find('.pagedown').off('click').on('click', navigator.scrollDown);
		paginationBlockElement.find('.pagetop').off('click').on('click', navigator.toTop);
		paginationBlockElement.find('.pagebottom').off('click').on('click', navigator.toBottom);
		paginationBlockElement.find('#myNextPostBtn').off('click').on('click', gotoMyNextPost);

		paginationBlockElement.find('input').on('keydown', function (e) {
			if (e.which === 13) {
				const input = $(this);
				if (!utils.isNumber(input.val())) {
					input.val('');
					return;
				}

				const index = Number.parseInt(input.val(), 10);
				const url = generateUrl(index);
				input.val('');
				$('.pagination-block .dropdown-toggle').trigger('click');
				ajaxify.go(url);
			}
		});

		if (ajaxify.data.template.topic) {
			handleScrollNav();
		}

		handleKeys();

		navigator.setCount(count);
		navigator.update(0);
	};

	let lastNextIndex = 0;
	async function gotoMyNextPost() {
		async function getNext(startIndex) {
			return await socket.emit('topics.getMyNextPostIndex', {
				tid: ajaxify.data.tid,
				index: Math.max(1, startIndex),
				sort: config.topicPostSort,
			});
		}

		if (ajaxify.data.template.topic) {
			let nextIndex = await getNext(index);
			if (lastNextIndex === nextIndex) { // Handles last post in pagination
				nextIndex = await getNext(nextIndex);
			}

			if (nextIndex && index !== nextIndex + 1) {
				lastNextIndex = nextIndex;
				$(window).one('action:ajaxify.end', () => {
					if (paginationBlockElement.find('.dropdown-menu').is(':hidden')) {
						paginationBlockElement.find('.dropdown-toggle').dropdown('toggle');
					}
				});
				navigator.scrollToIndex(nextIndex, true, 0);
			} else {
				alerts.alert({
					message: '[[topic:no-more-next-post]]',
					type: 'info',
				});

				lastNextIndex = 1;
			}
		}
	}

	function clampTop(newTop) {
		const parent = thumb.parent();
		const parentOffset = parent.offset();
		if (newTop < parentOffset.top) {
			newTop = parentOffset.top;
		} else if (newTop > parentOffset.top + parent.height() - thumbIconHeight) {
			newTop = parentOffset.top + parent.height() - thumbIconHeight;
		}

		return newTop;
	}

	function setThumbToIndex(index) {
		if (thumb.length === 0 || thumb.is(':hidden')) {
			return;
		}

		const parent = thumb.parent();
		const parentOffset = parent.offset();
		let percent = (index - 1) / ajaxify.data.postcount;
		if (index === count) {
			percent = 1;
		}

		const newTop = clampTop(parentOffset.top + ((parent.height() - thumbIconHeight) * percent));

		const offset = {top: newTop, left: thumb.offset().left};
		thumb.offset(offset);
		thumbText.text(index + '/' + ajaxify.data.postcount);
		renderPost(index);
	}

	function handleScrollNav() {
		if (thumb.length === 0) {
			return;
		}

		const parent = thumb.parent();
		parent.on('click', event => {
			if ($(event.target).hasClass('scroller-container')) {
				const index = calculateIndexFromY(event.pageY);
				navigator.scrollToIndex(index - 1, true, 0);
				return false;
			}
		});

		function calculateIndexFromY(y) {
			const newTop = clampTop(y - thumbIconHalfHeight);
			const parentOffset = parent.offset();
			const percent = (newTop - parentOffset.top) / (parent.height() - thumbIconHeight);
			index = Math.max(1, Math.ceil(ajaxify.data.postcount * percent));
			return index > ajaxify.data.postcount ? ajaxify.data.count : index;
		}

		let mouseDragging = false;
		hooks.on('action:ajaxify.end', () => {
			renderPostIndex = null;
		});
		$('.pagination-block .dropdown-menu').parent().on('shown.bs.dropdown', () => {
			setThumbToIndex(index);
		});

		thumb.on('mousedown', () => {
			mouseDragging = true;
			$(window).on('mousemove', mousemove);
			firstMove = true;
		});

		function mouseup() {
			$(window).off('mousemove', mousemove);
			if (mouseDragging) {
				navigator.scrollToIndex(index - 1, true, 0);
				paginationBlockElement.find('[data-toggle="dropdown"]').trigger('click');
			}

			clearRenderInterval();
			mouseDragging = false;
			firstMove = false;
		}

		function mousemove(event) {
			const newTop = clampTop(event.pageY - thumbIconHalfHeight);
			thumb.offset({top: newTop, left: thumb.offset().left});
			const index = calculateIndexFromY(event.pageY);
			navigator.updateTextAndProgressBar();
			thumbText.text(index + '/' + ajaxify.data.postcount);
			if (firstMove) {
				delayedRenderPost();
			}

			firstMove = false;
			event.stopPropagation();
			return false;
		}

		function delayedRenderPost() {
			clearRenderInterval();
			renderPostIntervalId = setInterval(() => {
				renderPost(index);
			}, 250);
		}

		$(window).off('mousemove', mousemove);
		$(window).off('mouseup', mouseup).on('mouseup', mouseup);

		thumb.on('touchstart', event => {
			isNavigating = true;
			touchX = Math.min($(window).width(), Math.max(0, event.touches[0].clientX));
			touchY = Math.min($(window).height(), Math.max(0, event.touches[0].clientY));
			firstMove = true;
		});

		thumb.on('touchmove', event => {
			const windowWidth = $(window).width();
			const windowHeight = $(window).height();
			const deltaX = Math.abs(touchX - Math.min(windowWidth, Math.max(0, event.touches[0].clientX)));
			const deltaY = Math.abs(touchY - Math.min(windowHeight, Math.max(0, event.touches[0].clientY)));
			touchX = Math.min(windowWidth, Math.max(0, event.touches[0].clientX));
			touchY = Math.min(windowHeight, Math.max(0, event.touches[0].clientY));

			if (deltaY >= deltaX && firstMove) {
				isNavigating = true;
				delayedRenderPost();
			}

			if (isNavigating && event.cancelable) {
				event.preventDefault();
				event.stopPropagation();
				const newTop = clampTop(touchY + $(window).scrollTop() - thumbIconHalfHeight);
				thumb.offset({top: newTop, left: thumb.offset().left});
				const index = calculateIndexFromY(touchY + $(window).scrollTop());
				navigator.updateTextAndProgressBar();
				thumbText.text(index + '/' + ajaxify.data.postcount);
				if (firstMove) {
					renderPost(index);
				}
			}

			firstMove = false;
		});

		thumb.on('touchend', () => {
			clearRenderInterval();
			if (isNavigating) {
				navigator.scrollToIndex(index - 1, true, 0);
				isNavigating = false;
				paginationBlockElement.find('[data-toggle="dropdown"]').trigger('click');
			}
		});
	}

	function clearRenderInterval() {
		if (renderPostIntervalId) {
			clearInterval(renderPostIntervalId);
			renderPostIntervalId = 0;
		}
	}

	function renderPost(index, callback) {
		callback ||= function () {};
		if (renderPostIndex === index || paginationBlockElement.find('.post-content').is(':hidden')) {
			return;
		}

		renderPostIndex = index;

		socket.emit('posts.getPostSummaryByIndex', {tid: ajaxify.data.tid, index: index - 1}, (error, postData) => {
			if (error) {
				return alerts.error(error);
			}

			app.parseAndTranslate('partials/topic/navigation-post', {post: postData}, html => {
				paginationBlockElement
					.find('.post-content')
					.html(html)
					.find('.timeago').timeago();
			});

			callback();
		});
	}

	function handleKeys() {
		if (!config.usePagination) {
			$(window).off('keydown', onKeyDown).on('keydown', onKeyDown);
		}
	}

	function onKeyDown(event) {
		if (event.target.nodeName === 'BODY') {
			if (event.shiftKey || event.ctrlKey || event.altKey) {
				return;
			}

			if (event.which === 36 && navigator.toTop) { // Home key
				navigator.toTop();
				return false;
			}

			if (event.which === 35 && navigator.toBottom) { // End key
				navigator.toBottom();
				return false;
			}
		}
	}

	function generateUrl(index) {
		const pathname = window.location.pathname.replace(config.relative_path, '');
		const parts = pathname.split('/');
		return parts[1] + '/' + parts[2] + '/' + parts[3] + (index ? '/' + index : '');
	}

	navigator.getCount = () => count;

	navigator.setCount = function (value) {
		value = Number.parseInt(value, 10);
		if (value === count) {
			return;
		}

		count = value;
		navigator.updateTextAndProgressBar();
	};

	navigator.show = function () {
		toggle(true);
	};

	navigator.disable = function () {
		count = 0;
		index = 1;
		navigator.callback = null;
		navigator.selector = null;
		$(window).off('scroll', navigator.delayedUpdate);

		toggle(false);
	};

	function toggle(flag) {
		const path = ajaxify.removeRelativePath(window.location.pathname.slice(1));
		if (flag && (!path.startsWith('topic') && !path.startsWith('category'))) {
			return;
		}

		paginationBlockElement.toggleClass('ready', flag);
	}

	navigator.delayedUpdate = function () {
		navigatorUpdateTimeoutId ||= setTimeout(() => {
			navigator.update();
			navigatorUpdateTimeoutId = undefined;
		}, 100);
	};

	navigator.update = function (threshold) {
		/*
            The "threshold" is defined as the distance from the top of the page to
            a spot where a user is expecting to begin reading.
        */
		threshold = typeof threshold === 'number' ? threshold : undefined;
		let newIndex = index;
		const els = $(navigator.selector);
		if (els.length > 0) {
			newIndex = Number.parseInt(els.first().attr('data-index'), 10) + 1;
		}

		const scrollTop = $(window).scrollTop();
		const windowHeight = $(window).height();
		const documentHeight = $(document).height();
		const middleOfViewport = scrollTop + (windowHeight / 2);
		let previousDistance = Number.MAX_VALUE;
		els.each(function () {
			const $this = $(this);
			const elementIndex = Number.parseInt($this.attr('data-index'), 10);
			if (elementIndex >= 0) {
				const distanceToMiddle
                    = Math.abs(middleOfViewport - ($this.offset().top + ($this.outerHeight(true) / 2)));

				if (distanceToMiddle > previousDistance) {
					return false;
				}

				if (distanceToMiddle < previousDistance) {
					newIndex = elementIndex + 1;
					previousDistance = distanceToMiddle;
				}
			}
		});

		const atTop = scrollTop === 0 && Number.parseInt(els.first().attr('data-index'), 10) === 0;
		const nearBottom = scrollTop + windowHeight > documentHeight - 100 && Number.parseInt(els.last().attr('data-index'), 10) === count - 1;

		if (atTop) {
			newIndex = 1;
		} else if (nearBottom) {
			newIndex = count;
		}

		// If a threshold is undefined, try to determine one based on new index
		if (threshold === undefined && ajaxify.data.template.topic) {
			if (atTop) {
				threshold = 0;
			} else {
				const anchorElement = components.get('post/anchor', index - 1);
				if (anchorElement.length > 0) {
					const anchorRect = anchorElement.get(0).getBoundingClientRect();
					threshold = anchorRect.top;
				}
			}
		}

		if (typeof navigator.callback === 'function') {
			navigator.callback(newIndex, count, threshold);
		}

		if (newIndex !== index) {
			index = newIndex;
			navigator.updateTextAndProgressBar();
			setThumbToIndex(index);
		}

		toggle(Boolean(count));
	};

	navigator.getIndex = () => index;

	navigator.setIndex = newIndex => {
		index = newIndex + 1;
		navigator.updateTextAndProgressBar();
		setThumbToIndex(index);
	};

	navigator.updateTextAndProgressBar = function () {
		if (!utils.isNumber(index)) {
			return;
		}

		index = index > count ? count : index;
		paginationTextElement.translateHtml('[[global:pagination.out_of, ' + index + ', ' + count + ']]');
		const fraction = (index - 1) / (count - 1 || 1);
		paginationBlockMeterElement.val(fraction);
		paginationBlockProgressElement.width((fraction * 100) + '%');
	};

	navigator.scrollUp = function () {
		const $window = $(window);

		if (config.usePagination) {
			const atTop = $window.scrollTop() <= 0;
			if (atTop) {
				return pagination.previousPage(() => {
					$('body,html').scrollTop($(document).height() - $window.height());
				});
			}
		}

		$('body,html').animate({
			scrollTop: $window.scrollTop() - $window.height(),
		});
	};

	navigator.scrollDown = function () {
		const $window = $(window);

		if (config.usePagination) {
			const atBottom = $window.scrollTop() >= $(document).height() - $window.height();
			if (atBottom) {
				return pagination.nextPage();
			}
		}

		$('body,html').animate({
			scrollTop: $window.scrollTop() + $window.height(),
		});
	};

	navigator.scrollTop = function (index) {
		if ($(navigator.selector + '[data-index="' + index + '"]').length > 0) {
			navigator.scrollToIndex(index, true);
		} else {
			ajaxify.go(generateUrl());
		}
	};

	navigator.scrollBottom = function (index) {
		if (Number.parseInt(index, 10) < 0) {
			return;
		}

		if ($(navigator.selector + '[data-index="' + index + '"]').length > 0) {
			navigator.scrollToIndex(index, true);
		} else {
			index = Number.parseInt(index, 10) + 1;
			ajaxify.go(generateUrl(index));
		}
	};

	navigator.scrollToIndex = function (index, highlight, duration) {
		const inTopic = components.get('topic').length > 0;
		const inCategory = components.get('category').length > 0;

		if (!utils.isNumber(index) || (!inTopic && !inCategory)) {
			return;
		}

		duration = duration === undefined ? 400 : duration;
		navigator.scrollActive = true;

		// If in topic and item already on page
		if (inTopic && components.get('post/anchor', index).length > 0) {
			return navigator.scrollToPostIndex(index, highlight, duration);
		}

		// If in category and item alreay on page
		if (inCategory && $('[component="category/topic"][data-index="' + index + '"]').length > 0) {
			return navigator.scrollToTopicIndex(index, highlight, duration);
		}

		if (!config.usePagination) {
			navigator.scrollActive = false;
			index = Number.parseInt(index, 10) + 1;
			ajaxify.go(generateUrl(index));
			return;
		}

		const scrollMethod = inTopic ? navigator.scrollToPostIndex : navigator.scrollToTopicIndex;

		const page = 1 + Math.floor(index / config.postsPerPage);
		if (Number.parseInt(page, 10) === ajaxify.data.pagination.currentPage) {
			scrollMethod(index, highlight, duration);
		} else {
			pagination.loadPage(page, () => {
				scrollMethod(index, highlight, duration);
			});
		}
	};

	navigator.scrollToPostIndex = function (postIndex, highlight, duration) {
		const scrollTo = components.get('post', 'index', postIndex);
		navigator.scrollToElement(scrollTo, highlight, duration, postIndex);
	};

	navigator.scrollToTopicIndex = function (topicIndex, highlight, duration) {
		const scrollTo = $('[component="category/topic"][data-index="' + topicIndex + '"]');
		navigator.scrollToElement(scrollTo, highlight, duration, topicIndex);
	};

	navigator.scrollToElement = async (scrollTo, highlight, duration, newIndex = null) => {
		if (scrollTo.length === 0) {
			navigator.scrollActive = false;
			return;
		}

		await hooks.fire('filter:navigator.scroll', {
			scrollTo, highlight, duration, newIndex,
		});

		const postHeight = scrollTo.outerHeight(true);
		const navbarHeight = components.get('navbar').outerHeight(true) || 0;
		const topicHeaderHeight = $('.topic-header').outerHeight(true) || 0;
		const viewportHeight = $(window).height();

		// Temporarily disable navigator update on scroll
		$(window).off('scroll', navigator.delayedUpdate);

		duration = duration === undefined ? 400 : duration;
		navigator.scrollActive = true;
		let done = false;

		function animateScroll() {
			function reenableScroll() {
				// Re-enable onScroll behaviour
				setTimeout(() => { // Fixes race condition from jQuery — onAnimateComplete called too quickly
					$(window).on('scroll', navigator.delayedUpdate);

					hooks.fire('action:navigator.scrolled', {
						scrollTo, highlight, duration, newIndex,
					});
				}, 50);
			}

			function onAnimateComplete() {
				if (done) {
					reenableScroll();
					return;
				}

				done = true;

				navigator.scrollActive = false;
				highlightPost();

				const scrollToRect = scrollTo.get(0).getBoundingClientRect();
				if (newIndex) {
					navigator.setIndex(newIndex);
				} else {
					navigator.update(scrollToRect.top);
				}
			}

			let scrollTop = 0;
			scrollTop = postHeight < viewportHeight - navbarHeight - topicHeaderHeight ? scrollTo.offset().top - (viewportHeight / 2) + (postHeight / 2) : scrollTo.offset().top - navbarHeight - topicHeaderHeight;

			if (duration === 0) {
				$(window).scrollTop(scrollTop);
				onAnimateComplete();
				reenableScroll();
				return;
			}

			$('html, body').animate({
				scrollTop: scrollTop + 'px',
			}, duration, onAnimateComplete);
		}

		function highlightPost() {
			if (highlight) {
				$('[component="post"],[component="category/topic"]').removeClass('highlight');
				scrollTo.addClass('highlight');
				setTimeout(() => {
					scrollTo.removeClass('highlight');
				}, 10_000);
			}
		}

		animateScroll();
	};

	return navigator;
});

