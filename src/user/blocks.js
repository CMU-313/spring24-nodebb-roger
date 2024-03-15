'use strict';

const db = require('../database');
const plugins = require('../plugins');
const cacheCreate = require('../cache/lru');

module.exports = function (User) {
	User.blocks = {
		_cache: cacheCreate({
			name: 'user:blocks',
			max: 100,
			ttl: 0,
		}),
	};

	User.blocks.is = async function (targetUid, uids) {
		const isArray = Array.isArray(uids);
		uids = isArray ? uids : [uids];
		const blocks = await User.blocks.list(uids);
		const isBlocked = uids.map((uid, index) => blocks[index] && blocks[index].includes(Number.parseInt(targetUid, 10)));
		return isArray ? isBlocked : isBlocked[0];
	};

	User.blocks.can = async function (callerUid, blockerUid, blockeeUid, type) {
		// Guests can't block
		if (blockerUid === 0 || blockeeUid === 0) {
			throw new Error('[[error:cannot-block-guest]]');
		} else if (blockerUid === blockeeUid) {
			throw new Error('[[error:cannot-block-self]]');
		}

		// Administrators and global moderators cannot be blocked
		// Only admins/mods can block users as another user
		const [isCallerAdminOrModule, isBlockeeAdminOrModule] = await Promise.all([
			User.isAdminOrGlobalMod(callerUid),
			User.isAdminOrGlobalMod(blockeeUid),
		]);
		if (isBlockeeAdminOrModule && type === 'block') {
			throw new Error('[[error:cannot-block-privileged]]');
		}

		if (Number.parseInt(callerUid, 10) !== Number.parseInt(blockerUid, 10) && !isCallerAdminOrModule) {
			throw new Error('[[error:no-privileges]]');
		}
	};

	User.blocks.list = async function (uids) {
		const isArray = Array.isArray(uids);
		uids = (isArray ? uids : [uids]).map(uid => Number.parseInt(uid, 10));
		const cachedData = {};
		const unCachedUids = User.blocks._cache.getUnCachedKeys(uids, cachedData);
		if (unCachedUids.length > 0) {
			const unCachedData = await db.getSortedSetsMembers(unCachedUids.map(uid => `uid:${uid}:blocked_uids`));
			for (const [index, uid] of unCachedUids.entries()) {
				cachedData[uid] = (unCachedData[index] || []).map(uid => Number.parseInt(uid, 10));
				User.blocks._cache.set(uid, cachedData[uid]);
			}
		}

		const result = uids.map(uid => cachedData[uid] || []);
		return isArray ? result.slice() : result[0];
	};

	User.blocks.add = async function (targetUid, uid) {
		await User.blocks.applyChecks('block', targetUid, uid);
		await db.sortedSetAdd(`uid:${uid}:blocked_uids`, Date.now(), targetUid);
		await User.incrementUserFieldBy(uid, 'blocksCount', 1);
		User.blocks._cache.del(Number.parseInt(uid, 10));
		plugins.hooks.fire('action:user.blocks.add', {uid, targetUid});
	};

	User.blocks.remove = async function (targetUid, uid) {
		await User.blocks.applyChecks('unblock', targetUid, uid);
		await db.sortedSetRemove(`uid:${uid}:blocked_uids`, targetUid);
		await User.decrementUserFieldBy(uid, 'blocksCount', 1);
		User.blocks._cache.del(Number.parseInt(uid, 10));
		plugins.hooks.fire('action:user.blocks.remove', {uid, targetUid});
	};

	User.blocks.applyChecks = async function (type, targetUid, uid) {
		await User.blocks.can(uid, uid, targetUid);
		const isBlock = type === 'block';
		const is = await User.blocks.is(targetUid, uid);
		if (is === isBlock) {
			throw new Error(`[[error:already-${isBlock ? 'blocked' : 'unblocked'}]]`);
		}
	};

	User.blocks.filterUids = async function (targetUid, uids) {
		const isBlocked = await User.blocks.is(targetUid, uids);
		return uids.filter((uid, index) => !isBlocked[index]);
	};

	User.blocks.filter = async function (uid, property, set) {
		// Given whatever is passed in, iterates through it, and removes entries made by blocked uids
		// property is optional
		if (Array.isArray(property) && set === undefined) {
			set = property;
			property = 'uid';
		}

		if (!Array.isArray(set) || set.length === 0) {
			return set;
		}

		const isPlain = typeof set[0] !== 'object';
		const blocked_uids = await User.blocks.list(uid);
		const blockedSet = new Set(blocked_uids);

		set = set.filter(item => !blockedSet.has(Number.parseInt(isPlain ? item : (item && item[property]), 10)));
		const data = await plugins.hooks.fire('filter:user.blocks.filter', {
			set, property, uid, blockedSet,
		});

		return data.set;
	};
};
