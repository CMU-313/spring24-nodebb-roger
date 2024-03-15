'use strict';

define('forum/account/watched', ['forum/account/header', 'forum/account/topics'], (header, topics) => {
	const AccountWatched = {};

	AccountWatched.init = function () {
		header.init();

		topics.handleInfiniteScroll('account/watched');
	};

	return AccountWatched;
});
