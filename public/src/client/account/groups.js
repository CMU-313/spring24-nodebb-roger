'use strict';

define('forum/account/groups', ['forum/account/header'], header => {
	const AccountTopics = {};

	AccountTopics.init = function () {
		header.init();

		const groupsElement = $('#groups-list');

		groupsElement.on('click', '.list-cover', function () {
			const groupSlug = $(this).parents('[data-slug]').attr('data-slug');

			ajaxify.go('groups/' + groupSlug);
		});
	};

	return AccountTopics;
});
