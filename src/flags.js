'use strict';

const _ = require('lodash');
const winston = require('winston');
const validator = require('validator');
const db = require('./database');
const user = require('./user');
const groups = require('./groups');
const meta = require('./meta');
const notifications = require('./notifications');
const analytics = require('./analytics');
const categories = require('./categories');
const topics = require('./topics');
const posts = require('./posts');
const privileges = require('./privileges');
const plugins = require('./plugins');
const utils = require('./utils');
const batch = require('./batch');

const Flags = module.exports;

Flags._states = new Map([
	['open', {
		label: '[[flags:state-open]]',
		class: 'danger',
	}],
	['wip', {
		label: '[[flags:state-wip]]',
		class: 'warning',
	}],
	['resolved', {
		label: '[[flags:state-resolved]]',
		class: 'success',
	}],
	['rejected', {
		label: '[[flags:state-rejected]]',
		class: 'secondary',
	}],
]);

Flags.init = async function () {
	// Query plugins for custom filter strategies and merge into core filter strategies
	function prepareSets(sets, orSets, prefix, value) {
		if (!Array.isArray(value)) {
			sets.push(prefix + value);
		} else if (value.length > 0) {
			if (value.length === 1) {
				sets.push(prefix + value[0]);
			} else {
				orSets.push(value.map(x => prefix + x));
			}
		}
	}

	const hookData = {
		filters: {
			type(sets, orSets, key) {
				prepareSets(sets, orSets, 'flags:byType:', key);
			},
			state(sets, orSets, key) {
				prepareSets(sets, orSets, 'flags:byState:', key);
			},
			reporterId(sets, orSets, key) {
				prepareSets(sets, orSets, 'flags:byReporter:', key);
			},
			assignee(sets, orSets, key) {
				prepareSets(sets, orSets, 'flags:byAssignee:', key);
			},
			targetUid(sets, orSets, key) {
				prepareSets(sets, orSets, 'flags:byTargetUid:', key);
			},
			cid(sets, orSets, key) {
				prepareSets(sets, orSets, 'flags:byCid:', key);
			},
			page() { /* noop */ },
			perPage() { /* noop */ },
			quick(sets, orSets, key, uid) {
				switch (key) {
					case 'mine': {
						sets.push(`flags:byAssignee:${uid}`);
						break;
					}

					case 'unresolved': {
						prepareSets(sets, orSets, 'flags:byState:', ['open', 'wip']);
						break;
					}
				}
			},
		},
		states: Flags._states,
		helpers: {
			prepareSets,
		},
	};

	try {
		({filters: Flags._filters} = await plugins.hooks.fire('filter:flags.getFilters', hookData));
		({filters: Flags._filters, states: Flags._states} = await plugins.hooks.fire('filter:flags.init', hookData));
	} catch (error) {
		winston.error(`[flags/init] Could not retrieve filters\n${error.stack}`);
		Flags._filters = {};
	}
};

Flags.get = async function (flagId) {
	const [base, notes, reports] = await Promise.all([
		db.getObject(`flag:${flagId}`),
		Flags.getNotes(flagId),
		Flags.getReports(flagId),
	]);
	if (!base) {
		return;
	}

	const flagObject = {
		state: 'open',
		assignee: null,
		...base,
		datetimeISO: utils.toISOString(base.datetime),
		target_readable: `${base.type.charAt(0).toUpperCase() + base.type.slice(1)} ${base.targetId}`,
		target: await Flags.getTarget(base.type, base.targetId, 0),
		notes,
		reports,
	};

	const data = await plugins.hooks.fire('filter:flags.get', {
		flag: flagObject,
	});
	return data.flag;
};

Flags.getCount = async function ({uid, filters, query}) {
	filters ||= {};
	const flagIds = await Flags.getFlagIdsWithFilters({filters, uid, query});
	return flagIds.length;
};

