'use strict';

define('forum/account/followers', ['forum/account/header'], header => {
	const Followers = {};

	Followers.init = function () {
		header.init();
	};

	return Followers;
});
