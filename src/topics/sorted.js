
'use strict';

const _ = require('lodash');
const db = require('../database');
const privileges = require('../privileges');
const user = require('../user');
const categories = require('../categories');
const meta = require('../meta');
const plugins = require('../plugins');

module.exports = function (Topics) {
	Topics.getSortedTopics = async function (parameters) {
		const data = {
			nextStart: 0,
			topicCount: 0,
			topics: [],
		};

		parameters.term = parameters.term || 'alltime';
		parameters.sort = parameters.sort || 'recent';
		parameters.query = parameters.query || {};
		if (parameters.hasOwnProperty('cids') && parameters.cids && !Array.isArray(parameters.cids)) {
			parameters.cids = [parameters.cids];
		}

		parameters.tags = parameters.tags || [];
		if (parameters.tags && !Array.isArray(parameters.tags)) {
			parameters.tags = [parameters.tags];
		}

		data.tids = await getTids(parameters);
		data.tids = await sortTids(data.tids, parameters);
		data.tids = await filterTids(data.tids.slice(0, meta.config.recentMaxTopics), parameters);
		data.topicCount = data.tids.length;
		data.topics = await getTopics(data.tids, parameters);
		data.nextStart = parameters.stop + 1;
		return data;
	};

	async function getTids(parameters) {
		if (plugins.hooks.hasListeners('filter:topics.getSortedTids')) {
			const result = await plugins.hooks.fire('filter:topics.getSortedTids', {params: parameters, tids: []});
			return result.tids;
		}

		let tids = [];
		if (parameters.term !== 'alltime') {
			tids = await Topics.getLatestTidsFromSet('topics:tid', 0, -1, parameters.term);
			if (parameters.filter === 'watched') {
				tids = await Topics.filterWatchedTids(tids, parameters.uid);
			}
		} else if (parameters.filter === 'watched') {
			tids = await db.getSortedSetRevRange(`uid:${parameters.uid}:followed_tids`, 0, -1);
		} else if (parameters.cids) {
			tids = await getCidTids(parameters);
		} else if (parameters.tags.length > 0) {
			tids = await getTagTids(parameters);
		} else if (parameters.sort === 'old') {
			tids = await db.getSortedSetRange('topics:recent', 0, meta.config.recentMaxTopics - 1);
		} else {
			tids = await db.getSortedSetRevRange(`topics:${parameters.sort}`, 0, meta.config.recentMaxTopics - 1);
		}

		return tids;
	}

	async function getTagTids(parameters) {
		const sets = [
			parameters.sort === 'old'
				? 'topics:recent'
				: `topics:${parameters.sort}`,
			...parameters.tags.map(tag => `tag:${tag}:topics`),
		];
		const method = parameters.sort === 'old'
			? 'getSortedSetIntersect'
			: 'getSortedSetRevIntersect';
		return await db[method]({
			sets,
			start: 0,
			stop: meta.config.recentMaxTopics - 1,
			weights: sets.map((s, index) => (index ? 0 : 1)),
		});
	}

	async function getCidTids(parameters) {
		if (parameters.tags.length > 0) {
			return _.intersection(...await Promise.all(parameters.tags.map(async tag => {
				const sets = parameters.cids.map(cid => `cid:${cid}:tag:${tag}:topics`);
				return await db.getSortedSetRevRange(sets, 0, -1);
			})));
		}

		const sets = [];
		const pinnedSets = [];
		for (const cid of parameters.cids) {
			if (parameters.sort === 'recent' || parameters.sort === 'old') {
				sets.push(`cid:${cid}:tids`);
			} else {
				sets.push(`cid:${cid}:tids${parameters.sort ? `:${parameters.sort}` : ''}`);
			}

			pinnedSets.push(`cid:${cid}:tids:pinned`);
		}

		let pinnedTids = await db.getSortedSetRevRange(pinnedSets, 0, -1);
		pinnedTids = await Topics.tools.checkPinExpiry(pinnedTids);
		const method = parameters.sort === 'old'
			? 'getSortedSetRange'
			: 'getSortedSetRevRange';
		const tids = await db[method](sets, 0, meta.config.recentMaxTopics - 1);
		return pinnedTids.concat(tids);
	}

	async function sortTids(tids, parameters) {
		if (parameters.term === 'alltime' && !parameters.cids && parameters.tags.length === 0 && parameters.filter !== 'watched' && !parameters.floatPinned) {
			return tids;
		}

		const topicData = await Topics.getTopicsFields(tids, ['tid', 'lastposttime', 'upvotes', 'downvotes', 'postcount', 'pinned']);
		const sortMap = {
			recent: sortRecent,
			old: sortOld,
			posts: sortPopular,
			votes: sortVotes,
			views: sortViews,
		};
		const sortFunction = sortMap[parameters.sort] || sortRecent;

		if (parameters.floatPinned) {
			floatPinned(topicData, sortFunction);
		} else {
			topicData.sort(sortFunction);
		}

		return topicData.map(topic => topic && topic.tid);
	}

	function floatPinned(topicData, sortFunction) {
		topicData.sort((a, b) => (a.pinned === b.pinned ? sortFunction(a, b) : b.pinned - a.pinned));
	}

	function sortRecent(a, b) {
		return b.lastposttime - a.lastposttime;
	}

	function sortOld(a, b) {
		return a.lastposttime - b.lastposttime;
	}

	function sortVotes(a, b) {
		if (a.votes !== b.votes) {
			return b.votes - a.votes;
		}

		return b.postcount - a.postcount;
	}

	function sortPopular(a, b) {
		if (a.postcount !== b.postcount) {
			return b.postcount - a.postcount;
		}

		return b.viewcount - a.viewcount;
	}

	function sortViews(a, b) {
		return b.viewcount - a.viewcount;
	}

	async function filterTids(tids, parameters) {
		const {filter} = parameters;
		const {uid} = parameters;

		if (filter === 'new') {
			tids = await Topics.filterNewTids(tids, uid);
		} else if (filter === 'unreplied') {
			tids = await Topics.filterUnrepliedTids(tids);
		} else {
			tids = await Topics.filterNotIgnoredTids(tids, uid);
		}

		tids = await privileges.topics.filterTids('topics:read', tids, uid);
		let topicData = await Topics.getTopicsFields(tids, ['uid', 'tid', 'cid']);
		const topicCids = _.uniq(topicData.map(topic => topic.cid)).filter(Boolean);

		async function getIgnoredCids() {
			if (parameters.cids || filter === 'watched' || meta.config.disableRecentCategoryFilter) {
				return [];
			}

			return await categories.isIgnored(topicCids, uid);
		}

		const [ignoredCids, filtered] = await Promise.all([
			getIgnoredCids(),
			user.blocks.filter(uid, topicData),
		]);

		const isCidIgnored = _.zipObject(topicCids, ignoredCids);
		topicData = filtered;

		const cids = parameters.cids && parameters.cids.map(String);
		tids = topicData.filter(t => (
			t
            && t.cid
            && !isCidIgnored[t.cid]
            && (!cids || cids.includes(String(t.cid)))
		)).map(t => t.tid);

		const result = await plugins.hooks.fire('filter:topics.filterSortedTids', {tids, params: parameters});
		return result.tids;
	}

	async function getTopics(tids, parameters) {
		tids = tids.slice(parameters.start, parameters.stop === -1 ? undefined : parameters.stop + 1);
		const topicData = await Topics.getTopicsByTids(tids, parameters);
		Topics.calculateTopicIndices(topicData, parameters.start);
		return topicData;
	}

	Topics.calculateTopicIndices = function (topicData, start) {
		for (const [index, topic] of topicData.entries()) {
			if (topic) {
				topic.index = start + index;
			}
		}
	};
};