Flags.getFlagIdsWithFilters = async function ({filters, uid, query}) {
	let sets = [];
	const orSets = [];

	// Default filter
	filters.page = filters.hasOwnProperty('page') ? Math.abs(Number.parseInt(filters.page, 10) || 1) : 1;
	filters.perPage = filters.hasOwnProperty('perPage') ? Math.abs(Number.parseInt(filters.perPage, 10) || 20) : 20;

	for (const type of Object.keys(filters)) {
		if (Flags._filters.hasOwnProperty(type)) {
			Flags._filters[type](sets, orSets, filters[type], uid);
		} else {
			winston.warn(`[flags/list] No flag filter type found: ${type}`);
		}
	}

	sets = (sets.length > 0 || orSets.length > 0) ? sets : ['flags:datetime']; // No filter default

	let flagIds = [];
	if (sets.length === 1) {
		flagIds = await db.getSortedSetRevRange(sets[0], 0, -1);
	} else if (sets.length > 1) {
		flagIds = await db.getSortedSetRevIntersect({
			sets, start: 0, stop: -1, aggregate: 'MAX',
		});
	}

	if (orSets.length > 0) {
		let _flagIds = await Promise.all(orSets.map(async orSet => await db.getSortedSetRevUnion({
			sets: orSet, start: 0, stop: -1, aggregate: 'MAX',
		})));

		// Each individual orSet is ANDed together to construct the final list of flagIds
		_flagIds = _.intersection(..._flagIds);

		// Merge with flagIds returned by sets
		if (sets.length > 0) {
			// If flag ids are already present, return a subset of flags that are in both sets
			flagIds = _.intersection(flagIds, _flagIds);
		} else {
			// Otherwise, return all flags returned via orSets
			flagIds = _.union(flagIds, _flagIds);
		}
	}

	const result = await plugins.hooks.fire('filter:flags.getFlagIdsWithFilters', {
		filters,
		uid,
		query,
		flagIds,
	});
	return result.flagIds;
};

Flags.list = async function (data) {
	const filters = data.filters || {};
	let flagIds = await Flags.getFlagIdsWithFilters({
		filters,
		uid: data.uid,
		query: data.query,
	});
	flagIds = await Flags.sort(flagIds, data.sort);

	// Create subset for parsing based on page number (n=20)
	const flagsPerPage = Math.abs(Number.parseInt(filters.perPage, 10) || 1);
	const pageCount = Math.ceil(flagIds.length / flagsPerPage);
	flagIds = flagIds.slice((filters.page - 1) * flagsPerPage, filters.page * flagsPerPage);

	const reportCounts = await db.sortedSetsCard(flagIds.map(flagId => `flag:${flagId}:reports`));

	const flags = await Promise.all(flagIds.map(async (flagId, index) => {
		let flagObject = await db.getObject(`flag:${flagId}`);
		flagObject = {
			state: 'open',
			assignee: null,
			heat: reportCounts[index],
			...flagObject,
		};
		flagObject.labelClass = Flags._states.get(flagObject.state).class;

		return Object.assign(flagObject, {
			target_readable: `${flagObject.type.charAt(0).toUpperCase() + flagObject.type.slice(1)} ${flagObject.targetId}`,
			datetimeISO: utils.toISOString(flagObject.datetime),
		});
	}));

	const payload = await plugins.hooks.fire('filter:flags.list', {
		flags,
		page: filters.page,
		uid: data.uid,
	});

	return {
		flags: payload.flags,
		page: payload.page,
		pageCount,
	};
};

Flags.sort = async function (flagIds, sort) {
	const filterPosts = async flagIds => {
		const keys = flagIds.map(id => `flag:${id}`);
		const types = await db.getObjectsFields(keys, ['type']);
		return flagIds.filter((id, index) => types[index].type === 'post');
	};

	switch (sort) {
		// 'newest' is not handled because that is default
		case 'oldest': {
			flagIds = flagIds.reverse();
			break;
		}

		case 'reports': {
			const keys = flagIds.map(id => `flag:${id}:reports`);
			const heat = await db.sortedSetsCard(keys);
			const mapped = heat.map((element, i) => ({
				index: i, heat: element,
			}));
			mapped.sort((a, b) => b.heat - a.heat);
			flagIds = mapped.map(object => flagIds[object.index]);
			break;
		}

		case 'upvotes': // Fall-through
		case 'downvotes':
		case 'replies': {
			flagIds = await filterPosts(flagIds);
			const keys = flagIds.map(id => `flag:${id}`);
			const pids = (await db.getObjectsFields(keys, ['targetId'])).map(object => object.targetId);
			const votes = (await posts.getPostsFields(pids, [sort])).map(object => Number.parseInt(object[sort], 10) || 0);
			const sortReference = flagIds.reduce((memo, current, index) => {
				memo[current] = votes[index];
				return memo;
			}, {});

			flagIds = flagIds.sort((a, b) => sortReference[b] - sortReference[a]);
		}
	}

	return flagIds;
};

