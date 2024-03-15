'use strict';

define('forum/account/downvoted', ['forum/account/header', 'forum/account/posts'], (header, posts) => {
	const Downvoted = {};

	Downvoted.init = function () {
		header.init();

		$('[component="post/content"] img:not(.not-responsive)').addClass('img-responsive');

		posts.handleInfiniteScroll('account/downvoted');
	};

	return Downvoted;
});
