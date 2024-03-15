'use strict';

define('forum/chats/messages', [
	'components',
	'translator',
	'benchpress',
	'hooks',
	'bootbox',
	'alerts',
	'messages',
	'api',
], (components, translator, Benchpress, hooks, bootbox, alerts, messagesModule, api) => {
	const messages = {};

	messages.sendMessage = async function (roomId, inputElement) {
		let message = inputElement.val();
		let mid = inputElement.attr('data-mid');

		if (message.trim().length === 0) {
			return;
		}

		inputElement.val('');
		inputElement.removeAttr('data-mid');
		messages.updateRemainingLength(inputElement.parent());
		const payload = {roomId, message, mid};
		// TODO: move this to success callback of api.post/put call?
		hooks.fire('action:chat.sent', payload);
		({roomId, message, mid} = await hooks.fire('filter:chat.send', payload));

		if (mid) {
			api.put(`/chats/${roomId}/messages/${mid}`, {message}).catch(error => {
				inputElement.val(message);
				inputElement.attr('data-mid', mid);
				messages.updateRemainingLength(inputElement.parent());
				return alerts.error(error);
			});
		} else {
			api.post(`/chats/${roomId}`, {message}).catch(error => {
				inputElement.val(message);
				messages.updateRemainingLength(inputElement.parent());
				if (error.message === '[[error:email-not-confirmed-chat]]') {
					return messagesModule.showEmailConfirmWarning(error.message);
				}

				return alerts.alert({
					alert_id: 'chat_spam_error',
					title: '[[global:alert.error]]',
					message: error.message,
					type: 'danger',
					timeout: 10_000,
				});
			});
		}
	};

	messages.updateRemainingLength = function (parent) {
		const element = parent.find('[component="chat/input"]');
		parent.find('[component="chat/message/length"]').text(element.val().length);
		parent.find('[component="chat/message/remaining"]').text(config.maximumChatMessageLength - element.val().length);
		hooks.fire('action:chat.updateRemainingLength', {
			parent,
		});
	};

	messages.appendChatMessage = function (chatContentElement, data) {
		const lastSpeaker = Number.parseInt(chatContentElement.find('.chat-message').last().attr('data-uid'), 10);
		const lasttimestamp = Number.parseInt(chatContentElement.find('.chat-message').last().attr('data-timestamp'), 10);
		if (!Array.isArray(data)) {
			data.newSet = lastSpeaker !== Number.parseInt(data.fromuid, 10)
                || Number.parseInt(data.timestamp, 10) > Number.parseInt(lasttimestamp, 10) + (1000 * 60 * 3);
		}

		messages.parseMessage(data, html => {
			onMessagesParsed(chatContentElement, html);
		});
	};

	function onMessagesParsed(chatContentElement, html) {
		const newMessage = $(html);
		const isAtBottom = messages.isAtBottom(chatContentElement);
		newMessage.appendTo(chatContentElement);
		newMessage.find('.timeago').timeago();
		newMessage.find('img:not(.not-responsive)').addClass('img-responsive');
		if (isAtBottom) {
			messages.scrollToBottom(chatContentElement);
		}

		hooks.fire('action:chat.received', {
			messageEl: newMessage,
		});
	}

	messages.parseMessage = function (data, callback) {
		function done(html) {
			translator.translate(html, callback);
		}

		if (Array.isArray(data)) {
			Benchpress.render('partials/chats/message' + (Array.isArray(data) ? 's' : ''), {
				messages: data,
			}).then(done);
		} else {
			Benchpress.render('partials/chats/' + (data.system ? 'system-message' : 'message'), {
				messages: data,
			}).then(done);
		}
	};

	messages.isAtBottom = function (containerElement, threshold) {
		if (containerElement.length > 0) {
			const distanceToBottom = containerElement[0].scrollHeight - (
				containerElement.outerHeight() + containerElement.scrollTop()
			);
			return distanceToBottom < (threshold || 100);
		}
	};

	messages.scrollToBottom = function (containerElement) {
		if (containerElement && containerElement.length > 0) {
			containerElement.scrollTop(containerElement[0].scrollHeight - containerElement.height());
			containerElement.parent()
				.find('[component="chat/messages/scroll-up-alert"]')
				.addClass('hidden');
		}
	};

	messages.toggleScrollUpAlert = function (containerElement) {
		const isAtBottom = messages.isAtBottom(containerElement, 300);
		containerElement.parent()
			.find('[component="chat/messages/scroll-up-alert"]')
			.toggleClass('hidden', isAtBottom);
	};

	messages.prepEdit = function (inputElement, messageId, roomId) {
		socket.emit('modules.chats.getRaw', {mid: messageId, roomId}, (error, raw) => {
			if (error) {
				return alerts.error(error);
			}

			// Populate the input field with the raw message content
			if (inputElement.val().length === 0) {
				// By setting the `data-mid` attribute, I tell the chat code that I am editing a
				// message, instead of posting a new one.
				inputElement.attr('data-mid', messageId).addClass('editing');
				inputElement.val(raw).focus();

				hooks.fire('action:chat.prepEdit', {
					inputEl: inputElement,
					messageId,
					roomId,
				});
			}
		});
	};

	messages.addSocketListeners = function () {
		socket.removeListener('event:chats.edit', onChatMessageEdited);
		socket.on('event:chats.edit', onChatMessageEdited);

		socket.removeListener('event:chats.delete', onChatMessageDeleted);
		socket.on('event:chats.delete', onChatMessageDeleted);

		socket.removeListener('event:chats.restore', onChatMessageRestored);
		socket.on('event:chats.restore', onChatMessageRestored);
	};

	function onChatMessageEdited(data) {
		for (const message of data.messages) {
			const self = Number.parseInt(message.fromuid, 10) === Number.parseInt(app.user.uid, 10);
			message.self = self ? 1 : 0;
			messages.parseMessage(message, html => {
				const body = components.get('chat/message', message.messageId);
				if (body.length > 0) {
					body.replaceWith(html);
					components.get('chat/message', message.messageId).find('.timeago').timeago();
				}
			});
		}
	}

	function onChatMessageDeleted(messageId) {
		components.get('chat/message', messageId)
			.toggleClass('deleted', true)
			.find('[component="chat/message/body"]').translateHtml('[[modules:chat.message-deleted]]');
	}

	function onChatMessageRestored(message) {
		components.get('chat/message', message.messageId)
			.toggleClass('deleted', false)
			.find('[component="chat/message/body"]').html(message.content);
	}

	messages.delete = function (messageId, roomId) {
		translator.translate('[[modules:chat.delete_message_confirm]]', translated => {
			bootbox.confirm(translated, ok => {
				if (!ok) {
					return;
				}

				api.delete(`/chats/${roomId}/messages/${messageId}`, {}).then(() => {
					components.get('chat/message', messageId).toggleClass('deleted', true);
				}).catch(alerts.error);
			});
		});
	};

	messages.restore = function (messageId, roomId) {
		api.post(`/chats/${roomId}/messages/${messageId}`, {}).then(() => {
			components.get('chat/message', messageId).toggleClass('deleted', false);
		}).catch(alerts.error);
	};

	return messages;
});