Flags.validate = async function (payload) {
	const [target, reporter] = await Promise.all([
		Flags.getTarget(payload.type, payload.id, payload.uid),
		user.getUserData(payload.uid),
	]);

	if (!target) {
		throw new Error('[[error:invalid-data]]');
	} else if (target.deleted) {
		throw new Error('[[error:post-deleted]]');
	} else if (!reporter || !reporter.userslug) {
		throw new Error('[[error:no-user]]');
	} else if (reporter.banned) {
		throw new Error('[[error:user-banned]]');
	}

	// Disallow flagging of profiles/content of privileged users
	const [targetPrivileged, reporterPrivileged] = await Promise.all([
		user.isPrivileged(target.uid),
		user.isPrivileged(reporter.uid),
	]);
	if (targetPrivileged && !reporterPrivileged) {
		throw new Error('[[error:cant-flag-privileged]]');
	}

	if (payload.type === 'post') {
		const editable = await privileges.posts.canEdit(payload.id, payload.uid);
		if (!editable.flag && !meta.config['reputation:disabled'] && reporter.reputation < meta.config['min:rep:flag']) {
			throw new Error(`[[error:not-enough-reputation-to-flag, ${meta.config['min:rep:flag']}]]`);
		}
	} else if (payload.type === 'user') {
		if (Number.parseInt(payload.id, 10) === Number.parseInt(payload.uid, 10)) {
			throw new Error('[[error:cant-flag-self]]');
		}

		const editable = await privileges.users.canEdit(payload.uid, payload.id);
		if (!editable && !meta.config['reputation:disabled'] && reporter.reputation < meta.config['min:rep:flag']) {
			throw new Error(`[[error:not-enough-reputation-to-flag, ${meta.config['min:rep:flag']}]]`);
		}
	} else {
		throw new Error('[[error:invalid-data]]');
	}
};

Flags.getNotes = async function (flagId) {
	let notes = await db.getSortedSetRevRangeWithScores(`flag:${flagId}:notes`, 0, -1);
	notes = await modifyNotes(notes);
	return notes;
};

Flags.getNote = async function (flagId, datetime) {
	datetime = Number.parseInt(datetime, 10);
	if (isNaN(datetime)) {
		throw new TypeError('[[error:invalid-data]]');
	}

	let notes = await db.getSortedSetRangeByScoreWithScores(`flag:${flagId}:notes`, 0, 1, datetime, datetime);
	if (notes.length === 0) {
		throw new Error('[[error:invalid-data]]');
	}

	notes = await modifyNotes(notes);
	return notes[0];
};

Flags.getFlagIdByTarget = async function (type, id) {
	let method;
	switch (type) {
		case 'post': {
			method = posts.getPostField;
			break;
		}

		case 'user': {
			method = user.getUserField;
			break;
		}

		default: {
			throw new Error('[[error:invalid-data]]');
		}
	}

	return await method(id, 'flagId');
};

async function modifyNotes(notes) {
	const uids = [];
	notes = notes.map(note => {
		const noteObject = JSON.parse(note.value);
		uids.push(noteObject[0]);
		return {
			uid: noteObject[0],
			content: noteObject[1],
			datetime: note.score,
			datetimeISO: utils.toISOString(note.score),
		};
	});
	const userData = await user.getUsersFields(uids, ['username', 'userslug', 'picture']);
	return notes.map((note, index) => {
		note.user = userData[index];
		note.content = validator.escape(note.content);
		return note;
	});
}

Flags.deleteNote = async function (flagId, datetime) {
	datetime = Number.parseInt(datetime, 10);
	if (isNaN(datetime)) {
		throw new TypeError('[[error:invalid-data]]');
	}

	const note = await db.getSortedSetRangeByScore(`flag:${flagId}:notes`, 0, 1, datetime, datetime);
	if (note.length === 0) {
		throw new Error('[[error:invalid-data]]');
	}

	await db.sortedSetRemove(`flag:${flagId}:notes`, note[0]);
};

