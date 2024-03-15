'use strict';

const _ = require('lodash');
const validator = require('validator');
const db = require('../database');
const posts = require('../posts');
const utils = require('../utils');
const plugins = require('../plugins');
const meta = require('../meta');
const user = require('../user');
const categories = require('../categories');
const privileges = require('../privileges');
const social = require('../social');

const Topics = module.exports;

require('./data')(Topics);
require('./create')(Topics);
require('./delete')(Topics);
require('./sorted')(Topics);
require('./unread')(Topics);
require('./recent')(Topics);
require('./user')(Topics);
require('./fork')(Topics);
require('./private')(Topics);
require('./posts')(Topics);
require('./follow')(Topics);
require('./tags')(Topics);
require('./teaser')(Topics);
Topics.scheduled = require('./scheduled');
require('./suggested')(Topics);
require('./tools')(Topics);
Topics.thumbs = require('./thumbs');
require('./bookmarks')(Topics);
require('./merge')(Topics);
Topics.events = require('./events');

Topics.exists = async function (tids) {
	return await db.exists(
		Array.isArray(tids) ? tids.map(tid => `topic:${tid}`) : `topic:${tids}`,
	);
};

Topics.getTopicsFromSet = async function (set, uid, start, stop) {
	const tids = await db.getSortedSetRevRange(set, start, stop);
	const topics = await Topics.getTopics(tids, uid);
	Topics.calculateTopicIndices(topics, start);
	return {topics, nextStart: stop + 1};
};

Topics.getTopics = async function (tids, options) {
	let uid = options;
	if (typeof options === 'object') {
		uid = options.uid;
	}

	tids = await privileges.topics.filterTids('topics:read', tids, uid);
	return await Topics.getTopicsByTids(tids, options);
};

Topics.getTopicsByTids = async function (tids, options) {
	if (!Array.isArray(tids) || tids.length === 0) {
		return [];
	}

	let uid = options;
	if (typeof options === 'object') {
		uid = options.uid;
	}

	async function loadTopics() {
		const topics = await Topics.getTopicsData(tids);
		const uids = _.uniq(topics.map(t => t && t.uid && t.uid.toString()).filter(v => utils.isNumber(v)));
		const cids = _.uniq(topics.map(t => t && t.cid && t.cid.toString()).filter(v => utils.isNumber(v)));
		const guestTopics = topics.filter(t => t && t.uid === 0);

		async function loadGuestHandles() {
			const mainPids = guestTopics.map(t => t.mainPid);
			const postData = await posts.getPostsFields(mainPids, ['handle']);
			return postData.map(p => p.handle);
		}

		async function loadShowfullnameSettings() {
			if (meta.config.hideFullname) {
				return uids.map(() => ({showfullname: false}));
			}

			const data = await db.getObjectsFields(uids.map(uid => `user:${uid}:settings`), ['showfullname']);
			for (const settings of data) {
				settings.showfullname = Number.parseInt(settings.showfullname, 10) === 1;
			}

			return data;
		}

		const [teasers, users, userSettings, categoriesData, guestHandles, thumbs] = await Promise.all([
			Topics.getTeasers(topics, options),
			user.getUsersFields(uids, ['uid', 'username', 'fullname', 'userslug', 'reputation', 'postcount', 'picture', 'signature', 'banned', 'status']),
			loadShowfullnameSettings(),
			categories.getCategoriesFields(cids, ['cid', 'name', 'slug', 'icon', 'backgroundImage', 'imageClass', 'bgColor', 'color', 'disabled']),
			loadGuestHandles(),
			Topics.thumbs.load(topics),
		]);

		for (const [index, userObject] of users.entries()) {
			// Hide fullname if needed
			if (!userSettings[index].showfullname) {
				userObject.fullname = undefined;
			}
		}

		return {
			topics,
			teasers,
			usersMap: _.zipObject(uids, users),
			categoriesMap: _.zipObject(cids, categoriesData),
			tidToGuestHandle: _.zipObject(guestTopics.map(t => t.tid), guestHandles),
			thumbs,
		};
	}

	const [result, hasRead, isIgnored, bookmarks, callerSettings] = await Promise.all([
		loadTopics(),
		Topics.hasReadTopics(tids, uid),
		Topics.isIgnoring(tids, uid),
		Topics.getUserBookmarks(tids, uid),
		user.getSettings(uid),
	]);

	const sortNewToOld = callerSettings.topicPostSort === 'newest_to_oldest';
	for (const [i, topic] of result.topics.entries()) {
		if (topic) {
			topic.thumbs = result.thumbs[i];
			topic.category = result.categoriesMap[topic.cid];
			topic.user = topic.uid ? result.usersMap[topic.uid] : {...result.usersMap[topic.uid]};
			if (result.tidToGuestHandle[topic.tid]) {
				topic.user.username = validator.escape(result.tidToGuestHandle[topic.tid]);
				topic.user.displayname = topic.user.username;
			}

			topic.teaser = result.teasers[i] || null;
			topic.isOwner = topic.uid === Number.parseInt(uid, 10);
			topic.ignored = isIgnored[i];
			topic.unread = Number.parseInt(uid, 10) <= 0 || (!hasRead[i] && !isIgnored[i]);
			topic.bookmark = sortNewToOld
				? Math.max(1, topic.postcount + 2 - bookmarks[i])
				: Math.min(topic.postcount, bookmarks[i] + 1);
			topic.unreplied = !topic.teaser;

			topic.icons = [];
		}
	}

	const filteredTopics = result.topics.filter(topic => topic && topic.category && !topic.category.disabled);

	const hookResult = await plugins.hooks.fire('filter:topics.get', {topics: filteredTopics, uid});
	return hookResult.topics;
};

