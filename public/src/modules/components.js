'use strict';

define('components', () => {
	const components = {};

	components.core = {
		'topic/teaser'(tid) {
			if (tid) {
				return $('[component="category/topic"][data-tid="' + tid + '"] [component="topic/teaser"]');
			}

			return $('[component="topic/teaser"]');
		},
		topic(name, value) {
			return $('[component="topic"][data-' + name + '="' + value + '"]');
		},
		post(name, value) {
			return $('[component="post"][data-' + name + '="' + value + '"]');
		},
		'post/content'(pid) {
			return $('[component="post"][data-pid="' + pid + '"] [component="post/content"]');
		},
		'post/header'(pid) {
			return $('[component="post"][data-pid="' + pid + '"] [component="post/header"]');
		},
		'post/anchor'(index) {
			return $('[component="post"][data-index="' + index + '"] [component="post/anchor"]');
		},
		'post/vote-count'(pid) {
			return $('[component="post"][data-pid="' + pid + '"] [component="post/vote-count"]');
		},
		'post/bookmark-count'(pid) {
			return $('[component="post"][data-pid="' + pid + '"] [component="post/bookmark-count"]');
		},

		'user/postcount'(uid) {
			return $('[component="user/postcount"][data-uid="' + uid + '"]');
		},
		'user/reputation'(uid) {
			return $('[component="user/reputation"][data-uid="' + uid + '"]');
		},

		'category/topic'(name, value) {
			return $('[component="category/topic"][data-' + name + '="' + value + '"]');
		},

		'categories/category'(name, value) {
			return $('[component="categories/category"][data-' + name + '="' + value + '"]');
		},

		'chat/message'(messageId) {
			return $('[component="chat/message"][data-mid="' + messageId + '"]');
		},

		'chat/message/body'(messageId) {
			return $('[component="chat/message"][data-mid="' + messageId + '"] [component="chat/message/body"]');
		},

		'chat/recent/room'(roomid) {
			return $('[component="chat/recent/room"][data-roomid="' + roomid + '"]');
		},
	};

	components.get = function () {
		const arguments_ = Array.prototype.slice.call(arguments, 1);

		if (components.core[arguments[0]] && arguments_.length > 0) {
			return components.core[arguments[0]].apply(this, arguments_);
		}

		return $('[component="' + arguments[0] + '"]');
	};

	return components;
});
