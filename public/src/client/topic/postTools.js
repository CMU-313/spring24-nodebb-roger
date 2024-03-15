'use strict';

define('forum/topic/postTools', [
	'share',
	'navigator',
	'components',
	'translator',
	'forum/topic/votes',
	'api',
	'bootbox',
	'alerts',
	'hooks',
], (share, navigator, components, translator, votes, api, bootbox, alerts, hooks) => {
	const PostTools = {};

	let staleReplyAnyway = false;

	PostTools.init = function (tid) {
		staleReplyAnyway = false;

		renderMenu();

		addPostHandlers(tid);

		share.addShareHandlers(ajaxify.data.titleRaw);

		votes.addVoteHandler();

		PostTools.updatePostCount(ajaxify.data.postcount);
	};

	function renderMenu() {
		$('[component="topic"]').on('show.bs.dropdown', '.moderator-tools', function () {
			const $this = $(this);
			const dropdownMenu = $this.find('.dropdown-menu');
			if (dropdownMenu.html()) {
				return;
			}

			const postElement = $this.parents('[data-pid]');
			const pid = postElement.attr('data-pid');
			const index = Number.parseInt(postElement.attr('data-index'), 10);

			socket.emit('posts.loadPostTools', {pid, cid: ajaxify.data.cid}, async (error, data) => {
				if (error) {
					return alerts.error(error);
				}

				data.posts.display_move_tools = data.posts.display_move_tools && index !== 0;

				const html = await app.parseAndTranslate('partials/topic/post-menu-list', data);
				const clipboard = require('clipboard');

				dropdownMenu.html(html);
				dropdownMenu.get(0).classList.toggle('hidden', false);
				new clipboard('[data-clipboard-text]');

				hooks.fire('action:post.tools.load', {
					element: dropdownMenu,
				});
			});
		});
	}

	PostTools.toggle = function (pid, isDeleted) {
		const postElement = components.get('post', 'pid', pid);

		postElement.find('[component="post/quote"], [component="post/bookmark"], [component="post/reply"], [component="post/flag"], [component="user/chat"], [component="user/resolve"]')
			.toggleClass('hidden', isDeleted);

		postElement.find('[component="post/delete"]').toggleClass('hidden', isDeleted).parent().attr('hidden', isDeleted ? '' : null);
		postElement.find('[component="post/restore"]').toggleClass('hidden', !isDeleted).parent().attr('hidden', isDeleted ? null : '');
		postElement.find('[component="post/purge"]').toggleClass('hidden', !isDeleted).parent().attr('hidden', isDeleted ? null : '');

		PostTools.removeMenu(postElement);
	};

	PostTools.removeMenu = function (postElement) {
		postElement.find('[component="post/tools"] .dropdown-menu').html('');
	};

	PostTools.updatePostCount = function (postCount) {
		const postCountElement = components.get('topic/post-count');
		postCountElement.html(postCount).attr('title', postCount);
		utils.makeNumbersHumanReadable(postCountElement);
		navigator.setCount(postCount);
	};

	function addPostHandlers(tid) {
		const postContainer = components.get('topic');

		handleSelectionTooltip();

		postContainer.on('click', '[component="post/quote"]', function () {
			onQuoteClicked($(this), tid);
		});

		// PostContainer.on('click', '[component="post/resolve"]', function () {
		//     onResolvedClicked($(this));
		// });

		postContainer.on('click', '[component="post/resolve"]', function () {
			return onResolveClicked(getData($(this), 'data-pid'));
		});

		postContainer.on('click', '[component="post/reply"]', function () {
			onReplyClicked($(this), tid);
		});

		$('.topic').on('click', '[component="topic/reply"]', function (e) {
			e.preventDefault();
			onReplyClicked($(this), tid);
		});

		$('.topic').on('click', '[component="topic/reply-as-topic"]', () => {
			translator.translate('[[topic:link_back, ' + ajaxify.data.titleRaw + ', ' + config.relative_path + '/topic/' + ajaxify.data.slug + ']]', body => {
				hooks.fire('action:composer.topic.new', {
					cid: ajaxify.data.cid,
					body,
				});
			});
		});

		postContainer.on('click', '[component="post/bookmark"]', function () {
			return bookmarkPost($(this), getData($(this), 'data-pid'));
		});

		postContainer.on('click', '[component="post/pin"]', function () {
			/*
            This is an event handler - and so doesn't have any
            interesting parameters or return types

            What's important is that element actually has a data-pid attribute.
            */
			console.assert(Object.hasOwn(this.dataset, 'pinned'), 'Element didn\'t have data-pinned property!');
			const attributeValue = this.dataset.pinned;
			console.assert(attributeValue === 'true' || attributeValue === 'false', 'data-pinned is not true');

			const dataPid = getData($(this), 'data-pid');
			console.assert(!(isNaN(dataPid)), 'Invalid data-pid.');
			// End of tests

			return pinPost($(this), getData($(this), 'data-pid'));
		});

		postContainer.on('click', '[component="post/upvote"]', function () {
			return votes.toggleVote($(this), '.upvoted', 1);
		});

		postContainer.on('click', '[component="post/downvote"]', function () {
			return votes.toggleVote($(this), '.downvoted', -1);
		});

		postContainer.on('click', '[component="post/vote-count"]', function () {
			votes.showVotes(getData($(this), 'data-pid'));
		});

		postContainer.on('click', '[component="post/flag"]', function () {
			const pid = getData($(this), 'data-pid');
			require(['flags'], flags => {
				flags.showFlagModal({
					type: 'post',
					id: pid,
				});
			});
		});

		postContainer.on('click', '[component="post/flagUser"]', function () {
			const uid = getData($(this), 'data-uid');
			require(['flags'], flags => {
				flags.showFlagModal({
					type: 'user',
					id: uid,
				});
			});
		});

		postContainer.on('click', '[component="post/flagResolve"]', function () {
			const flagId = $(this).attr('data-flagId');
			require(['flags'], flags => {
				flags.resolve(flagId);
			});
		});

		postContainer.on('click', '[component="post/edit"]', function () {
			const button = $(this);

			const timestamp = Number.parseInt(getData(button, 'data-timestamp'), 10);
			const postEditDuration = Number.parseInt(ajaxify.data.postEditDuration, 10);

			if (checkDuration(postEditDuration, timestamp, 'post-edit-duration-expired')) {
				hooks.fire('action:composer.post.edit', {
					pid: getData(button, 'data-pid'),
				});
			}
		});

		if (config.enablePostHistory && ajaxify.data.privileges['posts:history']) {
			postContainer.on('click', '[component="post/view-history"], [component="post/edit-indicator"]', function () {
				const button = $(this);
				require(['forum/topic/diffs'], diffs => {
					diffs.open(getData(button, 'data-pid'));
				});
			});
		}

		postContainer.on('click', '[component="post/delete"]', function () {
			const button = $(this);
			const timestamp = Number.parseInt(getData(button, 'data-timestamp'), 10);
			const postDeleteDuration = Number.parseInt(ajaxify.data.postDeleteDuration, 10);
			if (checkDuration(postDeleteDuration, timestamp, 'post-delete-duration-expired')) {
				togglePostDelete($(this));
			}
		});

		function checkDuration(duration, postTimestamp, languageKey) {
			if (!ajaxify.data.privileges.isAdminOrMod && duration && Date.now() - postTimestamp > duration * 1000) {
				const numberDays = Math.floor(duration / 86_400);
				const numberHours = Math.floor((duration % 86_400) / 3600);
				const numberMinutes = Math.floor(((duration % 86_400) % 3600) / 60);
				const numberSeconds = ((duration % 86_400) % 3600) % 60;
				let message = '[[error:' + languageKey + ', ' + duration + ']]';
				if (numberDays) {
					message = numberHours ? '[[error:' + languageKey + '-days-hours, ' + numberDays + ', ' + numberHours + ']]' : '[[error:' + languageKey + '-days, ' + numberDays + ']]';
				} else if (numberHours) {
					message = numberMinutes ? '[[error:' + languageKey + '-hours-minutes, ' + numberHours + ', ' + numberMinutes + ']]' : '[[error:' + languageKey + '-hours, ' + numberHours + ']]';
				} else if (numberMinutes) {
					message = numberSeconds ? '[[error:' + languageKey + '-minutes-seconds, ' + numberMinutes + ', ' + numberSeconds + ']]' : '[[error:' + languageKey + '-minutes, ' + numberMinutes + ']]';
				}

				alerts.error(message);
				return false;
			}

			return true;
		}

		postContainer.on('click', '[component="post/restore"]', function () {
			togglePostDelete($(this));
		});

		postContainer.on('click', '[component="post/purge"]', function () {
			purgePost($(this));
		});

		postContainer.on('click', '[component="post/move"]', function () {
			const button = $(this);
			require(['forum/topic/move-post'], movePost => {
				movePost.init(button.parents('[data-pid]'));
			});
		});

		postContainer.on('click', '[component="post/change-owner"]', function () {
			const button = $(this);
			require(['forum/topic/change-owner'], changeOwner => {
				changeOwner.init(button.parents('[data-pid]'));
			});
		});

		postContainer.on('click', '[component="post/ban-ip"]', function () {
			const ip = $(this).attr('data-ip');
			socket.emit('blacklist.addRule', ip, error => {
				if (error) {
					return alerts.error(error);
				}

				alerts.success('[[admin/manage/blacklist:ban-ip]]');
			});
		});

		postContainer.on('click', '[component="post/chat"]', function () {
			openChat($(this));
		});
	}

	async function onReplyClicked(button, tid) {
		const selectedNode = await getSelectedNode();

		showStaleWarning(async () => {
			let username = await getUserSlug(button);
			if (getData(button, 'data-uid') === '0' || !getData(button, 'data-userslug')) {
				username = '';
			}

			const toPid = button.is('[component="post/reply"]') ? getData(button, 'data-pid') : null;
			const isQuoteToPid = !toPid || !selectedNode.pid || toPid === selectedNode.pid;

			if (selectedNode.text && isQuoteToPid) {
				username ||= selectedNode.username;
				hooks.fire('action:composer.addQuote', {
					tid,
					pid: toPid,
					topicName: ajaxify.data.titleRaw,
					username,
					text: selectedNode.text,
					selectedPid: selectedNode.pid,
				});
			} else {
				hooks.fire('action:composer.post.new', {
					tid,
					pid: toPid,
					topicName: ajaxify.data.titleRaw,
					text: username ? username + ' ' : ($('[component="topic/quickreply/text"]').val() || ''),
				});
			}
		});
	}

	async function onQuoteClicked(button, tid) {
		const selectedNode = await getSelectedNode();

		showStaleWarning(async () => {
			const username = await getUserSlug(button);
			const toPid = getData(button, 'data-pid');

			function quote(text) {
				hooks.fire('action:composer.addQuote', {
					tid,
					pid: toPid,
					username,
					topicName: ajaxify.data.titleRaw,
					text,
				});
			}

			if (selectedNode.text && toPid && toPid === selectedNode.pid) {
				return quote(selectedNode.text);
			}

			socket.emit('posts.getRawPost', toPid, (error, post) => {
				if (error) {
					return alerts.error(error);
				}

				quote(post);
			});
		});
	}
	// Async function onResolvedClicked(button) {
	//     button.html('<i class="fa fa-check-square"></i> Resolved');
	// }

	function onResolveClicked(pid) {
		const method = 'put';

		api[method](`/posts/${pid}/resolve`, undefined, error => {
			if (error) {
				return alerts.error(error);
			}

			hooks.fire('action:post.resolve', {pid});
		});
		return false;
	}

	async function getSelectedNode() {
		let selectedText = '';
		let selectedPid;
		let username = '';
		const selection = window.getSelection ? window.getSelection() : document.selection.createRange();
		const postContents = $('[component="post"] [component="post/content"]');
		let content;
		postContents.each((index, element) => {
			if (selection && selection.containsNode && element && selection.containsNode(element, true)) {
				content = element;
			}
		});

		if (content) {
			const bounds = document.createRange();
			bounds.selectNodeContents(content);
			const range = selection.getRangeAt(0).cloneRange();
			if (range.compareBoundaryPoints(Range.START_TO_START, bounds) < 0) {
				range.setStart(bounds.startContainer, bounds.startOffset);
			}

			if (range.compareBoundaryPoints(Range.END_TO_END, bounds) > 0) {
				range.setEnd(bounds.endContainer, bounds.endOffset);
			}

			bounds.detach();
			selectedText = range.toString();
			const postElement = $(content).parents('[component="post"]');
			selectedPid = postElement.attr('data-pid');
			username = await getUserSlug($(content));
			range.detach();
		}

		return {text: selectedText, pid: selectedPid, username};
	}

	function bookmarkPost(button, pid) {
		const method = button.attr('data-bookmarked') === 'false' ? 'put' : 'del';

		api[method](`/posts/${pid}/bookmark`, undefined, error => {
			if (error) {
				return alerts.error(error);
			}

			const type = method === 'put' ? 'bookmark' : 'unbookmark';
			hooks.fire(`action:post.${type}`, {pid});
		});
		return false;
	}

	function pinPost(button, pid) {
		/*
            Parameters: an HTML element representing the button we pressed,
            and a pid of the post we're interacting with.

            Returns: error or false if something goes wrong. Returns nothing
            if everything goes well, but fires a hook.
        */

		// We only really care about checking that the pid is a number
		console.assert(!(isNaN(pid)), 'pid argument to pinPost is not a valid number');

		const method = button.attr('data-pinned') === 'false' ? 'put' : 'del';

		// Make an API call as above to get the post pinned...
		api[method](`/posts/${pid}/pin`, undefined, error => {
			if (error) {
				return alerts.error(error);
			}

			const type = method === 'put' ? 'pin' : 'unpin';
			hooks.fire(`action:post.${type}`, {pid});
		});
		return false;
	}

	function getData(button, data) {
		return button.parents('[data-pid]').attr(data);
	}

	function getUserSlug(button) {
		return new Promise(resolve => {
			let slug = '';
			if (button.attr('component') === 'topic/reply') {
				resolve(slug);
				return;
			}

			const post = button.parents('[data-pid]');
			if (post.length > 0) {
				require(['slugify'], slugify => {
					slug = slugify(post.attr('data-username'), true);
					slug ||= post.attr('data-uid') === '0' ? '[[global:guest]]' : '[[global:former_user]]';

					if (slug && slug !== '[[global:former_user]]' && slug !== '[[global:guest]]') {
						slug = '@' + slug;
					}

					resolve(slug);
				});
				return;
			}

			resolve(slug);
		});
	}

	function togglePostDelete(button) {
		const pid = getData(button, 'data-pid');
		const postElement = components.get('post', 'pid', pid);
		const action = postElement.hasClass('deleted') ? 'restore' : 'delete';

		postAction(action, pid);
	}

	function purgePost(button) {
		postAction('purge', getData(button, 'data-pid'));
	}

	async function postAction(action, pid) {
		({action} = await hooks.fire(`static:post.${action}`, {action, pid}));
		if (!action) {
			return;
		}

		bootbox.confirm('[[topic:post_' + action + '_confirm]]', confirm => {
			if (!confirm) {
				return;
			}

			const route = action === 'purge' ? '' : '/state';
			const method = action === 'restore' ? 'put' : 'del';
			api[method](`/posts/${pid}${route}`).catch(alerts.error);
		});
	}

	function openChat(button) {
		const post = button.parents('[data-pid]');
		require(['chat'], chat => {
			chat.newChat(post.attr('data-uid'));
		});
		button.parents('.btn-group').find('.dropdown-toggle').click();
		return false;
	}

	function showStaleWarning(callback) {
		const staleThreshold
            = Math.min(Date.now() - (1000 * 60 * 60 * 24 * ajaxify.data.topicStaleDays), 8_640_000_000_000_000);
		if (staleReplyAnyway || ajaxify.data.lastposttime >= staleThreshold) {
			return callback();
		}

		const warning = bootbox.dialog({
			title: '[[topic:stale.title]]',
			message: '[[topic:stale.warning]]',
			buttons: {
				reply: {
					label: '[[topic:stale.reply_anyway]]',
					className: 'btn-link',
					callback() {
						staleReplyAnyway = true;
						callback();
					},
				},
				create: {
					label: '[[topic:stale.create]]',
					className: 'btn-primary',
					callback() {
						translator.translate('[[topic:link_back, ' + ajaxify.data.title + ', ' + config.relative_path + '/topic/' + ajaxify.data.slug + ']]', body => {
							hooks.fire('action:composer.topic.new', {
								cid: ajaxify.data.cid,
								body,
								fromStaleTopic: true,
							});
						});
					},
				},
			},
		});

		warning.modal();
	}

	const selectionChangeFunction = utils.debounce(selectionChange, 100);

	function handleSelectionTooltip() {
		if (!ajaxify.data.privileges['topics:reply']) {
			return;
		}

		hooks.onPage('action:posts.loaded', delayedTooltip);

		$(document).off('selectionchange', selectionChangeFunction).on('selectionchange', selectionChangeFunction);
	}

	function selectionChange() {
		const selectionEmpty = window.getSelection().toString() === '';
		if (selectionEmpty) {
			$('[component="selection/tooltip"]').addClass('hidden');
		} else {
			delayedTooltip();
		}
	}

	async function delayedTooltip() {
		let selectionTooltip = $('[component="selection/tooltip"]');
		selectionTooltip.addClass('hidden');
		if (selectionTooltip.attr('data-ajaxify') === '1') {
			selectionTooltip.remove();
			return;
		}

		const selection = window.getSelection();
		if (selection.focusNode && selection.type === 'Range' && ajaxify.data.template.topic) {
			const focusNode = $(selection.focusNode);
			const anchorNode = $(selection.anchorNode);
			const firstPid = anchorNode.parents('[data-pid]').attr('data-pid');
			const lastPid = focusNode.parents('[data-pid]').attr('data-pid');
			if (firstPid !== lastPid || focusNode.parents('[component="post/content"]').length === 0 || anchorNode.parents('[component="post/content"]').length === 0) {
				return;
			}

			const postElement = focusNode.parents('[data-pid]');
			const selectionRange = selection.getRangeAt(0);
			if (postElement.length === 0 || selectionRange.collapsed) {
				return;
			}

			const rects = selectionRange.getClientRects();
			const lastRect = rects.at(-1);

			if (selectionTooltip.length === 0) {
				selectionTooltip = await app.parseAndTranslate('partials/topic/selection-tooltip', ajaxify.data);
				selectionTooltip.addClass('hidden').appendTo('body');
			}

			selectionTooltip.off('click').on('click', '[component="selection/tooltip/quote"]', () => {
				selectionTooltip.addClass('hidden');
				onQuoteClicked(postElement.find('[component="post/quote"]'), ajaxify.data.tid);
			});
			selectionTooltip.removeClass('hidden');
			$(window).one('action:ajaxify.start', () => {
				selectionTooltip.attr('data-ajaxify', 1).addClass('hidden');
				$(document).off('selectionchange', selectionChangeFunction);
			});
			const tooltipWidth = selectionTooltip.outerWidth(true);
			selectionTooltip.css({
				top: lastRect.bottom + $(window).scrollTop(),
				left: tooltipWidth > lastRect.width ? lastRect.left : lastRect.left + lastRect.width - tooltipWidth,
			});
		}
	}

	return PostTools;
});