Flags.create = async function (type, id, uid, reason, timestamp, forceFlag = false) {
	let doHistoryAppend = false;
	if (!timestamp) {
		timestamp = Date.now();
		doHistoryAppend = true;
	}

	const [flagExists, targetExists,, targetFlagged, targetUid, targetCid] = await Promise.all([
		// Sanity checks
		Flags.exists(type, id, uid),
		Flags.targetExists(type, id),
		Flags.canFlag(type, id, uid, forceFlag),
		Flags.targetFlagged(type, id),

		// Extra data for zset insertion
		Flags.getTargetUid(type, id),
		Flags.getTargetCid(type, id),
	]);
	if (!forceFlag && flagExists) {
		throw new Error(`[[error:${type}-already-flagged]]`);
	} else if (!targetExists) {
		throw new Error('[[error:invalid-data]]');
	}

	// If the flag already exists, just add the report
	if (targetFlagged) {
		const flagId = await Flags.getFlagIdByTarget(type, id);
		await Promise.all([
			Flags.addReport(flagId, type, id, uid, reason, timestamp),
			Flags.update(flagId, uid, {state: 'open'}),
		]);

		return await Flags.get(flagId);
	}

	const flagId = await db.incrObjectField('global', 'nextFlagId');
	const batched = [];

	batched.push(
		db.setObject(`flag:${flagId}`, {
			flagId,
			type,
			targetId: id,
			targetUid,
			datetime: timestamp,
		}),
		Flags.addReport(flagId, type, id, uid, reason, timestamp),
		db.sortedSetAdd('flags:datetime', timestamp, flagId), // By time, the default
		db.sortedSetAdd(`flags:byType:${type}`, timestamp, flagId), // By flag type
		db.sortedSetIncrBy('flags:byTarget', 1, [type, id].join(':')), // By flag target (score is count)
		analytics.increment('flags'), // Some fancy analytics
	);

	if (targetUid) {
		batched.push(db.sortedSetAdd(`flags:byTargetUid:${targetUid}`, timestamp, flagId)); // By target uid
	}

	if (targetCid) {
		batched.push(db.sortedSetAdd(`flags:byCid:${targetCid}`, timestamp, flagId)); // By target cid
	}

	if (type === 'post') {
		batched.push(
			db.sortedSetAdd(`flags:byPid:${id}`, timestamp, flagId), // By target pid
			posts.setPostField(id, 'flagId', flagId),
		);

		if (targetUid && Number.parseInt(targetUid, 10) !== Number.parseInt(uid, 10)) {
			batched.push(user.incrementUserFlagsBy(targetUid, 1));
		}
	} else if (type === 'user') {
		batched.push(user.setUserField(id, 'flagId', flagId));
	}

	// Run all the database calls in one single batched call...
	await Promise.all(batched);

	if (doHistoryAppend) {
		await Flags.update(flagId, uid, {state: 'open'});
	}

	const flagObject = await Flags.get(flagId);

	plugins.hooks.fire('action:flags.create', {flag: flagObject});
	return flagObject;
};

