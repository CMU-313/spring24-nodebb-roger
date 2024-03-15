'use strict';

define('forum/chats', [
	'components',
	'translator',
	'mousetrap',
	'forum/chats/recent',
	'forum/chats/search',
	'forum/chats/messages',
	'composer/autocomplete',
	'hooks',
	'bootbox',
	'alerts',
	'chat',
	'api',
	'uploadHelpers',
], (
	components, translator, mousetrap,
	recentChats, search, messages,
	autocomplete, hooks, bootbox, alerts, chatModule,
	api, uploadHelpers,
) => {
	const Chats = {
		initialised: false,
	};

	let newMessage = false;

	Chats.init = function () {
		const env = utils.findBootstrapEnvironment();

		if (!Chats.initialised) {
			Chats.addSocketListeners();
			Chats.addGlobalEventListeners();
		}

		recentChats.init();

		Chats.addEventListeners();
		Chats.setActive();

		if (env === 'md' || env === 'lg') {
			Chats.addHotkeys();
		}

		$(document).ready(() => {
			hooks.fire('action:chat.loaded', $('.chats-full'));
		});

		Chats.initialised = true;
		messages.scrollToBottom($('.expanded-chat ul.chat-content'));

		search.init();

		if (ajaxify.data.hasOwnProperty('roomId')) {
			components.get('chat/input').focus();
		}
	};

	Chats.addEventListeners = function () {
		Chats.addSendHandlers(ajaxify.data.roomId, $('.chat-input'), $('.expanded-chat button[data-action="send"]'));
		Chats.addPopoutHandler();
		Chats.addActionHandlers(components.get('chat/messages'), ajaxify.data.roomId);
		Chats.addMemberHandler(ajaxify.data.roomId, components.get('chat/controls').find('[data-action="members"]'));
		Chats.addRenameHandler(ajaxify.data.roomId, components.get('chat/controls').find('[data-action="rename"]'));
		Chats.addLeaveHandler(ajaxify.data.roomId, components.get('chat/controls').find('[data-action="leave"]'));
		Chats.addScrollHandler(ajaxify.data.roomId, ajaxify.data.uid, $('.chat-content'));
		Chats.addScrollBottomHandler($('.chat-content'));
		Chats.addCharactersLeftHandler($('[component="chat/main-wrapper"]'));
		Chats.addIPHandler($('[component="chat/main-wrapper"]'));
		Chats.createAutoComplete($('[component="chat/input"]'));
		Chats.addUploadHandler({
			dragDropAreaEl: $('.chats-full'),
			pasteEl: $('[component="chat/input"]'),
			uploadFormEl: $('[component="chat/upload"]'),
			inputEl: $('[component="chat/input"]'),
		});

		$('[data-action="close"]').on('click', () => {
			Chats.switchChat();
		});
	};

	Chats.addUploadHandler = function (options) {
		uploadHelpers.init({
			dragDropAreaEl: options.dragDropAreaEl,
			pasteEl: options.pasteEl,
			uploadFormEl: options.uploadFormEl,
			route: '/api/post/upload', // Using same route as post uploads
			callback(uploads) {
				const inputElement = options.inputEl;
				let text = inputElement.val();
				for (const upload of uploads) {
					text = text + (text ? '\n' : '') + (upload.isImage ? '!' : '') + `[${upload.filename}](${upload.url})`;
				}

				inputElement.val(text);
			},
		});
	};

	Chats.addIPHandler = function (container) {
		container.on('click', '.chat-ip-button', function () {
			const ipElement = $(this).parent();
			const mid = ipElement.parents('[data-mid]').attr('data-mid');
			socket.emit('modules.chats.getIP', mid, (error, ip) => {
				if (error) {
					return alerts.error(error);
				}

				ipElement.html(ip);
			});
		});
	};

	Chats.addPopoutHandler = function () {
		$('[data-action="pop-out"]').on('click', () => {
			const text = components.get('chat/input').val();
			const roomId = ajaxify.data.roomId;

			if (app.previousUrl && /chats/.test(app.previousUrl)) {
				ajaxify.go('user/' + ajaxify.data.userslug + '/chats', () => {
					chatModule.openChat(roomId, ajaxify.data.uid);
				}, true);
			} else {
				window.history.go(-1);
				chatModule.openChat(roomId, ajaxify.data.uid);
			}

			$(window).one('action:chat.loaded', () => {
				components.get('chat/input').val(text);
			});
		});
	};

	Chats.addScrollHandler = function (roomId, uid, element) {
		let loading = false;
		element.off('scroll').on('scroll', () => {
			messages.toggleScrollUpAlert(element);
			if (loading) {
				return;
			}

			const top = (element[0].scrollHeight - element.height()) * 0.1;
			if (element.scrollTop() >= top) {
				return;
			}

			loading = true;
			const start = Number.parseInt(element.children('[data-mid]').length, 10);
			api.get(`/chats/${roomId}/messages`, {uid, start}).then(data => {
				data = data.messages;

				if (!data) {
					loading = false;
					return;
				}

				data = data.filter(chatMessage => $('[component="chat/message"][data-mid="' + chatMessage.messageId + '"]').length === 0);
				if (data.length === 0) {
					loading = false;
					return;
				}

				messages.parseMessage(data, html => {
					const currentScrollTop = element.scrollTop();
					const previousHeight = element[0].scrollHeight;
					html = $(html);
					element.prepend(html);
					html.find('.timeago').timeago();
					html.find('img:not(.not-responsive)').addClass('img-responsive');
					element.scrollTop((element[0].scrollHeight - previousHeight) + currentScrollTop);
					loading = false;
				});
			}).catch(alerts.error);
		});
	};

	Chats.addScrollBottomHandler = function (chatContent) {
		chatContent.parent()
			.find('[component="chat/messages/scroll-up-alert"]')
			.off('click').on('click', () => {
				messages.scrollToBottom(chatContent);
			});
	};

	Chats.addCharactersLeftHandler = function (parent) {
		const element = parent.find('[component="chat/input"]');
		element.on('change keyup paste', () => {
			messages.updateRemainingLength(parent);
		});
	};

	Chats.addActionHandlers = function (element, roomId) {
		element.on('click', '[data-action]', function () {
			const messageId = $(this).parents('[data-mid]').attr('data-mid');
			const action = this.dataset.action;

			switch (action) {
				case 'edit': {
					const inputElement = $('[data-roomid="' + roomId + '"] [component="chat/input"]');
					messages.prepEdit(inputElement, messageId, roomId);
					break;
				}

				case 'delete': {
					messages.delete(messageId, roomId);
					break;
				}

				case 'restore': {
					messages.restore(messageId, roomId);
					break;
				}
			}
		});
	};

	Chats.addHotkeys = function () {
		mousetrap.bind('ctrl+up', () => {
			const activeContact = $('.chats-list .bg-info');
			const previous = activeContact.prev();

			if (previous.length > 0) {
				Chats.switchChat(previous.attr('data-roomid'));
			}
		});
		mousetrap.bind('ctrl+down', () => {
			const activeContact = $('.chats-list .bg-info');
			const next = activeContact.next();

			if (next.length > 0) {
				Chats.switchChat(next.attr('data-roomid'));
			}
		});
		mousetrap.bind('up', e => {
			if (e.target === components.get('chat/input').get(0)) {
				// Retrieve message id from messages list
				const message = components.get('chat/messages').find('.chat-message[data-self="1"]').last();
				if (message.length === 0) {
					return;
				}

				const lastMid = message.attr('data-mid');
				const inputElement = components.get('chat/input');

				messages.prepEdit(inputElement, lastMid, ajaxify.data.roomId);
			}
		});
	};

	Chats.addMemberHandler = function (roomId, buttonElement) {
		let modal;

		buttonElement.on('click', () => {
			app.parseAndTranslate('partials/modals/manage_room', {}, html => {
				modal = bootbox.dialog({
					title: '[[modules:chat.manage-room]]',
					message: html,
				});

				modal.attr('component', 'chat/manage-modal');

				Chats.refreshParticipantsList(roomId, modal);
				Chats.addKickHandler(roomId, modal);

				const searchInput = modal.find('input');
				const errorElement = modal.find('.text-danger');
				require(['autocomplete', 'translator'], (autocomplete, translator) => {
					autocomplete.user(searchInput, (event, selected) => {
						errorElement.text('');
						api.post(`/chats/${roomId}/users`, {
							uids: [selected.item.user.uid],
						}).then(body => {
							Chats.refreshParticipantsList(roomId, modal, body);
							searchInput.val('');
						}).catch(error => {
							translator.translate(error.message, translated => {
								errorElement.text(translated);
							});
						});
					});
				});
			});
		});
	};

	Chats.addKickHandler = function (roomId, modal) {
		modal.on('click', '[data-action="kick"]', function () {
			const uid = Number.parseInt(this.dataset.uid, 10);

			api.delete(`/chats/${roomId}/users/${uid}`, {}).then(body => {
				Chats.refreshParticipantsList(roomId, modal, body);
			}).catch(alerts.error);
		});
	};

	Chats.addLeaveHandler = function (roomId, buttonElement) {
		buttonElement.on('click', () => {
			bootbox.confirm({
				size: 'small',
				title: '[[modules:chat.leave]]',
				message: '<p>[[modules:chat.leave-prompt]]</p><p class="help-block">[[modules:chat.leave-help]]</p>',
				callback(ok) {
					if (ok) {
						api.delete(`/chats/${roomId}/users/${app.user.uid}`, {}).then(() => {
							// Return user to chats page. If modal, close modal.
							const modal = buttonElement.parents('.chat-modal');
							if (modal.length > 0) {
								chatModule.close(modal);
							} else {
								ajaxify.go('chats');
							}
						}).catch(alerts.error);
					}
				},
			});
		});
	};

	Chats.refreshParticipantsList = async (roomId, modal, data) => {
		const listElement = modal.find('.list-group');

		if (!data) {
			try {
				data = await api.get(`/chats/${roomId}/users`, {});
			} catch {
				translator.translate('[[error:invalid-data]]', translated => {
					listElement.find('li').text(translated);
				});
			}
		}

		app.parseAndTranslate('partials/modals/manage_room_users', data, html => {
			listElement.html(html);
		});
	};

	Chats.addRenameHandler = function (roomId, buttonElement, roomName) {
		let modal;

		buttonElement.on('click', () => {
			app.parseAndTranslate('partials/modals/rename_room', {
				name: roomName || ajaxify.data.roomName,
			}, html => {
				modal = bootbox.dialog({
					title: '[[modules:chat.rename-room]]',
					message: html,
					buttons: {
						save: {
							label: '[[global:save]]',
							className: 'btn-primary',
							callback: submit,
						},
					},
				});
			});
		});

		function submit() {
			api.put(`/chats/${roomId}`, {
				name: modal.find('#roomName').val(),
			}).catch(alerts.error);
		}
	};

	Chats.addSendHandlers = function (roomId, inputElement, sendElement) {
		inputElement.off('keypress').on('keypress', e => {
			if (e.which === 13 && !e.shiftKey) {
				messages.sendMessage(roomId, inputElement);
				return false;
			}
		});

		sendElement.off('click').on('click', () => {
			messages.sendMessage(roomId, inputElement);
			inputElement.focus();
			return false;
		});
	};

	Chats.createAutoComplete = function (element) {
		if (element.length === 0) {
			return;
		}

		const data = {
			element,
			strategies: [],
			options: {
				style: {
					'z-index': 20_000,
					flex: 0,
					top: 'inherit',
				},
				placement: 'top',
			},
		};

		$(window).trigger('chat:autocomplete:init', data);
		if (data.strategies.length > 0) {
			autocomplete.setup(data);
		}
	};

	Chats.leave = function (element) {
		const roomId = element.attr('data-roomid');
		api.delete(`/chats/${roomId}/users/${app.user.uid}`, {}).then(() => {
			if (Number.parseInt(roomId, 10) === Number.parseInt(ajaxify.data.roomId, 10)) {
				ajaxify.go('user/' + ajaxify.data.userslug + '/chats');
			} else {
				element.remove();
			}

			const modal = chatModule.getModal(roomId);
			if (modal.length > 0) {
				chatModule.close(modal);
			}
		}).catch(alerts.error);
	};

	Chats.switchChat = function (roomid) {
		// Allow empty arg for return to chat list/close chat
		roomid ||= '';

		const url = 'user/' + ajaxify.data.userslug + '/chats/' + roomid + window.location.search;
		if (self.fetch) {
			fetch(config.relative_path + '/api/' + url, {credentials: 'include'})
				.then(response => {
					if (response.ok) {
						response.json().then(payload => {
							app.parseAndTranslate('partials/chats/message-window', payload, html => {
								components.get('chat/main-wrapper').html(html);
								html.find('.timeago').timeago();
								ajaxify.data = payload;
								Chats.setActive();
								Chats.addEventListeners();
								hooks.fire('action:chat.loaded', $('.chats-full'));
								messages.scrollToBottom($('.expanded-chat ul.chat-content'));
								if (history.pushState) {
									history.pushState({
										url,
									}, null, window.location.protocol + '//' + window.location.host + config.relative_path + '/' + url);
								}
							});
						});
					} else {
						console.warn('[search] Received ' + response.status);
					}
				})
				.catch(error => {
					console.warn('[search] ' + error.message);
				});
		} else {
			ajaxify.go(url);
		}
	};

	Chats.addGlobalEventListeners = function () {
		$(window).on('mousemove keypress click', () => {
			if (newMessage && ajaxify.data.roomId) {
				socket.emit('modules.chats.markRead', ajaxify.data.roomId);
				newMessage = false;
			}
		});
	};

	Chats.addSocketListeners = function () {
		socket.on('event:chats.receive', data => {
			if (Number.parseInt(data.roomId, 10) === Number.parseInt(ajaxify.data.roomId, 10)) {
				newMessage = data.self === 0;
				data.message.self = data.self;

				messages.appendChatMessage($('.expanded-chat .chat-content'), data.message);
			} else if (ajaxify.data.template.chats) {
				const roomElement = $('[data-roomid=' + data.roomId + ']');

				if (roomElement.length > 0) {
					roomElement.addClass('unread');
				} else {
					const recentElement = components.get('chat/recent');
					app.parseAndTranslate('partials/chats/recent_room', {
						rooms: {
							roomId: data.roomId,
							lastUser: data.message.fromUser,
							usernames: data.message.fromUser.username,
							unread: true,
						},
					}, html => {
						recentElement.prepend(html);
					});
				}
			}
		});

		socket.on('event:user_status_change', data => {
			app.updateUserStatus($('.chats-list [data-uid="' + data.uid + '"] [component="user/status"]'), data.status);
		});

		messages.addSocketListeners();

		socket.on('event:chats.roomRename', data => {
			const roomElement = components.get('chat/recent/room', data.roomId);
			const titleElement = roomElement.find('[component="chat/title"]');
			ajaxify.data.roomName = data.newName;

			titleElement.text(data.newName);
		});
	};

	Chats.setActive = function () {
		if (ajaxify.data.roomId) {
			socket.emit('modules.chats.markRead', ajaxify.data.roomId);
			$('[data-roomid="' + ajaxify.data.roomId + '"]').toggleClass('unread', false);
			$('.expanded-chat [component="chat/input"]').focus();
		}

		$('.chats-list li').removeClass('bg-info');
		$('.chats-list li[data-roomid="' + ajaxify.data.roomId + '"]').addClass('bg-info');

		components.get('chat/nav-wrapper').attr('data-loaded', ajaxify.data.roomId ? '1' : '0');
	};

	return Chats;
});
