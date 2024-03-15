'use strict';

define('forum/chats/search', ['components', 'api', 'alerts'], (components, api, alerts) => {
	const search = {};

	search.init = function () {
		components.get('chat/search').on('keyup', utils.debounce(doSearch, 250));
	};

	function doSearch() {
		const username = components.get('chat/search').val();
		if (!username) {
			return $('[component="chat/search/list"]').empty();
		}

		api.get('/api/users', {
			query: username,
			searchBy: 'username',
			paginate: false,
		}).then(displayResults)
			.catch(alerts.error);
	}

	function displayResults(data) {
		const chatsListElement = $('[component="chat/search/list"]');
		chatsListElement.empty();

		data.users = data.users.filter(user => Number.parseInt(user.uid, 10) !== Number.parseInt(app.user.uid, 10));

		if (data.users.length === 0) {
			return chatsListElement.translateHtml('<li><div><span>[[users:no-users-found]]</span></div></li>');
		}

		for (const userObject of data.users) {
			const chatElement = displayUser(chatsListElement, userObject);
			onUserClick(chatElement, userObject);
		}

		chatsListElement.parent().toggleClass('open', true);
	}

	function displayUser(chatsListElement, userObject) {
		function createUserImage() {
			return (userObject.picture
				? '<img src="' + userObject.picture + '" title="' + userObject.username + '" />'
				: '<div class="user-icon" style="background-color: ' + userObject['icon:bgColor'] + '">' + userObject['icon:text'] + '</div>')
                + '<i class="fa fa-circle status ' + userObject.status + '"></i> ' + userObject.username;
		}

		const chatElement = $('<li component="chat/search/user"></li>')
			.attr('data-uid', userObject.uid)
			.appendTo(chatsListElement);

		chatElement.append(createUserImage());
		return chatElement;
	}

	function onUserClick(chatElement, userObject) {
		chatElement.on('click', () => {
			socket.emit('modules.chats.hasPrivateChat', userObject.uid, (error, roomId) => {
				if (error) {
					return alerts.error(error);
				}

				if (roomId) {
					require(['forum/chats'], chats => {
						chats.switchChat(roomId);
					});
				} else {
					require(['chat'], chat => {
						chat.newChat(userObject.uid);
					});
				}
			});
		});
	}

	return search;
});