Flags.purge = async function (flagIds) {
	const flagData = (await db.getObjects(flagIds.map(flagId => `flag:${flagId}`))).filter(Boolean);
	const postFlags = flagData.filter(flagObject => flagObject.type === 'post');
	const userFlags = flagData.filter(flagObject => flagObject.type === 'user');
	const assignedFlags = flagData.filter(flagObject => Boolean(flagObject.assignee));

	const [allReports, cids] = await Promise.all([
		db.getSortedSetsMembers(flagData.map(flagObject => `flag:${flagObject.flagId}:reports`)),
		categories.getAllCidsFromSet('categories:cid'),
	]);
	const allReporterUids = allReports.map(flagReports => flagReports.map(report => report && report.split(';')[0]));
	const removeReporters = [];
	for (const [i, flagObject] of flagData.entries()) {
		if (Array.isArray(allReporterUids[i])) {
			for (const uid of allReporterUids[i]) {
				removeReporters.push(['flags:hash', [flagObject.type, flagObject.targetId, uid].join(':')], [`flags:byReporter:${uid}`, flagObject.flagId]);
			}
		}
	}

	await Promise.all([
		db.sortedSetRemoveBulk([
			...flagData.map(flagObject => ([`flags:byType:${flagObject.type}`, flagObject.flagId])),
			...flagData.map(flagObject => ([`flags:byState:${flagObject.state}`, flagObject.flagId])),
			...removeReporters,
			...postFlags.map(flagObject => ([`flags:byPid:${flagObject.targetId}`, flagObject.flagId])),
			...assignedFlags.map(flagObject => ([`flags:byAssignee:${flagObject.assignee}`, flagObject.flagId])),
			...userFlags.map(flagObject => ([`flags:byTargetUid:${flagObject.targetUid}`, flagObject.flagId])),
		]),
		db.deleteObjectFields(postFlags.map(flagObject => `post:${flagObject.targetId}`)),
		db.deleteObjectFields(userFlags.map(flagObject => `user:${flagObject.targetId}`)),
		db.deleteAll([
			...flagIds.map(flagId => `flag:${flagId}`),
			...flagIds.map(flagId => `flag:${flagId}:notes`),
			...flagIds.map(flagId => `flag:${flagId}:reports`),
			...flagIds.map(flagId => `flag:${flagId}:history`),
		]),
		db.sortedSetRemove(cids.map(cid => `flags:byCid:${cid}`), flagIds),
		db.sortedSetRemove('flags:datetime', flagIds),
		db.sortedSetRemove(
			'flags:byTarget',
			flagData.map(flagObject => [flagObject.type, flagObject.targetId].join(':')),
		),
	]);
};

Flags.getReports = async function (flagId) {
	const payload = await db.getSortedSetRevRangeWithScores(`flag:${flagId}:reports`, 0, -1);
	const [reports, uids] = payload.reduce((memo, current) => {
		const value = current.value.split(';');
		memo[1].push(value.shift());
		current.value = validator.escape(String(value.join(';')));
		memo[0].push(current);

		return memo;
	}, [[], []]);

	await Promise.all(reports.map(async (report, index) => {
		report.timestamp = report.score;
		report.timestampISO = new Date(report.score).toISOString();
		delete report.score;
		report.reporter = await user.getUserFields(uids[index], ['username', 'userslug', 'picture', 'reputation']);
	}));

	return reports;
};

Flags.addReport = async function (flagId, type, id, uid, reason, timestamp) {
	await db.sortedSetAddBulk([
		[`flags:byReporter:${uid}`, timestamp, flagId],
		[`flag:${flagId}:reports`, timestamp, [uid, reason].join(';')],

		['flags:hash', flagId, [type, id, uid].join(':')],
	]);

	plugins.hooks.fire('action:flags.addReport', {
		flagId, type, id, uid, reason, timestamp,
	});
};

Flags.exists = async function (type, id, uid) {
	return await db.isSortedSetMember('flags:hash', [type, id, uid].join(':'));
};

Flags.canView = async (flagId, uid) => {
	const exists = await db.isSortedSetMember('flags:datetime', flagId);
	if (!exists) {
		return false;
	}

	const [{type, targetId}, isAdminOrGlobalModule] = await Promise.all([
		db.getObject(`flag:${flagId}`),
		user.isAdminOrGlobalMod(uid),
	]);

	if (type === 'post') {
		const cid = await Flags.getTargetCid(type, targetId);
		const isModerator = await user.isModerator(uid, cid);

		return isAdminOrGlobalModule || isModerator;
	}

	return isAdminOrGlobalModule;
};

Flags.canFlag = async function (type, id, uid, skipLimitCheck = false) {
	const limit = meta.config['flags:limitPerTarget'];
	if (!skipLimitCheck && limit > 0) {
		const score = await db.sortedSetScore('flags:byTarget', `${type}:${id}`);
		if (score >= limit) {
			throw new Error(`[[error:${type}-flagged-too-many-times]]`);
		}
	}

	const canRead = await privileges.posts.can('topics:read', id, uid);
	switch (type) {
		case 'user': {
			return true;
		}

		case 'post': {
			if (!canRead) {
				throw new Error('[[error:no-privileges]]');
			}

			break;
		}

		default: {
			throw new Error('[[error:invalid-data]]');
		}
	}
};

