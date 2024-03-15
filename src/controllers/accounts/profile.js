'use strict';

const nconf = require('nconf');
const _ = require('lodash');
const db = require('../../database');
const user = require('../../user');
const posts = require('../../posts');
const categories = require('../../categories');
const plugins = require('../../plugins');
const meta = require('../../meta');
const privileges = require('../../privileges');
const helpers = require('../helpers');
const utils = require('../../utils');
const accountHelpers = require('./helpers');

const profileController = module.exports;

profileController.get = async function (request, res, next) {
	const lowercaseSlug = request.params.userslug.toLowerCase();

	if (request.params.userslug !== lowercaseSlug) {
		if (res.locals.isAPI) {
			request.params.userslug = lowercaseSlug;
		} else {
			return res.redirect(`${nconf.get('relative_path')}/user/${lowercaseSlug}`);
		}
	}

	const userData = await accountHelpers.getUserDataByUserSlug(request.params.userslug, request.uid, request.query);
	if (!userData) {
		return next();
	}

	await incrementProfileViews(request, userData);

	const [latestPosts, bestPosts] = await Promise.all([
		getLatestPosts(request.uid, userData),
		getBestPosts(request.uid, userData),
		posts.parseSignature(userData, request.uid),
	]);

	if (meta.config['reputation:disabled']) {
		delete userData.reputation;
	}

	userData.posts = latestPosts; // For backwards compat.
	userData.latestPosts = latestPosts;
	userData.bestPosts = bestPosts;
	userData.breadcrumbs = helpers.buildBreadcrumbs([{text: userData.username}]);
	userData.title = userData.username;
	userData.allowCoverPicture = !userData.isSelf || Boolean(meta.config['reputation:disabled']) || userData.reputation >= meta.config['min:rep:cover-picture'];

	// Show email changed modal on first access after said change
	userData.emailChanged = request.session.emailChanged;
	delete request.session.emailChanged;

	userData.profileviews ||= 1;

	addMetaTags(res, userData);

	userData.selectedGroup = userData.groups.filter(group => group && userData.groupTitleArray.includes(group.name))
		.sort((a, b) => userData.groupTitleArray.indexOf(a.name) - userData.groupTitleArray.indexOf(b.name));

	res.render('account/profile', userData);
};

async function incrementProfileViews(request, userData) {
	if (request.uid >= 1) {
		request.session.uids_viewed = request.session.uids_viewed || {};

		if (
			request.uid !== userData.uid
            && (!request.session.uids_viewed[userData.uid] || request.session.uids_viewed[userData.uid] < Date.now() - 3_600_000)
		) {
			await user.incrementUserFieldBy(userData.uid, 'profileviews', 1);
			request.session.uids_viewed[userData.uid] = Date.now();
		}
	}
}

async function getLatestPosts(callerUid, userData) {
	return await getPosts(callerUid, userData, 'pids');
}

async function getBestPosts(callerUid, userData) {
	return await getPosts(callerUid, userData, 'pids:votes');
}

async function getPosts(callerUid, userData, setSuffix) {
	const cids = await categories.getCidsByPrivilege('categories:cid', callerUid, 'topics:read');
	const keys = cids.map(c => `cid:${c}:uid:${userData.uid}:${setSuffix}`);
	let hasMorePosts = true;
	let start = 0;
	const count = 10;
	const postData = [];

	const [isAdmin, isModuleOfCids, canSchedule] = await Promise.all([
		user.isAdministrator(callerUid),
		user.isModerator(callerUid, cids),
		privileges.categories.isUserAllowedTo('topics:schedule', cids, callerUid),
	]);
	const cidToIsModule = _.zipObject(cids, isModuleOfCids);
	const cidToCanSchedule = _.zipObject(cids, canSchedule);

	do {
		/* eslint-disable no-await-in-loop */
		let pids = await db.getSortedSetRevRange(keys, start, start + count - 1);
		if (pids.length === 0 || pids.length < count) {
			hasMorePosts = false;
		}

		if (pids.length > 0) {
			({pids} = await plugins.hooks.fire('filter:account.profile.getPids', {
				uid: callerUid,
				userData,
				setSuffix,
				pids,
			}));
			const p = await posts.getPostSummaryByPids(pids, callerUid, {stripTags: false});
			postData.push(...p.filter(
				p => p && p.topic && (isAdmin || cidToIsModule[p.topic.cid]
                    || (p.topic.scheduled && cidToCanSchedule[p.topic.cid]) || (!p.deleted && !p.topic.deleted)),
			));
		}

		start += count;
	} while (postData.length < count && hasMorePosts);

	return postData.slice(0, count);
}

function addMetaTags(res, userData) {
	const plainAboutMe = userData.aboutme ? utils.stripHTMLTags(utils.decodeHTMLEntities(userData.aboutme)) : '';
	res.locals.metaTags = [
		{
			name: 'title',
			content: userData.fullname || userData.username,
			noEscape: true,
		},
		{
			name: 'description',
			content: plainAboutMe,
		},
		{
			property: 'og:title',
			content: userData.fullname || userData.username,
			noEscape: true,
		},
		{
			property: 'og:description',
			content: plainAboutMe,
		},
	];

	if (userData.picture) {
		res.locals.metaTags.push(
			{
				property: 'og:image',
				content: userData.picture,
				noEscape: true,
			},
			{
				property: 'og:image:url',
				content: userData.picture,
				noEscape: true,
			},
		);
	}
}
