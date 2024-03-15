
'use strict';

const async = require('async');
const _ = require('lodash');
const db = require('../database');
const user = require('../user');
const posts = require('../posts');
const notifications = require('../notifications');
const categories = require('../categories');
const privileges = require('../privileges');
const meta = require('../meta');
const utils = require('../utils');
const plugins = require('../plugins');

module.exports = function (Topics) {
	Topics.getTotalUnread = async function (uid, filter) {
		filter ||= '';
		const counts = await Topics.getUnreadTids({cid: 0, uid, count: true});
		return counts && counts[filter];
	};

	Topics.getUnreadTopics = async function (parameters) {
		const unreadTopics = {
			showSelect: true,
			nextStart: 0,
			topics: [],
		};
		let tids = await Topics.getUnreadTids(parameters);
		unreadTopics.topicCount = tids.length;

		if (tids.length === 0) {
			return unreadTopics;
		}

		tids = tids.slice(parameters.start, parameters.stop === -1 ? undefined : parameters.stop + 1);

		const topicData = await Topics.getTopicsByTids(tids, parameters.uid);
		if (topicData.length === 0) {
			return unreadTopics;
		}

		Topics.calculateTopicIndices(topicData, parameters.start);
		unreadTopics.topics = topicData;
		unreadTopics.nextStart = parameters.stop + 1;
		return unreadTopics;
	};

	Topics.unreadCutoff = async function (uid) {
		const cutoff = Date.now() - (meta.config.unreadCutoff * 86_400_000);
		const data = await plugins.hooks.fire('filter:topics.unreadCutoff', {uid, cutoff});
		return Number.parseInt(data.cutoff, 10);
	};

	Topics.getUnreadTids = async function (parameters) {
		const results = await Topics.getUnreadData(parameters);
		return parameters.count ? results.counts : results.tids;
	};

	Topics.getUnreadData = async function (parameters) {
		const uid = Number.parseInt(parameters.uid, 10);

		parameters.filter = parameters.filter || '';

		if (parameters.cid && !Array.isArray(parameters.cid)) {
			parameters.cid = [parameters.cid];
		}

		const data = await getTids(parameters);
		if (uid <= 0 || !data.tids || data.tids.length === 0) {
			return data;
		}

		const result = await plugins.hooks.fire('filter:topics.getUnreadTids', {
			uid,
			tids: data.tids,
			counts: data.counts,
			tidsByFilter: data.tidsByFilter,
			cid: parameters.cid,
			filter: parameters.filter,
			query: parameters.query || {},
		});
		return result;
	};

	async function getTids(parameters) {
		const counts = {
			'': 0, new: 0, watched: 0, unreplied: 0,
		};
		const tidsByFilter = {
			'': [], new: [], watched: [], unreplied: [],
		};

		if (parameters.uid <= 0) {
			return {counts, tids: [], tidsByFilter};
		}

		parameters.cutoff = await Topics.unreadCutoff(parameters.uid);

		const [followedTids, ignoredTids, categoryTids, userScores, tids_unread] = await Promise.all([
			getFollowedTids(parameters),
			user.getIgnoredTids(parameters.uid, 0, -1),
			getCategoryTids(parameters),
			db.getSortedSetRevRangeByScoreWithScores(`uid:${parameters.uid}:tids_read`, 0, -1, '+inf', parameters.cutoff),
			db.getSortedSetRevRangeWithScores(`uid:${parameters.uid}:tids_unread`, 0, -1),
		]);

		const userReadTimes = _.mapValues(_.keyBy(userScores, 'value'), 'score');
		const isTopicsFollowed = {};
		for (const t of followedTids) {
			isTopicsFollowed[t.value] = true;
		}

		const unreadFollowed = await db.isSortedSetMembers(
			`uid:${parameters.uid}:followed_tids`, tids_unread.map(t => t.value),
		);

		for (const [i, t] of tids_unread.entries()) {
			isTopicsFollowed[t.value] = unreadFollowed[i];
		}

		const unreadTopics = _.unionWith(categoryTids, followedTids, (a, b) => a.value === b.value)
			.filter(t => !ignoredTids.includes(t.value)
                    && (!userReadTimes[t.value] || t.score > userReadTimes[t.value]))
			.concat(tids_unread.filter(t => !ignoredTids.includes(t.value)))
			.sort((a, b) => b.score - a.score);

		let tids = _.uniq(unreadTopics.map(topic => topic.value)).slice(0, 200);

		if (tids.length === 0) {
			return {counts, tids, tidsByFilter};
		}

		const blockedUids = await user.blocks.list(parameters.uid);

		tids = await filterTidsThatHaveBlockedPosts({
			uid: parameters.uid,
			tids,
			blockedUids,
			recentTids: categoryTids,
		});

		tids = await privileges.topics.filterTids('topics:read', tids, parameters.uid);
		const topicData = (await Topics.getTopicsFields(tids, ['tid', 'cid', 'uid', 'postcount', 'deleted', 'scheduled']))
			.filter(t => t.scheduled || !t.deleted);
		const topicCids = _.uniq(topicData.map(topic => topic.cid)).filter(Boolean);

		const categoryWatchState = await categories.getWatchState(topicCids, parameters.uid);
		const userCidState = _.zipObject(topicCids, categoryWatchState);

		const filterCids = parameters.cid && parameters.cid.map(cid => Number.parseInt(cid, 10));

		for (const topic of topicData) {
			if (topic && topic.cid && (!filterCids || filterCids.includes(topic.cid))
                && !blockedUids.includes(topic.uid)) {
				if (isTopicsFollowed[topic.tid] || userCidState[topic.cid] === categories.watchStates.watching) {
					tidsByFilter[''].push(topic.tid);
				}

				if (isTopicsFollowed[topic.tid]) {
					tidsByFilter.watched.push(topic.tid);
				}

				if (topic.postcount <= 1) {
					tidsByFilter.unreplied.push(topic.tid);
				}

				if (!userReadTimes[topic.tid]) {
					tidsByFilter.new.push(topic.tid);
				}
			}
		}

		counts[''] = tidsByFilter[''].length;
		counts.watched = tidsByFilter.watched.length;
		counts.unreplied = tidsByFilter.unreplied.length;
		counts.new = tidsByFilter.new.length;

		return {
			counts,
			tids: tidsByFilter[parameters.filter],
			tidsByFilter,
		};
	}

	async function getCategoryTids(parameters) {
		if (plugins.hooks.hasListeners('filter:topics.unread.getCategoryTids')) {
			const result = await plugins.hooks.fire('filter:topics.unread.getCategoryTids', {params: parameters, tids: []});
			return result.tids;
		}

		if (parameters.filter === 'watched') {
			return [];
		}

		const cids = parameters.cid || await user.getWatchedCategories(parameters.uid);
		const keys = cids.map(cid => `cid:${cid}:tids:lastposttime`);
		return await db.getSortedSetRevRangeByScoreWithScores(keys, 0, -1, '+inf', parameters.cutoff);
	}

	async function getFollowedTids(parameters) {
		let tids = await db.getSortedSetMembers(`uid:${parameters.uid}:followed_tids`);
		const filterCids = parameters.cid && parameters.cid.map(cid => Number.parseInt(cid, 10));
		if (filterCids) {
			const topicData = await Topics.getTopicsFields(tids, ['tid', 'cid']);
			tids = topicData.filter(t => filterCids.includes(t.cid)).map(t => t.tid);
		}

		const scores = await db.sortedSetScores('topics:recent', tids);
		const data = tids.map((tid, index) => ({value: String(tid), score: scores[index]}));
		return data.filter(item => item.score > parameters.cutoff);
	}

	async function filterTidsThatHaveBlockedPosts(parameters) {
		if (parameters.blockedUids.length === 0) {
			return parameters.tids;
		}

		const topicScores = _.mapValues(_.keyBy(parameters.recentTids, 'value'), 'score');

		const results = await db.sortedSetScores(`uid:${parameters.uid}:tids_read`, parameters.tids);

		const userScores = _.zipObject(parameters.tids, results);

		return await async.filter(parameters.tids, async tid => await doesTidHaveUnblockedUnreadPosts(tid, {
			blockedUids: parameters.blockedUids,
			topicTimestamp: topicScores[tid],
			userLastReadTimestamp: userScores[tid],
		}));
	}

	async function doesTidHaveUnblockedUnreadPosts(tid, parameters) {
		const {userLastReadTimestamp} = parameters;
		if (!userLastReadTimestamp) {
			return true;
		}

		let start = 0;
		const count = 3;
		let done = false;
		let hasUnblockedUnread = parameters.topicTimestamp > userLastReadTimestamp;
		if (parameters.blockedUids.length === 0) {
			return hasUnblockedUnread;
		}

		while (!done) {
			/* eslint-disable no-await-in-loop */
			const pidsSinceLastVisit = await db.getSortedSetRangeByScore(`tid:${tid}:posts`, start, count, userLastReadTimestamp, '+inf');
			if (pidsSinceLastVisit.length === 0) {
				return hasUnblockedUnread;
			}

			let postData = await posts.getPostsFields(pidsSinceLastVisit, ['pid', 'uid']);
			postData = postData.filter(post => !parameters.blockedUids.includes(Number.parseInt(post.uid, 10)));

			done = postData.length > 0;
			hasUnblockedUnread = postData.length > 0;
			start += count;
		}

		return hasUnblockedUnread;
	}

	Topics.pushUnreadCount = async function (uid) {
		if (!uid || Number.parseInt(uid, 10) <= 0) {
			return;
		}

		const results = await Topics.getUnreadTids({uid, count: true});
		require('../socket.io').in(`uid_${uid}`).emit('event:unread.updateCount', {
			unreadTopicCount: results[''],
			unreadNewTopicCount: results.new,
			unreadWatchedTopicCount: results.watched,
			unreadUnrepliedTopicCount: results.unreplied,
		});
	};

	Topics.markAsUnreadForAll = async function (tid) {
		await Topics.markCategoryUnreadForAll(tid);
	};

	Topics.markAsRead = async function (tids, uid) {
		if (!Array.isArray(tids) || tids.length === 0) {
			return false;
		}

		tids = _.uniq(tids).filter(tid => tid && utils.isNumber(tid));

		if (tids.length === 0) {
			return false;
		}

		const [topicScores, userScores] = await Promise.all([
			Topics.getTopicsFields(tids, ['tid', 'lastposttime', 'scheduled']),
			db.sortedSetScores(`uid:${uid}:tids_read`, tids),
		]);

		const topics = topicScores.filter((t, i) => t.lastposttime
            && (!userScores[i] || userScores[i] < t.lastposttime));
		tids = topics.map(t => t.tid);

		if (tids.length === 0) {
			return false;
		}

		const now = Date.now();
		const scores = topics.map(topic => (topic.scheduled ? topic.lastposttime : now));
		const [topicData] = await Promise.all([
			Topics.getTopicsFields(tids, ['cid']),
			db.sortedSetAdd(`uid:${uid}:tids_read`, scores, tids),
			db.sortedSetRemove(`uid:${uid}:tids_unread`, tids),
		]);

		const cids = _.uniq(topicData.map(t => t && t.cid).filter(Boolean));
		await categories.markAsRead(cids, uid);

		plugins.hooks.fire('action:topics.markAsRead', {uid, tids});
		return true;
	};

	Topics.markAllRead = async function (uid) {
		const cutoff = await Topics.unreadCutoff(uid);
		const tids = await db.getSortedSetRevRangeByScore('topics:recent', 0, -1, '+inf', cutoff);
		Topics.markTopicNotificationsRead(tids, uid);
		await Topics.markAsRead(tids, uid);
		await db.delete(`uid:${uid}:tids_unread`);
	};

	Topics.markTopicNotificationsRead = async function (tids, uid) {
		if (!Array.isArray(tids) || tids.length === 0) {
			return;
		}

		const nids = await user.notifications.getUnreadByField(uid, 'tid', tids);
		await notifications.markReadMultiple(nids, uid);
		user.notifications.pushCount(uid);
	};

	Topics.markCategoryUnreadForAll = async function (tid) {
		const cid = await Topics.getTopicField(tid, 'cid');
		await categories.markAsUnreadForAll(cid);
	};

	Topics.hasReadTopics = async function (tids, uid) {
		if (!(Number.parseInt(uid, 10) > 0)) {
			return tids.map(() => false);
		}

		const [topicScores, userScores, tids_unread, blockedUids] = await Promise.all([
			db.sortedSetScores('topics:recent', tids),
			db.sortedSetScores(`uid:${uid}:tids_read`, tids),
			db.sortedSetScores(`uid:${uid}:tids_unread`, tids),
			user.blocks.list(uid),
		]);

		const cutoff = await Topics.unreadCutoff(uid);
		const result = tids.map((tid, index) => {
			const read = !tids_unread[index]
                && (topicScores[index] < cutoff
                || Boolean(userScores[index] && userScores[index] >= topicScores[index]));
			return {tid, read, index};
		});

		return await async.map(result, async data => {
			if (data.read) {
				return true;
			}

			const hasUnblockedUnread = await doesTidHaveUnblockedUnreadPosts(data.tid, {
				topicTimestamp: topicScores[data.index],
				userLastReadTimestamp: userScores[data.index],
				blockedUids,
			});
			if (!hasUnblockedUnread) {
				data.read = true;
			}

			return data.read;
		});
	};

	Topics.hasReadTopic = async function (tid, uid) {
		const hasRead = await Topics.hasReadTopics([tid], uid);
		return Array.isArray(hasRead) && hasRead.length > 0 ? hasRead[0] : false;
	};

	Topics.markUnread = async function (tid, uid) {
		const exists = await Topics.exists(tid);
		if (!exists) {
			throw new Error('[[error:no-topic]]');
		}

		await db.sortedSetRemove(`uid:${uid}:tids_read`, tid);
		await db.sortedSetAdd(`uid:${uid}:tids_unread`, Date.now(), tid);
	};

	Topics.filterNewTids = async function (tids, uid) {
		if (Number.parseInt(uid, 10) <= 0) {
			return [];
		}

		const scores = await db.sortedSetScores(`uid:${uid}:tids_read`, tids);
		return tids.filter((tid, index) => tid && !scores[index]);
	};

	Topics.filterUnrepliedTids = async function (tids) {
		const scores = await db.sortedSetScores('topics:posts', tids);
		return tids.filter((tid, index) => tid && scores[index] !== null && scores[index] <= 1);
	};
};