Flags.getTarget = async function (type, id, uid) {
	if (type === 'user') {
		const userData = await user.getUserData(id);
		return userData && userData.uid ? userData : {};
	}

	if (type === 'post') {
		let postData = await posts.getPostData(id);
		if (!postData) {
			return {};
		}

		postData = await posts.parsePost(postData);
		postData = await topics.addPostData([postData], uid);
		return postData[0];
	}

	throw new Error('[[error:invalid-data]]');
};

Flags.targetExists = async function (type, id) {
	if (type === 'post') {
		return await posts.exists(id);
	}

	if (type === 'user') {
		return await user.exists(id);
	}

	throw new Error('[[error:invalid-data]]');
};

Flags.targetFlagged = async function (type, id) {
	return await db.sortedSetScore('flags:byTarget', [type, id].join(':')) >= 1;
};

Flags.getTargetUid = async function (type, id) {
	if (type === 'post') {
		return await posts.getPostField(id, 'uid');
	}

	return id;
};

Flags.getTargetCid = async function (type, id) {
	if (type === 'post') {
		return await posts.getCidByPid(id);
	}

	return null;
};

Flags.update = async function (flagId, uid, changeset) {
	const current = await db.getObjectFields(`flag:${flagId}`, ['uid', 'state', 'assignee', 'type', 'targetId']);
	if (!current.type) {
		return;
	}

	const now = changeset.datetime || Date.now();
	const notifyAssignee = async function (assigneeId) {
		if (assigneeId === '' || Number.parseInt(uid, 10) === Number.parseInt(assigneeId, 10)) {
			return;
		}

		const notificationObject = await notifications.create({
			type: 'my-flags',
			bodyShort: `[[notifications:flag_assigned_to_you, ${flagId}]]`,
			bodyLong: '',
			path: `/flags/${flagId}`,
			nid: `flags:assign:${flagId}:uid:${assigneeId}`,
			from: uid,
		});
		await notifications.push(notificationObject, [assigneeId]);
	};

	const isAssignable = async function (assigneeId) {
		let allowed = false;
		allowed = await user.isAdminOrGlobalMod(assigneeId);

		// Mods are also allowed to be assigned, if flag target is post in uid's moderated cid
		if (!allowed && current.type === 'post') {
			const cid = await posts.getCidByPid(current.targetId);
			allowed = await user.isModerator(assigneeId, cid);
		}

		return allowed;
	};

	// Retrieve existing flag data to compare for history-saving/reference purposes
	const tasks = [];
	for (const property of Object.keys(changeset)) {
		if (current[property] === changeset[property]) {
			delete changeset[property];
		} else if (property === 'state') {
			if (Flags._states.has(changeset[property])) {
				tasks.push(db.sortedSetAdd(`flags:byState:${changeset[property]}`, now, flagId));
				tasks.push(db.sortedSetRemove(`flags:byState:${current[property]}`, flagId));
				if (changeset[property] === 'resolved' && meta.config['flags:actionOnResolve'] === 'rescind') {
					tasks.push(notifications.rescind(`flag:${current.type}:${current.targetId}`));
				}

				if (changeset[property] === 'rejected' && meta.config['flags:actionOnReject'] === 'rescind') {
					tasks.push(notifications.rescind(`flag:${current.type}:${current.targetId}`));
				}
			} else {
				delete changeset[property];
			}
		} else if (property === 'assignee') {
			if (changeset[property] === '') {
				tasks.push(db.sortedSetRemove(`flags:byAssignee:${changeset[property]}`, flagId));
				/* eslint-disable-next-line */
            } else if (!await isAssignable(parseInt(changeset[property], 10))) {
				delete changeset[property];
			} else {
				tasks.push(db.sortedSetAdd(`flags:byAssignee:${changeset[property]}`, now, flagId));
				tasks.push(notifyAssignee(changeset[property]));
			}
		}
	}

	if (Object.keys(changeset).length === 0) {
		return;
	}

	tasks.push(db.setObject(`flag:${flagId}`, changeset));
	tasks.push(Flags.appendHistory(flagId, uid, changeset));
	await Promise.all(tasks);

	plugins.hooks.fire('action:flags.update', {flagId, changeset, uid});
};

