'use strict';

define('forum/account/following', ['forum/account/header'], header => {
	const Following = {};

	Following.init = function () {
		header.init();
	};

	return Following;
});
