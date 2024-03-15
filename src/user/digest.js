'use strict';

const winston = require('winston');
const nconf = require('nconf');
const db = require('../database');
const batch = require('../batch');
const meta = require('../meta');
const topics = require('../topics');
const plugins = require('../plugins');
const emailer = require('../emailer');
const utils = require('../utils');
const user = require('./index');

const Digest = module.exports;

const baseUrl = nconf.get('base_url');

Digest.execute = async function (payload) {
	const digestsDisabled = meta.config.disableEmailSubscriptions === 1;
	if (digestsDisabled) {
		winston.info(`[user/jobs] Did not send digests (${payload.interval}) because subscription system is disabled.`);
		return;
	}

	let {subscribers} = payload;
	subscribers ||= await Digest.getSubscribers(payload.interval);

	if (subscribers.length === 0) {
		return;
	}

	try {
		winston.info(`[user/jobs] Digest (${payload.interval}) scheduling completed (${subscribers.length} subscribers). Sending emails; this may take some time...`);
		await Digest.send({
			interval: payload.interval,
			subscribers,
		});
		winston.info(`[user/jobs] Digest (${payload.interval}) complete.`);
	} catch (error) {
		winston.error(`[user/jobs] Could not send digests (${payload.interval})\n${error.stack}`);
		throw error;
	}
};

Digest.getUsersInterval = async uids => {
	// Checks whether user specifies digest setting, or false for system default setting
	let single = false;
	if (!Array.isArray(uids) && !isNaN(Number.parseInt(uids, 10))) {
		uids = [uids];
		single = true;
	}

	const settings = await db.getObjects(uids.map(uid => `user:${uid}:settings`));
	const interval = uids.map((uid, index) => (settings[index] && settings[index].dailyDigestFreq) || false);
	return single ? interval[0] : interval;
};

Digest.getSubscribers = async function (interval) {
	let subscribers = [];

	await batch.processSortedSet('users:joindate', async uids => {
		const settings = await user.getMultipleUserSettings(uids);
		let subUids = [];
		for (const hash of settings) {
			if (hash.dailyDigestFreq === interval) {
				subUids.push(hash.uid);
			}
		}

		subUids = await user.bans.filterBanned(subUids);
		subscribers = subscribers.concat(subUids);
	}, {
		interval: 1000,
		batch: 500,
	});

	const results = await plugins.hooks.fire('filter:digest.subscribers', {
		interval,
		subscribers,
	});
	return results.subscribers;
};

Digest.send = async function (data) {
	let emailsSent = 0;
	if (!data || !data.subscribers || data.subscribers.length === 0) {
		return emailsSent;
	}

	let errorLogged = false;
	await batch.processArray(data.subscribers, async uids => {
		let userData = await user.getUsersFields(uids, ['uid', 'email', 'email:confirmed', 'username', 'userslug', 'lastonline']);
		userData = userData.filter(u => u && u.email && (meta.config.includeUnverifiedEmails || u['email:confirmed']));
		if (userData.length === 0) {
			return;
		}

		await Promise.all(userData.map(async userObject => {
			const [notifications, topics] = await Promise.all([
				user.notifications.getUnreadInterval(userObject.uid, data.interval),
				getTermTopics(data.interval, userObject.uid),
			]);
			const unreadNotifs = notifications.filter(Boolean);
			// If there are no notifications and no new topics, don't bother sending a digest
			if (unreadNotifs.length === 0 && topics.top.length === 0 && topics.popular.length === 0 && topics.recent.length === 0) {
				return;
			}

			for (const n of unreadNotifs) {
				if (n.image && !n.image.startsWith('http')) {
					n.image = baseUrl + n.image;
				}

				if (n.path) {
					n.notification_url = n.path.startsWith('http') ? n.path : baseUrl + n.path;
				}
			}

			emailsSent += 1;
			const now = new Date();
			await emailer.send('digest', userObject.uid, {
				subject: `[[email:digest.subject, ${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}]]`,
				username: userObject.username,
				userslug: userObject.userslug,
				notifications: unreadNotifs,
				recent: topics.recent,
				topTopics: topics.top,
				popularTopics: topics.popular,
				interval: data.interval,
				showUnsubscribe: true,
			}).catch(error => {
				if (!errorLogged) {
					winston.error(`[user/jobs] Could not send digest email\n[emailer.send] ${error.stack}`);
					errorLogged = true;
				}
			});
		}));
		if (data.interval !== 'alltime') {
			const now = Date.now();
			await db.sortedSetAdd('digest:delivery', userData.map(() => now), userData.map(u => u.uid));
		}
	}, {
		interval: 1000,
		batch: 100,
	});
	winston.info(`[user/jobs] Digest (${data.interval}) sending completed. ${emailsSent} emails sent.`);
};

Digest.getDeliveryTimes = async (start, stop) => {
	const count = await db.sortedSetCard('users:joindate');
	const uids = await user.getUidsFromSet('users:joindate', start, stop);
	if (uids.length === 0) {
		return [];
	}

	const [scores, settings] = await Promise.all([
		// Grab the last time a digest was successfully delivered to these uids
		db.sortedSetScores('digest:delivery', uids),
		// Get users' digest settings
		Digest.getUsersInterval(uids),
	]);

	// Populate user data
	let userData = await user.getUsersFields(uids, ['username', 'picture']);
	userData = userData.map((user, index) => {
		user.lastDelivery = scores[index] ? new Date(scores[index]).toISOString() : '[[admin/manage/digest:null]]';
		user.setting = settings[index];
		return user;
	});

	return {
		users: userData,
		count,
	};
};

async function getTermTopics(term, uid) {
	const data = await topics.getSortedTopics({
		uid,
		start: 0,
		stop: 199,
		term,
		sort: 'votes',
		teaserPost: 'first',
	});
	data.topics = data.topics.filter(topic => topic && !topic.deleted);

	const top = data.topics.filter(t => t.votes > 0).slice(0, 10);
	const topTids = new Set(top.map(t => t.tid));

	const popular = data.topics
		.filter(t => t.postcount > 1 && !topTids.has(t.tid))
		.sort((a, b) => b.postcount - a.postcount)
		.slice(0, 10);
	const popularTids = new Set(popular.map(t => t.tid));

	const recent = data.topics
		.filter(t => !topTids.has(t.tid) && !popularTids.has(t.tid))
		.sort((a, b) => b.lastposttime - a.lastposttime)
		.slice(0, 10);

	for (const topicObject of [...top, ...popular, ...recent]) {
		if (topicObject) {
			if (topicObject.teaser && topicObject.teaser.content && topicObject.teaser.content.length > 255) {
				topicObject.teaser.content = `${topicObject.teaser.content.slice(0, 255)}...`;
			}

			// Fix relative paths in topic data
			const user = topicObject.hasOwnProperty('teaser') && topicObject.teaser && topicObject.teaser.user
				? topicObject.teaser.user : topicObject.user;
			if (user && user.picture && utils.isRelativeUrl(user.picture)) {
				user.picture = baseUrl + user.picture;
			}
		}
	}

	return {top, popular, recent};
}