Flags.resolveFlag = async function (type, id, uid) {
	const flagId = await Flags.getFlagIdByTarget(type, id);
	if (Number.parseInt(flagId, 10)) {
		await Flags.update(flagId, uid, {state: 'resolved'});
	}
};

Flags.resolveUserPostFlags = async function (uid, callerUid) {
	if (meta.config['flags:autoResolveOnBan']) {
		await batch.processSortedSet(`uid:${uid}:posts`, async pids => {
			let postData = await posts.getPostsFields(pids, ['pid', 'flagId']);
			postData = postData.filter(p => p && p.flagId);
			for (const postObject of postData) {
				if (Number.parseInt(postObject.flagId, 10)) {
					// eslint-disable-next-line no-await-in-loop
					await Flags.update(postObject.flagId, callerUid, {state: 'resolved'});
				}
			}
		}, {
			batch: 500,
		});
	}
};

Flags.getHistory = async function (flagId) {
	const uids = [];
	let history = await db.getSortedSetRevRangeWithScores(`flag:${flagId}:history`, 0, -1);
	const targetUid = await db.getObjectField(`flag:${flagId}`, 'targetUid');

	history = history.map(entry => {
		entry.value = JSON.parse(entry.value);

		uids.push(entry.value[0]);

		// Deserialise changeset
		const changeset = entry.value[1];
		if (changeset.hasOwnProperty('state')) {
			changeset.state = changeset.state === undefined ? '' : `[[flags:state-${changeset.state}]]`;
		}

		return {
			uid: entry.value[0],
			fields: changeset,
			datetime: entry.score,
			datetimeISO: utils.toISOString(entry.score),
		};
	});

	// Append ban history and username change data
	history = await mergeBanHistory(history, targetUid, uids);
	history = await mergeMuteHistory(history, targetUid, uids);
	history = await mergeUsernameEmailChanges(history, targetUid, uids);

	const userData = await user.getUsersFields(uids, ['username', 'userslug', 'picture']);
	for (const [index, event] of history.entries()) {
		event.user = userData[index];
	}

	// Resort by date
	history = history.sort((a, b) => b.datetime - a.datetime);

	return history;
};

Flags.appendHistory = async function (flagId, uid, changeset) {
	const datetime = changeset.datetime || Date.now();
	delete changeset.datetime;
	const payload = JSON.stringify([uid, changeset, datetime]);
	await db.sortedSetAdd(`flag:${flagId}:history`, datetime, payload);
};

Flags.appendNote = async function (flagId, uid, note, datetime) {
	if (datetime) {
		try {
			await Flags.deleteNote(flagId, datetime);
		} catch (error) {
			// Do not throw if note doesn't exist
			if (!error.message === '[[error:invalid-data]]') {
				throw error;
			}
		}
	}

	datetime ||= Date.now();

	const payload = JSON.stringify([uid, note]);
	await db.sortedSetAdd(`flag:${flagId}:notes`, datetime, payload);
	await Flags.appendHistory(flagId, uid, {
		notes: null,
		datetime,
	});
};

