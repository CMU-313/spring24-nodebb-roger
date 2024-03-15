'use strict';

const db = require('../../database');
const user = require('../../user');
const posts = require('../../posts');
const topics = require('../../topics');
const categories = require('../../categories');
const privileges = require('../../privileges');
const pagination = require('../../pagination');
const helpers = require('../helpers');
const plugins = require('../../plugins');
const utils = require('../../utils');
const accountHelpers = require('./helpers');

const postsController = module.exports;

const templateToData = {
	'account/bookmarks': {
		type: 'posts',
		noItemsFoundKey: '[[topic:bookmarks.has_no_bookmarks]]',
		crumb: '[[user:bookmarks]]',
		getSets(callerUid, userData) {
			return `uid:${userData.uid}:bookmarks`;
		},
	},
	'account/posts': {
		type: 'posts',
		noItemsFoundKey: '[[user:has_no_posts]]',
		crumb: '[[global:posts]]',
		async getSets(callerUid, userData) {
			const cids = await categories.getCidsByPrivilege('categories:cid', callerUid, 'topics:read');
			return cids.map(c => `cid:${c}:uid:${userData.uid}:pids`);
		},
	},
	'account/upvoted': {
		type: 'posts',
		noItemsFoundKey: '[[user:has_no_upvoted_posts]]',
		crumb: '[[global:upvoted]]',
		getSets(callerUid, userData) {
			return `uid:${userData.uid}:upvote`;
		},
	},
	'account/downvoted': {
		type: 'posts',
		noItemsFoundKey: '[[user:has_no_downvoted_posts]]',
		crumb: '[[global:downvoted]]',
		getSets(callerUid, userData) {
			return `uid:${userData.uid}:downvote`;
		},
	},
	'account/best': {
		type: 'posts',
		noItemsFoundKey: '[[user:has_no_best_posts]]',
		crumb: '[[global:best]]',
		async getSets(callerUid, userData) {
			const cids = await categories.getCidsByPrivilege('categories:cid', callerUid, 'topics:read');
			return cids.map(c => `cid:${c}:uid:${userData.uid}:pids:votes`);
		},
		async getTopics(sets, request, start, stop) {
			let pids = await db.getSortedSetRevRangeByScore(sets, start, stop - start + 1, '+inf', 1);
			pids = await privileges.posts.filter('topics:read', pids, request.uid);
			const postObjs = await posts.getPostSummaryByPids(pids, request.uid, {stripTags: false});
			return {posts: postObjs, nextStart: stop + 1};
		},
		async getItemCount(sets) {
			const counts = await Promise.all(sets.map(set => db.sortedSetCount(set, 1, '+inf')));
			return counts.reduce((accumulator, value) => accumulator + value, 0);
		},
	},
	'account/controversial': {
		type: 'posts',
		noItemsFoundKey: '[[user:has_no_controversial_posts]]',
		crumb: '[[global:controversial]]',
		async getSets(callerUid, userData) {
			const cids = await categories.getCidsByPrivilege('categories:cid', callerUid, 'topics:read');
			return cids.map(c => `cid:${c}:uid:${userData.uid}:pids:votes`);
		},
		async getTopics(sets, request, start, stop) {
			let pids = await db.getSortedSetRangeByScore(sets, start, stop - start + 1, '-inf', -1);
			pids = await privileges.posts.filter('topics:read', pids, request.uid);
			const postObjs = await posts.getPostSummaryByPids(pids, request.uid, {stripTags: false});
			return {posts: postObjs, nextStart: stop + 1};
		},
		async getItemCount(sets) {
			const counts = await Promise.all(sets.map(set => db.sortedSetCount(set, '-inf', -1)));
			return counts.reduce((accumulator, value) => accumulator + value, 0);
		},
	},
	'account/watched': {
		type: 'topics',
		noItemsFoundKey: '[[user:has_no_watched_topics]]',
		crumb: '[[user:watched]]',
		getSets(callerUid, userData) {
			return `uid:${userData.uid}:followed_tids`;
		},
		async getTopics(set, request, start, stop) {
			const {sort} = request.query;
			const map = {
				votes: 'topics:votes',
				posts: 'topics:posts',
				views: 'topics:views',
				lastpost: 'topics:recent',
				firstpost: 'topics:tid',
			};

			if (!sort || !map[sort]) {
				return await topics.getTopicsFromSet(set, request.uid, start, stop);
			}

			const sortSet = map[sort];
			let tids = await db.getSortedSetRevRange(set, 0, -1);
			const scores = await db.sortedSetScores(sortSet, tids);
			tids = tids.map((tid, i) => ({tid, score: scores[i]}))
				.sort((a, b) => b.score - a.score)
				.slice(start, stop + 1)
				.map(t => t.tid);

			const topicsData = await topics.getTopics(tids, request.uid);
			topics.calculateTopicIndices(topicsData, start);
			return {topics: topicsData, nextStart: stop + 1};
		},
	},
	'account/ignored': {
		type: 'topics',
		noItemsFoundKey: '[[user:has_no_ignored_topics]]',
		crumb: '[[user:ignored]]',
		getSets(callerUid, userData) {
			return `uid:${userData.uid}:ignored_tids`;
		},
	},
	'account/topics': {
		type: 'topics',
		noItemsFoundKey: '[[user:has_no_topics]]',
		crumb: '[[global:topics]]',
		async getSets(callerUid, userData) {
			const cids = await categories.getCidsByPrivilege('categories:cid', callerUid, 'topics:read');
			return cids.map(c => `cid:${c}:uid:${userData.uid}:tids`);
		},
	},
};

