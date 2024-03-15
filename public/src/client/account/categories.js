'use strict';

define('forum/account/categories', ['forum/account/header', 'alerts'], (header, alerts) => {
	const Categories = {};

	Categories.init = function () {
		header.init();

		for (const category of ajaxify.data.categories) {
			handleIgnoreWatch(category.cid);
		}

		$('[component="category/watch/all"]').find('[component="category/watching"], [component="category/ignoring"], [component="category/notwatching"]').on('click', function () {
			const cids = [];
			const state = $(this).attr('data-state');
			$('[data-parent-cid="0"]').each((index, element) => {
				cids.push($(element).attr('data-cid'));
			});

			socket.emit('categories.setWatchState', {cid: cids, state, uid: ajaxify.data.uid}, (error, modified_cids) => {
				if (error) {
					return alerts.error(error);
				}

				updateDropdowns(modified_cids, state);
			});
		});
	};

	function handleIgnoreWatch(cid) {
		const category = $('[data-cid="' + cid + '"]');
		category.find('[component="category/watching"], [component="category/ignoring"], [component="category/notwatching"]').on('click', function () {
			const $this = $(this);
			const state = $this.attr('data-state');

			socket.emit('categories.setWatchState', {cid, state, uid: ajaxify.data.uid}, (error, modified_cids) => {
				if (error) {
					return alerts.error(error);
				}

				updateDropdowns(modified_cids, state);

				alerts.success('[[category:' + state + '.message]]');
			});
		});
	}

	function updateDropdowns(modified_cids, state) {
		for (const cid of modified_cids) {
			const category = $('[data-cid="' + cid + '"]');
			category.find('[component="category/watching/menu"]').toggleClass('hidden', state !== 'watching');
			category.find('[component="category/watching/check"]').toggleClass('fa-check', state === 'watching');

			category.find('[component="category/notwatching/menu"]').toggleClass('hidden', state !== 'notwatching');
			category.find('[component="category/notwatching/check"]').toggleClass('fa-check', state === 'notwatching');

			category.find('[component="category/ignoring/menu"]').toggleClass('hidden', state !== 'ignoring');
			category.find('[component="category/ignoring/check"]').toggleClass('fa-check', state === 'ignoring');
		}
	}

	return Categories;
});
