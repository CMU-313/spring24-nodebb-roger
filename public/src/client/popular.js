'use strict';

define('forum/popular', ['topicList'], topicList => {
	const Popular = {};

	Popular.init = function () {
		app.enterRoom('popular_topics');

		topicList.init('popular');
	};

	return Popular;
});
