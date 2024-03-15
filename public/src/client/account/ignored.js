'use strict';

define('forum/account/ignored', ['forum/account/header', 'forum/account/topics'], (header, topics) => {
	const AccountIgnored = {};

	AccountIgnored.init = function () {
		header.init();

		topics.handleInfiniteScroll('account/ignored');
	};

	return AccountIgnored;
});
