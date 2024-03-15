'use strict';

define('forum/pagination', ['bootbox'], bootbox => {
	const pagination = {};

	pagination.init = function () {
		$('body').on('click', '[component="pagination/select-page"]', () => {
			bootbox.prompt('[[global:enter_page_number]]', pageNumber => {
				pagination.loadPage(pageNumber);
			});
			return false;
		});
	};

	pagination.loadPage = function (page, callback) {
		callback ||= function () {};
		page = Number.parseInt(page, 10);
		if (!utils.isNumber(page) || page < 1 || page > ajaxify.data.pagination.pageCount) {
			return;
		}

		const query = utils.params();
		query.page = page;

		const url = window.location.pathname + '?' + $.param(query);
		ajaxify.go(url, callback);
	};

	pagination.nextPage = function (callback) {
		pagination.loadPage(ajaxify.data.pagination.currentPage + 1, callback);
	};

	pagination.previousPage = function (callback) {
		pagination.loadPage(ajaxify.data.pagination.currentPage - 1, callback);
	};

	return pagination;
});
