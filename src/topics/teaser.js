
'use strict';

const _ = require('lodash');
const db = require('../database');
const meta = require('../meta');
const user = require('../user');
const posts = require('../posts');
const plugins = require('../plugins');
const utils = require('../utils');

module.exports = function (Topics) {
	Topics.getTeasers = async function (topics, options) {
		if (!Array.isArray(topics) || topics.length === 0) {
			return [];
		}

		let uid = options;
		let {teaserPost} = meta.config;
		if (typeof options === 'object') {
			uid = options.uid;
			teaserPost = options.teaserPost || meta.config.teaserPost;
		}

		const counts = [];
		const teaserPids = [];
		const tidToPost = {};

		for (const topic of topics) {
			counts.push(topic && topic.postcount);
			if (topic) {
				if (topic.teaserPid === 'null') {
					delete topic.teaserPid;
				}

				if (teaserPost === 'first') {
					teaserPids.push(topic.mainPid);
				} else if (teaserPost === 'last-post') {
					teaserPids.push(topic.teaserPid || topic.mainPid);
				} else { // Last-reply and everything else uses teaserPid like `last` that was used before
					teaserPids.push(topic.teaserPid);
				}
			}
		}

		const [allPostData, callerSettings] = await Promise.all([
			posts.getPostsFields(teaserPids, ['pid', 'uid', 'timestamp', 'tid', 'content']),
			user.getSettings(uid),
		]);
		let postData = allPostData.filter(post => post && post.pid);
		postData = await handleBlocks(uid, postData);
		postData = postData.filter(Boolean);
		const uids = _.uniq(postData.map(post => post.uid));
		const sortNewToOld = callerSettings.topicPostSort === 'newest_to_oldest';
		const usersData = await user.getUsersFields(uids, ['uid', 'username', 'userslug', 'picture']);

		const users = {};
		for (const user of usersData) {
			users[user.uid] = user;
		}

		for (const post of postData) {
			// If the post author isn't represented in the retrieved users' data,
			// then it means they were deleted, assume guest.
			if (!users.hasOwnProperty(post.uid)) {
				post.uid = 0;
			}

			post.user = users[post.uid];
			post.timestampISO = utils.toISOString(post.timestamp);
			tidToPost[post.tid] = post;
		}

		await Promise.all(postData.map(p => posts.parsePost(p)));

		const {tags} = await plugins.hooks.fire('filter:teasers.configureStripTags', {tags: utils.stripTags.slice(0)});

		const teasers = topics.map((topic, index) => {
			if (!topic) {
				return null;
			}

			const topicPost = tidToPost[topic.tid];
			if (topicPost) {
				topicPost.index = calculateTeaserIndex(teaserPost, counts[index], sortNewToOld);
				topicPost.content &&= utils.stripHTMLTags(replaceImgWithAltText(topicPost.content), tags);
			}

			return topicPost;
		});

		const result = await plugins.hooks.fire('filter:teasers.get', {teasers, uid});
		return result.teasers;
	};

	function calculateTeaserIndex(teaserPost, postCountInTopic, sortNewToOld) {
		if (teaserPost === 'first') {
			return 1;
		}

		if (sortNewToOld) {
			return Math.min(2, postCountInTopic);
		}

		return postCountInTopic;
	}

	function replaceImgWithAltText(string_) {
		return String(string_).replaceAll(/<img .*?alt="(.*?)"[^>]*>/gi, '$1');
	}

	async function handleBlocks(uid, teasers) {
		const blockedUids = await user.blocks.list(uid);
		if (blockedUids.length === 0) {
			return teasers;
		}

		return await Promise.all(teasers.map(async postData => {
			if (blockedUids.includes(Number.parseInt(postData.uid, 10))) {
				return await getPreviousNonBlockedPost(postData, blockedUids);
			}

			return postData;
		}));
	}

	async function getPreviousNonBlockedPost(postData, blockedUids) {
		let isBlocked = false;
		let previousPost = postData;
		const postsPerIteration = 5;
		let start = 0;
		let stop = start + postsPerIteration - 1;
		let checkedAllReplies = false;

		function checkBlocked(post) {
			const isPostBlocked = blockedUids.includes(Number.parseInt(post.uid, 10));
			previousPost = isPostBlocked ? previousPost : post;
			return isPostBlocked;
		}

		do {
			/* eslint-disable no-await-in-loop */
			let pids = await db.getSortedSetRevRange(`tid:${postData.tid}:posts`, start, stop);
			if (pids.length === 0) {
				checkedAllReplies = true;
				const mainPid = await Topics.getTopicField(postData.tid, 'mainPid');
				pids = [mainPid];
			}

			const previousPosts = await posts.getPostsFields(pids, ['pid', 'uid', 'timestamp', 'tid', 'content']);
			isBlocked = previousPosts.every(checkBlocked);
			start += postsPerIteration;
			stop = start + postsPerIteration - 1;
		} while (isBlocked && previousPost && previousPost.pid && !checkedAllReplies);

		return previousPost;
	}

	Topics.getTeasersByTids = async function (tids, uid) {
		if (!Array.isArray(tids) || tids.length === 0) {
			return [];
		}

		const topics = await Topics.getTopicsFields(tids, ['tid', 'postcount', 'teaserPid', 'mainPid']);
		return await Topics.getTeasers(topics, uid);
	};

	Topics.getTeaser = async function (tid, uid) {
		const teasers = await Topics.getTeasersByTids([tid], uid);
		return Array.isArray(teasers) && teasers.length > 0 ? teasers[0] : null;
	};

	Topics.updateTeaser = async function (tid) {
		let pid = await Topics.getLatestUndeletedReply(tid);
		pid ||= null;
		await (pid ? Topics.setTopicField(tid, 'teaserPid', pid) : Topics.deleteTopicField(tid, 'teaserPid'));
	};
};
