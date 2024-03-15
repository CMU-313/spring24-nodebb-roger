'use strict';

define('forum/topic/replies', ['forum/topic/posts', 'hooks', 'alerts'], (posts, hooks, alerts) => {
	const Replies = {};

	Replies.init = function (button) {
		const post = button.closest('[data-pid]');
		const pid = post.data('pid');
		const open = button.find('[component="post/replies/open"]');
		const loading = button.find('[component="post/replies/loading"]');
		const close = button.find('[component="post/replies/close"]');

		if (open.is(':not(.hidden)') && loading.is('.hidden')) {
			open.addClass('hidden');
			loading.removeClass('hidden');

			socket.emit('posts.getReplies', pid, (error, data) => {
				loading.addClass('hidden');
				if (error) {
					open.removeClass('hidden');
					return alerts.error(error);
				}

				close.removeClass('hidden');

				posts.modifyPostsByPrivileges(data);
				const tplData = {
					posts: data,
					privileges: ajaxify.data.privileges,
					'downvote:disabled': ajaxify.data['downvote:disabled'],
					'reputation:disabled': ajaxify.data['reputation:disabled'],
					loggedIn: Boolean(app.user.uid),
					hideReplies: config.hasOwnProperty('showNestedReplies') ? !config.showNestedReplies : true,
				};
				app.parseAndTranslate('topic', 'posts', tplData, html => {
					const repliesElement = $('<div>', {component: 'post/replies'}).html(html).hide();
					if (button.attr('data-target-component')) {
						post.find('[component="' + button.attr('data-target-component') + '"]').html(repliesElement);
					} else {
						repliesElement.insertAfter(button);
					}

					repliesElement.slideDown('fast');
					posts.onNewPostsAddedToDom(html);
					hooks.fire('action:posts.loaded', {posts: data});
				});
			});
		} else if (close.is(':not(.hidden)')) {
			close.addClass('hidden');
			open.removeClass('hidden');
			loading.addClass('hidden');
			post.find('[component="post/replies"]').slideUp('fast', function () {
				$(this).remove();
			});
		}
	};

	Replies.onNewPost = function (data) {
		const post = data.posts[0];
		if (!post) {
			return;
		}

		incrementCount(post, 1);
		data.hideReplies = config.hasOwnProperty('showNestedReplies') ? !config.showNestedReplies : true;
		app.parseAndTranslate('topic', 'posts', data, html => {
			const replies = $('[component="post"][data-pid="' + post.toPid + '"] [component="post/replies"]').first();
			if (replies.length > 0) {
				if (config.topicPostSort === 'newest_to_oldest') {
					replies.prepend(html);
				} else {
					replies.append(html);
				}

				posts.onNewPostsAddedToDom(html);
			}
		});
	};

	Replies.onPostPurged = function (post) {
		incrementCount(post, -1);
	};

	function incrementCount(post, increment) {
		const replyCount = $('[component="post"][data-pid="' + post.toPid + '"]').find('[component="post/reply-count"]').first();
		const countElement = replyCount.find('[component="post/reply-count/text"]');
		const avatars = replyCount.find('[component="post/reply-count/avatars"]');
		const count = Math.max(0, Number.parseInt(countElement.attr('data-replies'), 10) + increment);
		const timestamp = replyCount.find('.timeago').attr('title', post.timestampISO);

		countElement.attr('data-replies', count);
		replyCount.toggleClass('hidden', count <= 0);
		if (count > 1) {
			countElement.translateText('[[topic:replies_to_this_post, ' + count + ']]');
		} else {
			countElement.translateText('[[topic:one_reply_to_this_post]]');
		}

		if (avatars.find('[data-uid="' + post.uid + '"]').length === 0 && count < 7) {
			app.parseAndTranslate('topic', 'posts', {posts: [{replies: {users: [post.user]}}]}, html => {
				avatars.prepend(html.find('[component="post/reply-count/avatars"] [component="avatar/picture"]'));
			});
		}

		avatars.addClass('hasMore');

		timestamp.data('timeago', null).timeago();
	}

	return Replies;
});
