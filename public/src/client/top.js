'use strict';

define('forum/top', ['topicList'], topicList => {
	const Top = {};

	Top.init = function () {
		app.enterRoom('top_topics');

		topicList.init('top');
	};

	return Top;
});
