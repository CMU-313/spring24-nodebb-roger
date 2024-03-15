'use strict';

const _ = require('lodash');
const db = require('../database');
const meta = require('../meta');
const user = require('../user');
const posts = require('../posts');
const categories = require('../categories');
const plugins = require('../plugins');
const translator = require('../translator');
const privileges = require('../privileges');

const Events = module.exports;

/**
 * Note: Plugins!
 *
 * You are able to define additional topic event types here.
 * Register to hook `filter:topicEvents.init` and append your custom type to the `types` object.
 * You can then log a custom topic event by calling `topics.events.log(tid, { type, uid });`
 * `uid` is optional; if you pass in a valid uid in the payload,
 * the user avatar/username will be rendered as part of the event text
 *
 */
Events._types = {
	pin: {
		icon: 'fa-thumb-tack',
		text: '[[topic:pinned-by]]',
	},
	unpin: {
		icon: 'fa-thumb-tack',
		text: '[[topic:unpinned-by]]',
	},
	lock: {
		icon: 'fa-lock',
		text: '[[topic:locked-by]]',
	},
	unlock: {
		icon: 'fa-unlock',
		text: '[[topic:unlocked-by]]',
	},
	delete: {
		icon: 'fa-trash',
		text: '[[topic:deleted-by]]',
	},
	restore: {
		icon: 'fa-trash-o',
		text: '[[topic:restored-by]]',
	},
	private: {
		icon: 'fa-lock',
		text: '[[topic:private-by]]',
	},
	public: {
		icon: 'fa-unlock',
		text: '[[topic:public-by]]',
	},
	move: {
		icon: 'fa-arrow-circle-right',
		// Text: '[[topic:moved-from-by]]',
	},
	'post-queue': {
		icon: 'fa-history',
		text: '[[topic:queued-by]]',
		href: '/post-queue',
	},
	backlink: {
		icon: 'fa-link',
		text: '[[topic:backlink]]',
	},
	fork: {
		icon: 'fa-code-fork',
		text: '[[topic:forked-by]]',
	},
};

Events.init = async () => {
	// Allow plugins to define additional topic event types
	const {types} = await plugins.hooks.fire('filter:topicEvents.init', {types: Events._types});
	Events._types = types;
};

Events.get = async (tid, uid, reverse = false) => {
	const topics = require('.');

	if (!await topics.exists(tid)) {
		throw new Error('[[error:no-topic]]');
	}

	let eventIds = await db.getSortedSetRangeWithScores(`topic:${tid}:events`, 0, -1);
	const keys = eventIds.map(object => `topicEvent:${object.value}`);
	const timestamps = eventIds.map(object => object.score);
	eventIds = eventIds.map(object => object.value);
	let events = await db.getObjects(keys);
	events = await modifyEvent({
		tid, uid, eventIds, timestamps, events,
	});
	if (reverse) {
		events.reverse();
	}

	return events;
};

async function getUserInfo(uids) {
	uids = uids.filter((uid, index) => !isNaN(Number.parseInt(uid, 10)) && uids.indexOf(uid) === index);
	const userData = await user.getUsersFields(uids, ['picture', 'username', 'userslug']);
	const userMap = userData.reduce((memo, current) => memo.set(current.uid, current), new Map());
	userMap.set('system', {
		system: true,
	});

	return userMap;
}

async function getCategoryInfo(cids) {
	const uniqCids = _.uniq(cids);
	const catData = await categories.getCategoriesFields(uniqCids, ['name', 'slug', 'icon', 'color', 'bgColor']);
	return _.zipObject(uniqCids, catData);
}

async function modifyEvent({tid, uid, eventIds, timestamps, events}) {
	// Add posts from post queue
	const isPrivileged = await user.isPrivileged(uid);
	if (isPrivileged) {
		const queuedPosts = await posts.getQueuedPosts({tid}, {metadata: false});
		events.push(...queuedPosts.map(item => ({
			type: 'post-queue',
			timestamp: item.data.timestamp || Date.now(),
			uid: item.data.uid,
		})));
		for (const item of queuedPosts) {
			timestamps.push(item.data.timestamp || Date.now());
		}
	}

	const [users, fromCategories] = await Promise.all([
		getUserInfo(events.map(event => event.uid).filter(Boolean)),
		getCategoryInfo(events.map(event => event.fromCid).filter(Boolean)),
	]);

	// Remove backlink events if backlinks are disabled
	if (meta.config.topicBacklinks === 1) {
		// Remove backlinks that we dont have read permission
		const backlinkPids = events.filter(e => e.type === 'backlink')
			.map(e => e.href.split('/').pop());
		const pids = await privileges.posts.filter('topics:read', backlinkPids, uid);
		events = events.filter(
			e => e.type !== 'backlink' || pids.includes(e.href.split('/').pop()),
		);
	} else {
		events = events.filter(event => event.type !== 'backlink');
	}

	// Remove events whose types no longer exist (e.g. plugin uninstalled)
	events = events.filter(event => Events._types.hasOwnProperty(event.type));

	// Add user & metadata
	for (const [index, event] of events.entries()) {
		event.id = Number.parseInt(eventIds[index], 10);
		event.timestamp = timestamps[index];
		event.timestampISO = new Date(timestamps[index]).toISOString();
		if (event.hasOwnProperty('uid')) {
			event.user = users.get(event.uid === 'system' ? 'system' : Number.parseInt(event.uid, 10));
		}

		if (event.hasOwnProperty('fromCid')) {
			event.fromCategory = fromCategories[event.fromCid];
			event.text = translator.compile('topic:moved-from-by', event.fromCategory.name);
		}

		Object.assign(event, Events._types[event.type]);
	}

	// Sort events
	events.sort((a, b) => a.timestamp - b.timestamp);

	return events;
}

Events.log = async (tid, payload) => {
	const topics = require('.');
	const {type} = payload;
	const timestamp = payload.timestamp || Date.now();

	if (!Events._types.hasOwnProperty(type)) {
		throw new Error(`[[error:topic-event-unrecognized, ${type}]]`);
	} else if (!await topics.exists(tid)) {
		throw new Error('[[error:no-topic]]');
	}

	const eventId = await db.incrObjectField('global', 'nextTopicEventId');

	await Promise.all([
		db.setObject(`topicEvent:${eventId}`, payload),
		db.sortedSetAdd(`topic:${tid}:events`, timestamp, eventId),
	]);

	let events = await modifyEvent({
		eventIds: [eventId],
		timestamps: [timestamp],
		events: [payload],
	});

	({events} = await plugins.hooks.fire('filter:topic.events.log', {events}));
	return events;
};

Events.purge = async (tid, eventIds = []) => {
	if (eventIds.length > 0) {
		const isTopicEvent = await db.isSortedSetMembers(`topic:${tid}:events`, eventIds);
		eventIds = eventIds.filter((id, index) => isTopicEvent[index]);
		await Promise.all([
			db.sortedSetRemove(`topic:${tid}:events`, eventIds),
			db.deleteAll(eventIds.map(id => `topicEvent:${id}`)),
		]);
	} else {
		const keys = [`topic:${tid}:events`];
		const eventIds = await db.getSortedSetRange(keys[0], 0, -1);
		keys.push(...eventIds.map(id => `topicEvent:${id}`));

		await db.deleteAll(keys);
	}
};
