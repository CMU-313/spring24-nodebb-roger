
'use strict';

define('forum/topic/events', [
	'forum/topic/postTools',
	'forum/topic/threadTools',
	'forum/topic/posts',
	'forum/topic/images',
	'components',
	'translator',
	'benchpress',
	'hooks',
], (postTools, threadTools, posts, images, components, translator, Benchpress, hooks) => {
	const Events = {};

	const events = {
		'event:user_status_change': onUserStatusChange,
		'event:voted': updatePostVotesAndUserReputation,
		'event:bookmarked': updateBookmarkCount,

		'event:topic_deleted': threadTools.setDeleteState,
		'event:topic_restored': threadTools.setDeleteState,
		'event:topic_purged': onTopicPurged,

		'event:topic_locked': threadTools.setLockedState,
		'event:topic_unlocked': threadTools.setLockedState,

		'event:topic_pinned': threadTools.setPinnedState,
		'event:topic_unpinned': threadTools.setPinnedState,

		'event:topic_private': threadTools.setPrivateState,
		'event:topic_public': threadTools.setPrivateState,

		'event:topic_moved': onTopicMoved,

		'event:post_edited': onPostEdited,
		'event:post_purged': onPostPurged,

		'event:post_deleted': togglePostDeleteState,
		'event:post_restored': togglePostDeleteState,

		'posts.bookmark': togglePostBookmark,
		'posts.unbookmark': togglePostBookmark,

		'posts.resolve': togglePostResolve,

		/*
            Since this change does not depend on the signature of this
            function at all, I will just assert type information in the
            function itself for now -- tkroenin
        */
		'posts.pin': togglePostPinned,
		'posts.unpin': togglePostPinned,

		'posts.upvote': togglePostVote,
		'posts.downvote': togglePostVote,
		'posts.unvote': togglePostVote,

		'event:new_notification': onNewNotification,
		'event:new_post': posts.onNewPost,
	};

	Events.init = function () {
		Events.removeListeners();
		for (const eventName in events) {
			if (events.hasOwnProperty(eventName)) {
				socket.on(eventName, events[eventName]);
			}
		}
	};

	Events.removeListeners = function () {
		for (const eventName in events) {
			if (events.hasOwnProperty(eventName)) {
				socket.removeListener(eventName, events[eventName]);
			}
		}
	};

	function onUserStatusChange(data) {
		app.updateUserStatus($('[data-uid="' + data.uid + '"] [component="user/status"]'), data.status);
	}

	function updatePostVotesAndUserReputation(data) {
		const votes = $('[data-pid="' + data.post.pid + '"] [component="post/vote-count"]').filter((index, element) => Number.parseInt($(element).closest('[data-pid]').attr('data-pid'), 10) === Number.parseInt(data.post.pid, 10));
		const reputationElements = $('.reputation[data-uid="' + data.post.uid + '"]');
		votes.html(data.post.votes).attr('data-votes', data.post.votes);
		reputationElements.html(data.user.reputation).attr('data-reputation', data.user.reputation);
	}

	function updateBookmarkCount(data) {
		$('[data-pid="' + data.post.pid + '"] .bookmarkCount').filter((index, element) => Number.parseInt($(element).closest('[data-pid]').attr('data-pid'), 10) === Number.parseInt(data.post.pid, 10)).html(data.post.bookmarks).attr('data-bookmarks', data.post.bookmarks);
	}

	function onTopicPurged(data) {
		if (
			ajaxify.data.category
            && ajaxify.data.category.slug
            && Number.parseInt(data.tid, 10) === Number.parseInt(ajaxify.data.tid, 10)
		) {
			ajaxify.go('category/' + ajaxify.data.category.slug, null, true);
		}
	}

	function onTopicMoved(data) {
		if (data && data.slug && Number.parseInt(data.tid, 10) === Number.parseInt(ajaxify.data.tid, 10)) {
			ajaxify.go('topic/' + data.slug, null, true);
		}
	}

	function onPostEdited(data) {
		if (!data || !data.post || Number.parseInt(data.post.tid, 10) !== Number.parseInt(ajaxify.data.tid, 10)) {
			return;
		}

		const editedPostElement = components.get('post/content', data.post.pid).filter((index, element) => Number.parseInt($(element).closest('[data-pid]').attr('data-pid'), 10) === Number.parseInt(data.post.pid, 10));

		const editorElement = $('[data-pid="' + data.post.pid + '"] [component="post/editor"]').filter((index, element) => Number.parseInt($(element).closest('[data-pid]').attr('data-pid'), 10) === Number.parseInt(data.post.pid, 10));
		const topicTitle = components.get('topic/title');
		const navbarTitle = components.get('navbar/title').find('span');
		const breadCrumb = components.get('breadcrumb/current');

		if (data.topic.rescheduled) {
			return ajaxify.go('topic/' + data.topic.slug, null, true);
		}

		if (topicTitle.length > 0 && data.topic.title && data.topic.renamed) {
			ajaxify.data.title = data.topic.title;
			const newUrl = 'topic/' + data.topic.slug + (window.location.search ? window.location.search : '');
			history.replaceState({url: newUrl}, null, window.location.protocol + '//' + window.location.host + config.relative_path + '/' + newUrl);

			topicTitle.fadeOut(250, () => {
				topicTitle.html(data.topic.title).fadeIn(250);
			});
			breadCrumb.fadeOut(250, () => {
				breadCrumb.html(data.topic.title).fadeIn(250);
			});
			navbarTitle.fadeOut(250, () => {
				navbarTitle.html(data.topic.title).fadeIn(250);
			});
		}

		if (data.post.changed) {
			editedPostElement.fadeOut(250, () => {
				editedPostElement.html(translator.unescape(data.post.content));
				editedPostElement.find('img:not(.not-responsive)').addClass('img-responsive');
				images.wrapImagesInLinks(editedPostElement.parent());
				posts.addBlockquoteEllipses(editedPostElement.parent());
				editedPostElement.fadeIn(250);

				const editData = {
					editor: data.editor,
					editedISO: utils.toISOString(data.post.edited),
				};

				app.parseAndTranslate('partials/topic/post-editor', editData, html => {
					editorElement.replaceWith(html);
					$('[data-pid="' + data.post.pid + '"] [component="post/editor"] .timeago').timeago();
					hooks.fire('action:posts.edited', data);
				});
			});
		} else {
			hooks.fire('action:posts.edited', data);
		}

		if (data.topic.tags && data.topic.tagsupdated) {
			Benchpress.render('partials/topic/tags', {tags: data.topic.tags}).then(html => {
				const tags = $('.tags');

				tags.fadeOut(250, () => {
					tags.html(html).fadeIn(250);
				});
			});
		}

		postTools.removeMenu(components.get('post', 'pid', data.post.pid));
	}

	function onPostPurged(postData) {
		if (!postData || Number.parseInt(postData.tid, 10) !== Number.parseInt(ajaxify.data.tid, 10)) {
			return;
		}

		components.get('post', 'pid', postData.pid).fadeOut(500, function () {
			$(this).remove();
			posts.showBottomPostBar();
		});
		ajaxify.data.postcount -= 1;
		postTools.updatePostCount(ajaxify.data.postcount);
		require(['forum/topic/replies'], replies => {
			replies.onPostPurged(postData);
		});
	}

	function togglePostDeleteState(data) {
		const postElement = components.get('post', 'pid', data.pid);

		if (postElement.length === 0) {
			return;
		}

		postElement.toggleClass('deleted');
		const isDeleted = postElement.hasClass('deleted');
		postTools.toggle(data.pid, isDeleted);

		if (!ajaxify.data.privileges.isAdminOrMod && Number.parseInt(data.uid, 10) !== Number.parseInt(app.user.uid, 10)) {
			postElement.find('[component="post/tools"]').toggleClass('hidden', isDeleted);
			if (isDeleted) {
				postElement.find('[component="post/content"]').translateHtml('[[topic:post_is_deleted]]');
			} else {
				postElement.find('[component="post/content"]').html(translator.unescape(data.content));
			}
		}
	}

	function togglePostBookmark(data) {
		const element = $('[data-pid="' + data.post.pid + '"] [component="post/bookmark"]').filter((index, element_) => Number.parseInt($(element_).closest('[data-pid]').attr('data-pid'), 10) === Number.parseInt(data.post.pid, 10));
		if (element.length === 0) {
			return;
		}

		element.attr('data-bookmarked', data.isBookmarked);

		element.find('[component="post/bookmark/on"]').toggleClass('hidden', !data.isBookmarked);
		element.find('[component="post/bookmark/off"]').toggleClass('hidden', data.isBookmarked);
	}

	function togglePostPinned(data) {
		/*
            Parameters:
            Takes in a parameter `data`. For the purposes of this function, we
            only care that it contains a field corresponding to information
            about an individual post, and that this field tracks the post's
            tid (an int).

            Returns:
            Nothing - this is a hook that redirects the user to the 'top' of
            the topic.
        */

		/* I think this style of assertion is the best you can do in front-end
           code */
		console.assert(data.hasOwnProperty('post'), 'Data has no post property');
		console.assert(data.post.hasOwnProperty('tid'), 'Post field has not tid property');
		console.assert(typeof (data.post.tid) === typeof (1), `Expected type 'number' for 'tid' field, but got ${typeof (data.post.tid)}`);

		// Just redirect the user back to the top of the topic
		if (data) {
			ajaxify.go('topic/' + data.post.tid, null, true);
		}

		// Nothing to assert for the return
	}

	function togglePostResolve(data) {
		const post = $('[data-pid="' + data.post.pid + '"]');
		post.find('[component="post/resolved"]').toggleClass('hidden', !data.isResolved);
		post.find('[component="post/resolve"]').toggleClass('hidden', data.isResolved);
	}

	function togglePostVote(data) {
		const post = $('[data-pid="' + data.post.pid + '"]');
		post.find('[component="post/upvote"]').filter((index, element) => Number.parseInt($(element).closest('[data-pid]').attr('data-pid'), 10) === Number.parseInt(data.post.pid, 10)).toggleClass('upvoted', data.upvote);
		post.find('[component="post/downvote"]').filter((index, element) => Number.parseInt($(element).closest('[data-pid]').attr('data-pid'), 10) === Number.parseInt(data.post.pid, 10)).toggleClass('downvoted', data.downvote);
	}

	function onNewNotification(data) {
		const tid = ajaxify.data.tid;
		if (data && data.tid && Number.parseInt(data.tid, 10) === Number.parseInt(tid, 10)) {
			socket.emit('topics.markTopicNotificationsRead', [tid]);
		}
	}

	return Events;
});