postsController.getBookmarks = async function (request, res, next) {
	await getPostsFromUserSet('account/bookmarks', request, res, next);
};

postsController.getPosts = async function (request, res, next) {
	await getPostsFromUserSet('account/posts', request, res, next);
};

postsController.getUpVotedPosts = async function (request, res, next) {
	await getPostsFromUserSet('account/upvoted', request, res, next);
};

postsController.getDownVotedPosts = async function (request, res, next) {
	await getPostsFromUserSet('account/downvoted', request, res, next);
};

postsController.getBestPosts = async function (request, res, next) {
	await getPostsFromUserSet('account/best', request, res, next);
};

postsController.getControversialPosts = async function (request, res, next) {
	await getPostsFromUserSet('account/controversial', request, res, next);
};

postsController.getWatchedTopics = async function (request, res, next) {
	await getPostsFromUserSet('account/watched', request, res, next);
};

postsController.getIgnoredTopics = async function (request, res, next) {
	await getPostsFromUserSet('account/ignored', request, res, next);
};

postsController.getTopics = async function (request, res, next) {
	await getPostsFromUserSet('account/topics', request, res, next);
};

async function getPostsFromUserSet(template, request, res, next) {
	const data = templateToData[template];
	const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1);

	const [userData, settings] = await Promise.all([
		accountHelpers.getUserDataByUserSlug(request.params.userslug, request.uid, request.query),
		user.getSettings(request.uid),
	]);

	if (!userData) {
		return next();
	}

	const itemsPerPage = data.type === 'topics' ? settings.topicsPerPage : settings.postsPerPage;
	const start = (page - 1) * itemsPerPage;
	const stop = start + itemsPerPage - 1;
	const sets = await data.getSets(request.uid, userData);
	let result;
	if (plugins.hooks.hasListeners('filter:account.getPostsFromUserSet')) {
		result = await plugins.hooks.fire('filter:account.getPostsFromUserSet', {
			req: request,
			template,
			userData,
			settings,
			data,
			start,
			stop,
			itemCount: 0,
			itemData: [],
		});
	} else {
		result = await utils.promiseParallel({
			itemCount: getItemCount(sets, data, settings),
			itemData: getItemData(sets, data, request, start, stop),
		});
	}

	const {itemCount, itemData} = result;
	userData[data.type] = itemData[data.type];
	userData.nextStart = itemData.nextStart;

	const pageCount = Math.ceil(itemCount / itemsPerPage);
	userData.pagination = pagination.create(page, pageCount, request.query);

	userData.noItemsFoundKey = data.noItemsFoundKey;
	userData.title = `[[pages:${template}, ${userData.username}]]`;
	userData.breadcrumbs = helpers.buildBreadcrumbs([{text: userData.username, url: `/user/${userData.userslug}`}, {text: data.crumb}]);
	userData.showSort = template === 'account/watched';
	const baseUrl = (request.baseUrl + request.path.replace(/^\/api/, ''));
	userData.sortOptions = [
		{url: `${baseUrl}?sort=votes`, name: '[[global:votes]]'},
		{url: `${baseUrl}?sort=posts`, name: '[[global:posts]]'},
		{url: `${baseUrl}?sort=views`, name: '[[global:views]]'},
		{url: `${baseUrl}?sort=lastpost`, name: '[[global:lastpost]]'},
		{url: `${baseUrl}?sort=firstpost`, name: '[[global:firstpost]]'},
	];
	for (const option of userData.sortOptions) {
		option.selected = option.url.includes(`sort=${request.query.sort}`);
	}

	res.render(template, userData);
}

async function getItemData(sets, data, request, start, stop) {
	if (data.getTopics) {
		return await data.getTopics(sets, request, start, stop);
	}

	const method = data.type === 'topics' ? topics.getTopicsFromSet : posts.getPostSummariesFromSet;
	return await method(sets, request.uid, start, stop);
}

async function getItemCount(sets, data, settings) {
	if (!settings.usePagination) {
		return 0;
	}

	if (data.getItemCount) {
		return await data.getItemCount(sets);
	}

	return await db.sortedSetsCardSum(sets);
}
