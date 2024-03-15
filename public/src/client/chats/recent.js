'use strict';

define('forum/chats/recent', ['alerts'], alerts => {
	const recent = {};

	recent.init = function () {
		require(['forum/chats'], Chats => {
			$('[component="chat/recent"]').on('click', '[component="chat/recent/room"]', function () {
				Chats.switchChat($(this).attr('data-roomid'));
			});

			$('[component="chat/recent"]').on('scroll', function () {
				const $this = $(this);
				const bottom = ($this[0].scrollHeight - $this.height()) * 0.9;
				if ($this.scrollTop() > bottom) {
					loadMoreRecentChats();
				}
			});
		});
	};

	function loadMoreRecentChats() {
		const recentChats = $('[component="chat/recent"]');
		if (recentChats.attr('loading')) {
			return;
		}

		recentChats.attr('loading', 1);
		socket.emit('modules.chats.getRecentChats', {
			uid: ajaxify.data.uid,
			after: recentChats.attr('data-nextstart'),
		}, (error, data) => {
			if (error) {
				return alerts.error(error);
			}

			if (data && data.rooms.length > 0) {
				onRecentChatsLoaded(data, () => {
					recentChats.removeAttr('loading');
					recentChats.attr('data-nextstart', data.nextStart);
				});
			} else {
				recentChats.removeAttr('loading');
			}
		});
	}

	function onRecentChatsLoaded(data, callback) {
		if (data.rooms.length === 0) {
			return callback();
		}

		app.parseAndTranslate('chats', 'rooms', data, html => {
			$('[component="chat/recent"]').append(html);
			html.find('.timeago').timeago();
			callback();
		});
	}

	return recent;
});
