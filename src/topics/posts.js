
'use strict';

// JS requirement
const assert = require('node:assert');
const _ = require('lodash');
const validator = require('validator');
const nconf = require('nconf');
const db = require('../database');
const user = require('../user');
const posts = require('../posts');
const meta = require('../meta');
const plugins = require('../plugins');
const utils = require('../utils');

const backlinkRegex = new RegExp(`(?:${nconf.get('url').replace('/', '\\/')}|\b|\\s)\\/topic\\/(\\d+)(?:\\/\\w+)?`, 'g');

module.exports = function (Topics) {
	Topics.onNewPostMade = async function (postData) {
		await Topics.updateLastPostTime(postData.tid, postData.timestamp);
		await Topics.addPostToTopic(postData.tid, postData);
	};

	Topics.getTopicPinnedPosts = async function (topicData, uid) {
		/*
            Parameters:
                - `topicData`: an object with information about the topic
                - `uid`: the user id

            Returns: a list of post objects, all of which are pinned
        */

		assert(topicData.hasOwnProperty('tid'), 'topicData has no tid field!');
		assert(typeof topicData.tid === typeof 1);
		assert(topicData.hasOwnProperty('uid'), 'topicData has no uid field!');
		assert(typeof topicData.uid === typeof 1);

		// Let's just get *all* the posts belonging to this `tid`
		const allPids = await db.getSortedSetMembers(`tid:${topicData.tid}:posts`);

		// Then filter by pinned
		const postData = await posts.getPostsByPids(allPids, uid);
		let pinnedPosts = postData.filter(
			postObject => postObject.pinned,
		);

		pinnedPosts = await Topics.addPostData(pinnedPosts, uid);

		function hasCorrectFields(postData) {
			return (
				postData.hasOwnProperty('pid')
                && (typeof postData.pid === typeof 1)
                && postData.hasOwnProperty('tid')
                && (typeof postData.tid === typeof 1)
                && postData.hasOwnProperty('pinned')
                && (typeof postData.pinned === typeof 1)
			);
		}

		assert(pinnedPosts.every(hasCorrectFields));

		return pinnedPosts;
	};

	Topics.getTopicPosts = async function (topicData, set, start, stop, uid, reverse) {
		if (!topicData) {
			return [];
		}

		let repliesStart = start;
		let repliesStop = stop;
		if (stop > 0) {
			repliesStop -= 1;
			if (start > 0) {
				repliesStart -= 1;
			}
		}

		let pids = [];
		if (start !== 0 || stop !== 0) {
			pids = await posts.getPidsFromSet(set, repliesStart, repliesStop, reverse);
		}

		if (pids.length === 0 && !topicData.mainPid) {
			return [];
		}

		if (topicData.mainPid && start === 0) {
			pids.unshift(topicData.mainPid);
		}

		let postData = await posts.getPostsByPids(pids, uid);
		if (postData.length === 0) {
			return [];
		}

		let replies = postData;
		if (topicData.mainPid && start === 0) {
			postData[0].index = 0;
			replies = postData.slice(1);
		}

		Topics.calculatePostIndices(replies, repliesStart);
		await addEventStartEnd(postData, set, reverse, topicData);
		const allPosts = postData.slice();
		postData = await user.blocks.filter(uid, postData);
		if (allPosts.length !== postData.length) {
			const includedPids = new Set(postData.map(p => p.pid));
			for (const [index, p] of allPosts.reverse().entries()) {
				if (!includedPids.has(p.pid) && allPosts[index + 1] && !reverse) {
					allPosts[index + 1].eventEnd = p.eventEnd;
				}
			}
		}

		const result = await plugins.hooks.fire('filter:topic.getPosts', {
			topic: topicData,
			uid,
			posts: await Topics.addPostData(postData, uid),
		});
		return result.posts;
	};

	async function addEventStartEnd(postData, set, reverse, topicData) {
		if (postData.length === 0) {
			return;
		}

		for (const [index, p] of postData.entries()) {
			if (p && p.index === 0 && reverse) {
				p.eventStart = topicData.lastposttime;
				p.eventEnd = Date.now();
			} else if (p && postData[index + 1]) {
				p.eventStart = reverse ? postData[index + 1].timestamp : p.timestamp;
				p.eventEnd = reverse ? p.timestamp : postData[index + 1].timestamp;
			}
		}

		const lastPost = postData.at(-1);
		if (lastPost) {
			lastPost.eventStart = reverse ? topicData.timestamp : lastPost.timestamp;
			lastPost.eventEnd = reverse ? lastPost.timestamp : Date.now();
			if (lastPost.index) {
				const nextPost = await db[reverse ? 'getSortedSetRevRangeWithScores' : 'getSortedSetRangeWithScores'](set, lastPost.index, lastPost.index);
				if (reverse) {
					lastPost.eventStart = nextPost.length > 0 ? nextPost[0].score : lastPost.eventStart;
				} else {
					lastPost.eventEnd = nextPost.length > 0 ? nextPost[0].score : lastPost.eventEnd;
				}
			}
		}
	}

	Topics.addPostData = async function (postData, uid) {
		if (!Array.isArray(postData) || postData.length === 0) {
			return [];
		}

		const pids = postData.map(post => post && post.pid);

		async function getPostUserData(field, method) {
			const uids = _.uniq(postData.filter(p => p && Number.parseInt(p[field], 10) >= 0).map(p => p[field]));
			const userData = await method(uids);
			return _.zipObject(uids, userData);
		}

		const [
			bookmarks,
			voteData,
			userData,
			editors,
			replies,
		] = await Promise.all([
			posts.hasBookmarked(pids, uid),
			posts.getVoteStatusByPostIDs(pids, uid),
			getPostUserData('uid', async uids => await posts.getUserInfoForPosts(uids, uid)),
			getPostUserData('editor', async uids => await user.getUsersFields(uids, ['uid', 'username', 'userslug'])),
			getPostReplies(pids, uid),
			Topics.addParentPosts(postData),
		]);

		for (const [i, postObject] of postData.entries()) {
			if (postObject) {
				postObject.user = postObject.uid ? userData[postObject.uid] : {...userData[postObject.uid]};
				postObject.editor = postObject.editor ? editors[postObject.editor] : null;
				postObject.bookmarked = bookmarks[i];
				postObject.upvoted = voteData.upvotes[i];
				postObject.downvoted = voteData.downvotes[i];
				postObject.votes = postObject.votes || 0;
				postObject.replies = replies[i];
				postObject.selfPost = Number.parseInt(uid, 10) > 0 && Number.parseInt(uid, 10) === postObject.uid;

				// Username override for guests, if enabled
				if (meta.config.allowGuestHandles && postObject.uid === 0 && postObject.handle) {
					postObject.user.username = validator.escape(String(postObject.handle));
					postObject.user.displayname = postObject.user.username;
				}
			}
		}

		const result = await plugins.hooks.fire('filter:topics.addPostData', {
			posts: postData,
			uid,
		});
		return result.posts;
	};

	Topics.modifyPostsByPrivilege = function (topicData, topicPrivileges) {
		const loggedIn = Number.parseInt(topicPrivileges.uid, 10) > 0;

		function modifyPost(post) {
			if (post) {
				post.topicOwnerPost = Number.parseInt(topicData.uid, 10) === Number.parseInt(post.uid, 10);
				post.display_edit_tools = topicPrivileges.isAdminOrMod || (post.selfPost && topicPrivileges['posts:edit']);
				post.display_delete_tools = topicPrivileges.isAdminOrMod || (post.selfPost && topicPrivileges['posts:delete']);
				post.display_moderator_tools = post.display_edit_tools || post.display_delete_tools;
				post.display_move_tools = topicPrivileges.isAdminOrMod && post.index !== 0;
				post.display_post_menu = topicPrivileges.isAdminOrMod
                    || (post.selfPost
                        && ((!topicData.locked && !post.deleted)
                        || (post.deleted && Number.parseInt(post.deleterUid, 10) === Number.parseInt(topicPrivileges.uid, 10))))
                    || ((loggedIn || topicData.postSharing.length) && !post.deleted);
				post.ip = topicPrivileges.isAdminOrMod ? post.ip : undefined;

				posts.modifyPostByPrivilege(post, topicPrivileges);
			}
		}

		for (const post of topicData.posts) {
			modifyPost(post);
		}

		if (topicData.hasOwnProperty('pinnedPosts')) {
			for (const post of topicData.pinnedPosts) {
				modifyPost(post);
			}
		}
	};

	Topics.addParentPosts = async function (postData) {
		let parentPids = postData.map(postObject => (postObject && postObject.hasOwnProperty('toPid') ? Number.parseInt(postObject.toPid, 10) : null)).filter(Boolean);

		if (parentPids.length === 0) {
			return;
		}

		parentPids = _.uniq(parentPids);
		const parentPosts = await posts.getPostsFields(parentPids, ['uid']);
		const parentUids = _.uniq(parentPosts.map(postObject => postObject && postObject.uid));
		const userData = await user.getUsersFields(parentUids, ['username']);

		const usersMap = {};
		for (const user of userData) {
			usersMap[user.uid] = user.username;
		}

		const parents = {};
		for (const [i, post] of parentPosts.entries()) {
			parents[parentPids[i]] = {username: usersMap[post.uid]};
		}

		for (const post of postData) {
			post.parent = parents[post.toPid];
		}
	};

	Topics.calculatePostIndices = function (posts, start) {
		for (const [index, post] of posts.entries()) {
			if (post) {
				post.index = start + index + 1;
			}
		}
	};

	Topics.getLatestUndeletedPid = async function (tid) {
		const pid = await Topics.getLatestUndeletedReply(tid);
		if (pid) {
			return pid;
		}

		const mainPid = await Topics.getTopicField(tid, 'mainPid');
		const mainPost = await posts.getPostFields(mainPid, ['pid', 'deleted']);
		return mainPost.pid && !mainPost.deleted ? mainPost.pid : null;
	};

	Topics.getLatestUndeletedReply = async function (tid) {
		let isDeleted = false;
		let index = 0;
		do {
			/* eslint-disable no-await-in-loop */
			const pids = await db.getSortedSetRevRange(`tid:${tid}:posts`, index, index);
			if (pids.length === 0) {
				return null;
			}

			isDeleted = await posts.getPostField(pids[0], 'deleted');
			if (!isDeleted) {
				return Number.parseInt(pids[0], 10);
			}

			index += 1;
		} while (isDeleted);
	};

	Topics.addPostToTopic = async function (tid, postData) {
		const mainPid = await Topics.getTopicField(tid, 'mainPid');
		if (Number.parseInt(mainPid, 10)) {
			const upvotes = Number.parseInt(postData.upvotes, 10) || 0;
			const downvotes = Number.parseInt(postData.downvotes, 10) || 0;
			const votes = upvotes - downvotes;
			await db.sortedSetsAdd([
				`tid:${tid}:posts`, `tid:${tid}:posts:votes`,
			], [postData.timestamp, votes], postData.pid);
		} else {
			await Topics.setTopicField(tid, 'mainPid', postData.pid);
		}

		await Topics.increasePostCount(tid);
		await db.sortedSetIncrBy(`tid:${tid}:posters`, 1, postData.uid);
		const posterCount = await db.sortedSetCard(`tid:${tid}:posters`);
		await Topics.setTopicField(tid, 'postercount', posterCount);
		await Topics.updateTeaser(tid);
	};

	Topics.removePostFromTopic = async function (tid, postData) {
		await db.sortedSetsRemove([
			`tid:${tid}:posts`,
			`tid:${tid}:posts:votes`,
		], postData.pid);
		await Topics.decreasePostCount(tid);
		await db.sortedSetIncrBy(`tid:${tid}:posters`, -1, postData.uid);
		await db.sortedSetsRemoveRangeByScore([`tid:${tid}:posters`], '-inf', 0);
		const posterCount = await db.sortedSetCard(`tid:${tid}:posters`);
		await Topics.setTopicField(tid, 'postercount', posterCount);
		await Topics.updateTeaser(tid);
	};

	Topics.getPids = async function (tid) {
		let [mainPid, pids] = await Promise.all([
			Topics.getTopicField(tid, 'mainPid'),
			db.getSortedSetRange(`tid:${tid}:posts`, 0, -1),
		]);
		if (Number.parseInt(mainPid, 10)) {
			pids = [mainPid].concat(pids);
		}

		return pids;
	};

	Topics.increasePostCount = async function (tid) {
		incrementFieldAndUpdateSortedSet(tid, 'postcount', 1, 'topics:posts');
	};

	Topics.decreasePostCount = async function (tid) {
		incrementFieldAndUpdateSortedSet(tid, 'postcount', -1, 'topics:posts');
	};

	Topics.increaseViewCount = async function (tid) {
		const cid = await Topics.getTopicField(tid, 'cid');
		incrementFieldAndUpdateSortedSet(tid, 'viewcount', 1, ['topics:views', `cid:${cid}:tids:views`]);
	};

	async function incrementFieldAndUpdateSortedSet(tid, field, by, set) {
		const value = await db.incrObjectFieldBy(`topic:${tid}`, field, by);
		await db[Array.isArray(set) ? 'sortedSetsAdd' : 'sortedSetAdd'](set, value, tid);
	}

	Topics.getTitleByPid = async function (pid) {
		return await Topics.getTopicFieldByPid('title', pid);
	};

	Topics.getTopicFieldByPid = async function (field, pid) {
		const tid = await posts.getPostField(pid, 'tid');
		return await Topics.getTopicField(tid, field);
	};

	Topics.getTopicDataByPid = async function (pid) {
		const tid = await posts.getPostField(pid, 'tid');
		return await Topics.getTopicData(tid);
	};

	Topics.getPostCount = async function (tid) {
		return await db.getObjectField(`topic:${tid}`, 'postcount');
	};

	async function getPostReplies(pids, callerUid) {
		const keys = pids.map(pid => `pid:${pid}:replies`);
		const arrayOfReplyPids = await db.getSortedSetsMembers(keys);

		const uniquePids = _.uniq(arrayOfReplyPids.flat());

		let replyData = await posts.getPostsFields(uniquePids, ['pid', 'uid', 'timestamp']);
		const result = await plugins.hooks.fire('filter:topics.getPostReplies', {
			uid: callerUid,
			replies: replyData,
		});
		replyData = await user.blocks.filter(callerUid, result.replies);

		const uids = replyData.map(replyData => replyData && replyData.uid);

		const uniqueUids = _.uniq(uids);

		const userData = await user.getUsersWithFields(uniqueUids, ['uid', 'username', 'userslug', 'picture'], callerUid);

		const uidMap = _.zipObject(uniqueUids, userData);
		const pidMap = _.zipObject(replyData.map(r => r.pid), replyData);

		const returnData = arrayOfReplyPids.map(replyPids => {
			replyPids = replyPids.filter(pid => pidMap[pid]);
			const uidsUsed = {};
			const currentData = {
				hasMore: false,
				users: [],
				text: replyPids.length > 1 ? `[[topic:replies_to_this_post, ${replyPids.length}]]` : '[[topic:one_reply_to_this_post]]',
				count: replyPids.length,
				timestampISO: replyPids.length > 0 ? utils.toISOString(pidMap[replyPids[0]].timestamp) : undefined,
			};

			replyPids.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

			for (const replyPid of replyPids) {
				const replyData = pidMap[replyPid];
				if (!uidsUsed[replyData.uid] && currentData.users.length < 6) {
					currentData.users.push(uidMap[replyData.uid]);
					uidsUsed[replyData.uid] = true;
				}
			}

			if (currentData.users.length > 5) {
				currentData.users.pop();
				currentData.hasMore = true;
			}

			return currentData;
		});

		return returnData;
	}

	Topics.syncBacklinks = async postData => {
		if (!postData) {
			throw new Error('[[error:invalid-data]]');
		}

		// Scan post content for topic links
		const matches = [...postData.content.matchAll(backlinkRegex)];
		if (!matches) {
			return 0;
		}

		const {pid, uid, tid} = postData;
		let add = _.uniq(matches.map(match => match[1]).map(tid => Number.parseInt(tid, 10)));

		const now = Date.now();
		const topicsExist = await Topics.exists(add);
		const current = (await db.getSortedSetMembers(`pid:${pid}:backlinks`)).map(tid => Number.parseInt(tid, 10));
		const remove = current.filter(tid => !add.includes(tid));
		add = add.filter((_tid, index) => topicsExist[index] && !current.includes(_tid) && tid !== _tid);

		// Remove old backlinks
		await db.sortedSetRemove(`pid:${pid}:backlinks`, remove);

		// Add new backlinks
		await db.sortedSetAdd(`pid:${pid}:backlinks`, add.map(() => now), add);
		await Promise.all(add.map(async tid => {
			await Topics.events.log(tid, {
				uid,
				type: 'backlink',
				href: `/post/${pid}`,
			});
		}));

		return add.length + (current - remove);
	};
};