Topics.getTopicWithPosts = async function (topicData, set, uid, start, stop, reverse) {
	const [
		posts,
		pinnedPosts,
		category,
		tagInclude,
		threadTools,
		followData,
		bookmark,
		postSharing,
		deleter,
		merger,
		related,
		thumbs,
		events,
	] = await Promise.all([
		Topics.getTopicPosts(topicData, set, start, stop, uid, reverse),
		Topics.getTopicPinnedPosts(topicData, uid),
		categories.getCategoryData(topicData.cid),
		categories.getTagWhitelist([topicData.cid]),
		plugins.hooks.fire('filter:topic.thread_tools', {topic: topicData, uid, tools: []}),
		Topics.getFollowData([topicData.tid], uid),
		Topics.getUserBookmark(topicData.tid, uid),
		social.getActivePostSharing(),
		getDeleter(topicData),
		getMerger(topicData),
		Topics.getRelatedTopics(topicData, uid),
		Topics.thumbs.load([topicData]),
		Topics.events.get(topicData.tid, uid, reverse),
	]);

	topicData.thumbs = thumbs[0];
	topicData.posts = posts;
	topicData.events = events;
	for (const p of topicData.posts) {
		p.events = events.filter(
			event => event.timestamp >= p.eventStart && event.timestamp < p.eventEnd,
		);
	}

	topicData.category = category;
	topicData.tagWhitelist = tagInclude[0];
	topicData.minTags = category.minTags;
	topicData.maxTags = category.maxTags;
	topicData.thread_tools = threadTools.tools;
	topicData.isFollowing = followData[0].following;
	topicData.isNotFollowing = !followData[0].following && !followData[0].ignoring;
	topicData.isIgnoring = followData[0].ignoring;
	topicData.bookmark = bookmark;
	topicData.postSharing = postSharing;
	topicData.deleter = deleter;
	if (deleter) {
		topicData.deletedTimestampISO = utils.toISOString(topicData.deletedTimestamp);
	}

	topicData.merger = merger;
	if (merger) {
		topicData.mergedTimestampISO = utils.toISOString(topicData.mergedTimestamp);
	}

	topicData.related = related || [];
	topicData.unreplied = topicData.postcount === 1;
	topicData.icons = [];

	topicData.pinnedPosts = pinnedPosts;

	const result = await plugins.hooks.fire('filter:topic.get', {topic: topicData, uid});
	return result.topic;
};

async function getDeleter(topicData) {
	if (!Number.parseInt(topicData.deleterUid, 10)) {
		return null;
	}

	return await user.getUserFields(topicData.deleterUid, ['username', 'userslug', 'picture']);
}

async function getMerger(topicData) {
	if (!Number.parseInt(topicData.mergerUid, 10)) {
		return null;
	}

	const [
		merger,
		mergedIntoTitle,
	] = await Promise.all([
		user.getUserFields(topicData.mergerUid, ['username', 'userslug', 'picture']),
		Topics.getTopicField(topicData.mergeIntoTid, 'title'),
	]);
	merger.mergedIntoTitle = mergedIntoTitle;
	return merger;
}

Topics.getMainPost = async function (tid, uid) {
	const mainPosts = await Topics.getMainPosts([tid], uid);
	return Array.isArray(mainPosts) && mainPosts.length > 0 ? mainPosts[0] : null;
};

Topics.getMainPids = async function (tids) {
	if (!Array.isArray(tids) || tids.length === 0) {
		return [];
	}

	const topicData = await Topics.getTopicsFields(tids, ['mainPid']);
	return topicData.map(topic => topic && topic.mainPid);
};

Topics.getMainPosts = async function (tids, uid) {
	const mainPids = await Topics.getMainPids(tids);
	return await getMainPosts(mainPids, uid);
};

async function getMainPosts(mainPids, uid) {
	let postData = await posts.getPostsByPids(mainPids, uid);
	postData = await user.blocks.filter(uid, postData);
	for (const post of postData) {
		if (post) {
			post.index = 0;
		}
	}

	return await Topics.addPostData(postData, uid);
}

Topics.isLocked = async function (tid) {
	const locked = await Topics.getTopicField(tid, 'locked');
	return locked === 1;
};

Topics.search = async function (tid, term) {
	if (!tid || !term) {
		throw new Error('[[error:invalid-data]]');
	}

	const result = await plugins.hooks.fire('filter:topic.search', {
		tid,
		term,
		ids: [],
	});
	return Array.isArray(result) ? result : result.ids;
};

require('../promisify')(Topics);
