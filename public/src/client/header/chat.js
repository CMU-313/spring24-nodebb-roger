'use strict';

define('forum/header/chat', ['components'], components => {
	const chat = {};

	chat.prepareDOM = function () {
		const chatsToggleElement = components.get('chat/dropdown');
		const chatsListElement = components.get('chat/list');

		chatsToggleElement.on('click', () => {
			if (chatsToggleElement.parent().hasClass('open')) {
				return;
			}

			requireAndCall('loadChatsDropdown', chatsListElement);
		});

		if (chatsToggleElement.parents('.dropdown').hasClass('open')) {
			requireAndCall('loadChatsDropdown', chatsListElement);
		}

		socket.removeListener('event:chats.receive', onChatMessageReceived);
		socket.on('event:chats.receive', onChatMessageReceived);

		socket.removeListener('event:user_status_change', onUserStatusChange);
		socket.on('event:user_status_change', onUserStatusChange);

		socket.removeListener('event:chats.roomRename', onRoomRename);
		socket.on('event:chats.roomRename', onRoomRename);

		socket.on('event:unread.updateChatCount', count => {
			components.get('chat/icon')
				.toggleClass('unread-count', count > 0)
				.attr('data-content', count > 99 ? '99+' : count);
		});
	};

	function onChatMessageReceived(data) {
		requireAndCall('onChatMessageReceived', data);
	}

	function onUserStatusChange(data) {
		requireAndCall('onUserStatusChange', data);
	}

	function onRoomRename(data) {
		requireAndCall('onRoomRename', data);
	}

	function requireAndCall(method, parameter) {
		require(['chat'], chat => {
			chat[method](parameter);
		});
	}

	return chat;
});
