'use strict';

define('forum/tags', ['forum/infinitescroll', 'alerts'], (infinitescroll, alerts) => {
	const Tags = {};

	Tags.init = function () {
		app.enterRoom('tags');
		$('#tag-search').focus();
		$('#tag-search').on('input propertychange', utils.debounce(() => {
			if ($('#tag-search').val().length === 0) {
				return resetSearch();
			}

			socket.emit('topics.searchAndLoadTags', {query: $('#tag-search').val()}, (error, results) => {
				if (error) {
					return alerts.error(error);
				}

				onTagsLoaded(results.tags, true);
			});
		}, 250));

		infinitescroll.init(Tags.loadMoreTags);
	};

	Tags.loadMoreTags = function (direction) {
		if (direction < 0 || $('.tag-list').length === 0 || $('#tag-search').val()) {
			return;
		}

		infinitescroll.loadMore('topics.loadMoreTags', {
			after: $('.tag-list').attr('data-nextstart'),
		}, (data, done) => {
			if (data && data.tags && data.tags.length > 0) {
				onTagsLoaded(data.tags, false, done);
				$('.tag-list').attr('data-nextstart', data.nextStart);
			} else {
				done();
			}
		});
	};

	function resetSearch() {
		socket.emit('topics.loadMoreTags', {
			after: 0,
		}, (error, data) => {
			if (error) {
				return alerts.error(error);
			}

			onTagsLoaded(data.tags, true);
		});
	}

	function onTagsLoaded(tags, replace, callback) {
		callback ||= function () {};
		app.parseAndTranslate('tags', 'tags', {tags}, html => {
			$('.tag-list')[replace ? 'html' : 'append'](html);
			utils.makeNumbersHumanReadable(html.find('.human-readable-number'));
			callback();
		});
	}

	return Tags;
});