Flags.notify = async function (flagObject, uid, notifySelf = false) {
	const [admins, globalMods] = await Promise.all([
		groups.getMembers('administrators', 0, -1),
		groups.getMembers('Global Moderators', 0, -1),
	]);
	let uids = admins.concat(globalMods);
	let notificationObject = null;

	const {displayname} = flagObject.reports.at(-1).reporter;

	if (flagObject.type === 'post') {
		const [title, cid] = await Promise.all([
			topics.getTitleByPid(flagObject.targetId),
			posts.getCidByPid(flagObject.targetId),
		]);

		const moduleUids = await categories.getModeratorUids([cid]);
		const titleEscaped = utils.decodeHTMLEntities(title).replaceAll('%', '&#37;').replaceAll(',', '&#44;');

		notificationObject = await notifications.create({
			type: 'new-post-flag',
			bodyShort: `[[notifications:user_flagged_post_in, ${displayname}, ${titleEscaped}]]`,
			bodyLong: await plugins.hooks.fire('filter:parse.raw', String(flagObject.description || '')),
			pid: flagObject.targetId,
			path: `/flags/${flagObject.flagId}`,
			nid: `flag:post:${flagObject.targetId}`,
			from: uid,
			mergeId: `notifications:user_flagged_post_in|${flagObject.targetId}`,
			topicTitle: title,
		});
		uids = uids.concat(moduleUids[0]);
	} else if (flagObject.type === 'user') {
		const targetDisplayname = flagObject.target && flagObject.target.user ? flagObject.target.user.displayname : '[[global:guest]]';
		notificationObject = await notifications.create({
			type: 'new-user-flag',
			bodyShort: `[[notifications:user_flagged_user, ${displayname}, ${targetDisplayname}]]`,
			bodyLong: await plugins.hooks.fire('filter:parse.raw', String(flagObject.description || '')),
			path: `/flags/${flagObject.flagId}`,
			nid: `flag:user:${flagObject.targetId}`,
			from: uid,
			mergeId: `notifications:user_flagged_user|${flagObject.targetId}`,
		});
	} else {
		throw new Error('[[error:invalid-data]]');
	}

	plugins.hooks.fire('action:flags.notify', {
		flag: flagObject,
		notification: notificationObject,
		from: uid,
		to: uids,
	});
	if (!notifySelf) {
		uids = uids.filter(_uid => Number.parseInt(_uid, 10) !== Number.parseInt(uid, 10));
	}

	await notifications.push(notificationObject, uids);
};

async function mergeBanHistory(history, targetUid, uids) {
	return await mergeBanMuteHistory(history, uids, {
		set: `uid:${targetUid}:bans:timestamp`,
		label: '[[user:banned]]',
		reasonDefault: '[[user:info.banned-no-reason]]',
		expiryKey: '[[user:info.banned-expiry]]',
	});
}

async function mergeMuteHistory(history, targetUid, uids) {
	return await mergeBanMuteHistory(history, uids, {
		set: `uid:${targetUid}:mutes:timestamp`,
		label: '[[user:muted]]',
		reasonDefault: '[[user:info.muted-no-reason]]',
		expiryKey: '[[user:info.muted-expiry]]',
	});
}

async function mergeBanMuteHistory(history, uids, parameters) {
	let recentObjs = await db.getSortedSetRevRange(parameters.set, 0, 19);
	recentObjs = await db.getObjects(recentObjs);

	return history.concat(recentObjs.reduce((memo, current) => {
		uids.push(current.fromUid);
		memo.push({
			uid: current.fromUid,
			meta: [
				{
					key: parameters.label,
					value: validator.escape(String(current.reason || parameters.reasonDefault)),
					labelClass: 'danger',
				},
				{
					key: parameters.expiryKey,
					value: new Date(Number.parseInt(current.expire, 10)).toISOString(),
					labelClass: 'default',
				},
			],
			datetime: Number.parseInt(current.timestamp, 10),
			datetimeISO: utils.toISOString(Number.parseInt(current.timestamp, 10)),
		});

		return memo;
	}, []));
}

async function mergeUsernameEmailChanges(history, targetUid, uids) {
	const usernameChanges = await user.getHistory(`user:${targetUid}:usernames`);
	const emailChanges = await user.getHistory(`user:${targetUid}:emails`);

	return history.concat(usernameChanges.reduce((memo, changeObject) => {
		uids.push(targetUid);
		memo.push({
			uid: targetUid,
			meta: [
				{
					key: '[[user:change_username]]',
					value: changeObject.value,
					labelClass: 'primary',
				},
			],
			datetime: changeObject.timestamp,
			datetimeISO: changeObject.timestampISO,
		});

		return memo;
	}, [])).concat(emailChanges.reduce((memo, changeObject) => {
		uids.push(targetUid);
		memo.push({
			uid: targetUid,
			meta: [
				{
					key: '[[user:change_email]]',
					value: changeObject.value,
					labelClass: 'primary',
				},
			],
			datetime: changeObject.timestamp,
			datetimeISO: changeObject.timestampISO,
		});

		return memo;
	}, []));
}

require('./promisify')(Flags);
