'use strict';

const _ = require('lodash');
const winston = require('winston');
const {CronJob} = require('cron');
const db = require('../database');
const posts = require('../posts');
const socketHelpers = require('../socket.io/helpers');
const user = require('../user');
const topics = require('./index');

const Scheduled = module.exports;

Scheduled.startJobs = function () {
	winston.verbose('[scheduled topics] Starting jobs.');
	new CronJob('*/1 * * * *', Scheduled.handleExpired, null, true);
};

Scheduled.handleExpired = async function () {
	const now = Date.now();
	const tids = await db.getSortedSetRangeByScore('topics:scheduled', 0, -1, '-inf', now);

	if (tids.length === 0) {
		return;
	}

	let topicsData = await topics.getTopicsData(tids);
	// Filter deleted
	topicsData = topicsData.filter(Boolean);
	const uids = _.uniq(topicsData.map(topicData => topicData.uid)).filter(Boolean); // Filter guests topics

	// Restore first to be not filtered for being deleted
	// Restoring handles "updateRecentTid"
	await Promise.all([].concat(
		topicsData.map(topicData => topics.restore(topicData.tid)),
		topicsData.map(topicData => topics.updateLastPostTimeFromLastPid(topicData.tid)),
	));

	await Promise.all([].concat(
		sendNotifications(uids, topicsData),
		updateUserLastposttimes(uids, topicsData),
		...topicsData.map(topicData => unpin(topicData.tid, topicData)),
		db.sortedSetsRemoveRangeByScore(['topics:scheduled'], '-inf', now),
	));
};

// Topics/tools.js#pin/unpin would block non-admins/mods, thus the local versions
Scheduled.pin = async function (tid, topicData) {
	return Promise.all([
		topics.setTopicField(tid, 'pinned', 1),
		db.sortedSetAdd(`cid:${topicData.cid}:tids:pinned`, Date.now(), tid),
		db.sortedSetsRemove([
			`cid:${topicData.cid}:tids`,
			`cid:${topicData.cid}:tids:posts`,
			`cid:${topicData.cid}:tids:votes`,
			`cid:${topicData.cid}:tids:views`,
		], tid),
	]);
};

Scheduled.reschedule = async function ({cid, tid, timestamp, uid}) {
	await Promise.all([
		db.sortedSetsAdd([
			'topics:scheduled',
			`uid:${uid}:topics`,
			'topics:tid',
			`cid:${cid}:uid:${uid}:tids`,
		], timestamp, tid),
		shiftPostTimes(tid, timestamp),
	]);
	return topics.updateLastPostTimeFromLastPid(tid);
};

function unpin(tid, topicData) {
	return [
		topics.setTopicField(tid, 'pinned', 0),
		topics.deleteTopicField(tid, 'pinExpiry'),
		db.sortedSetRemove(`cid:${topicData.cid}:tids:pinned`, tid),
		db.sortedSetAddBulk([
			[`cid:${topicData.cid}:tids`, topicData.lastposttime, tid],
			[`cid:${topicData.cid}:tids:posts`, topicData.postcount, tid],
			[`cid:${topicData.cid}:tids:votes`, Number.parseInt(topicData.votes, 10) || 0, tid],
			[`cid:${topicData.cid}:tids:views`, topicData.viewcount, tid],
		]),
	];
}

async function sendNotifications(uids, topicsData) {
	const usernames = await Promise.all(uids.map(uid => user.getUserField(uid, 'username')));
	const uidToUsername = Object.fromEntries(uids.map((uid, index) => [uid, usernames[index]]));

	const postsData = await posts.getPostsData(topicsData.map(({mainPid}) => mainPid));
	for (const [index, postData] of postsData.entries()) {
		postData.user = {};
		postData.user.username = uidToUsername[postData.uid];
		postData.topic = topicsData[index];
	}

	return Promise.all(topicsData.map(
		(t, index) => user.notifications.sendTopicNotificationToFollowers(t.uid, t, postsData[index]),
	).concat(
		topicsData.map(
			(t, index) => socketHelpers.notifyNew(t.uid, 'newTopic', {posts: [postsData[index]], topic: t}),
		),
	));
}

async function updateUserLastposttimes(uids, topicsData) {
	const lastposttimes = (await user.getUsersFields(uids, ['lastposttime'])).map(u => u.lastposttime);

	let tstampByUid = {};
	for (const tD of topicsData) {
		tstampByUid[tD.uid] = tstampByUid[tD.uid] ? tstampByUid[tD.uid].concat(tD.lastposttime) : [tD.lastposttime];
	}

	tstampByUid = Object.fromEntries(
		Object.entries(tstampByUid).map(uidTimestamp => [uidTimestamp[0], Math.max(...uidTimestamp[1])]),
	);

	const uidsToUpdate = uids.filter((uid, index) => tstampByUid[uid] > lastposttimes[index]);
	return Promise.all(uidsToUpdate.map(uid => user.setUserField(uid, 'lastposttime', tstampByUid[uid])));
}

async function shiftPostTimes(tid, timestamp) {
	const pids = (await posts.getPidsFromSet(`tid:${tid}:posts`, 0, -1, false));
	// Leaving other related score values intact, since they reflect post order correctly,
	// and it seems that's good enough
	return db.setObjectBulk(pids.map((pid, index) => [`post:${pid}`, {timestamp: timestamp + index + 1}]));
}
