'use strict';

define('forum/recent', ['topicList'], topicList => {
	const Recent = {};

	Recent.init = function () {
		app.enterRoom('recent_topics');

		topicList.init('recent');
	};

	return Recent;
});
