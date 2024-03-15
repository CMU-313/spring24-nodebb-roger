'use strict';

const _ = require('lodash');
const validator = require('validator');
const db = require('../database');
const posts = require('../posts');
const topics = require('../topics');
const utils = require('../utils');

module.exports = function (User) {
	User.getLatestBanInfo = async function (uid) {
		// Simply retrieves the last record of the user's ban, even if they've been unbanned since then.
		const record = await db.getSortedSetRevRange(`uid:${uid}:bans:timestamp`, 0, 0);
		if (record.length === 0) {
			throw new Error('no-ban-info');
		}

		const banInfo = await db.getObject(record[0]);
		const expire = Number.parseInt(banInfo.expire, 10);
		const expire_readable = utils.toISOString(expire);
		return {
			uid,
			timestamp: banInfo.timestamp,
			banned_until: expire,
			expiry: expire, /* Backward compatible alias */
			banned_until_readable: expire_readable,
			expiry_readable: expire_readable, /* Backward compatible alias */
			reason: validator.escape(String(banInfo.reason || '')),
		};
	};

	User.getModerationHistory = async function (uid) {
		let [flags, bans, mutes] = await Promise.all([
			db.getSortedSetRevRangeWithScores(`flags:byTargetUid:${uid}`, 0, 19),
			db.getSortedSetRevRange(`uid:${uid}:bans:timestamp`, 0, 19),
			db.getSortedSetRevRange(`uid:${uid}:mutes:timestamp`, 0, 19),
		]);

		// Get pids from flag objects
		const keys = flags.map(flagObject => `flag:${flagObject.value}`);
		const payload = await db.getObjectsFields(keys, ['type', 'targetId']);

		// Only pass on flag ids from posts
		flags = payload.reduce((memo, current, index) => {
			if (current.type === 'post') {
				memo.push({
					value: Number.parseInt(current.targetId, 10),
					score: flags[index].score,
				});
			}

			return memo;
		}, []);

		[flags, bans, mutes] = await Promise.all([
			getFlagMetadata(flags),
			formatBanMuteData(bans, '[[user:info.banned-no-reason]]'),
			formatBanMuteData(mutes, '[[user:info.muted-no-reason]]'),
		]);

		return {
			flags,
			bans,
			mutes,
		};
	};

	User.getHistory = async function (set) {
		const data = await db.getSortedSetRevRangeWithScores(set, 0, -1);
		return data.map(set => {
			set.timestamp = set.score;
			set.timestampISO = utils.toISOString(set.score);
			set.value = validator.escape(String(set.value.split(':')[0]));
			delete set.score;
			return set;
		});
	};

	async function getFlagMetadata(flags) {
		const pids = flags.map(flagObject => Number.parseInt(flagObject.value, 10));
		const postData = await posts.getPostsFields(pids, ['tid']);
		const tids = postData.map(post => post.tid);

		const topicData = await topics.getTopicsFields(tids, ['title']);
		flags = flags.map((flagObject, index) => {
			flagObject.pid = flagObject.value;
			flagObject.timestamp = flagObject.score;
			flagObject.timestampISO = new Date(flagObject.score).toISOString();
			flagObject.timestampReadable = new Date(flagObject.score).toString();

			delete flagObject.value;
			delete flagObject.score;
			if (!tids[index]) {
				flagObject.targetPurged = true;
			}

			return _.extend(flagObject, topicData[index]);
		});
		return flags;
	}

	async function formatBanMuteData(keys, noReasonLangKey) {
		const data = await db.getObjects(keys);
		const uids = data.map(d => d.fromUid);
		const usersData = await User.getUsersFields(uids, ['uid', 'username', 'userslug', 'picture']);
		return data.map((banObject, index) => {
			banObject.user = usersData[index];
			banObject.until = Number.parseInt(banObject.expire, 10);
			banObject.untilReadable = new Date(banObject.until).toString();
			banObject.timestampReadable = new Date(Number.parseInt(banObject.timestamp, 10)).toString();
			banObject.timestampISO = utils.toISOString(banObject.timestamp);
			banObject.reason = validator.escape(String(banObject.reason || '')) || noReasonLangKey;
			return banObject;
		});
	}

	User.getModerationNotes = async function (uid, start, stop) {
		const noteIds = await db.getSortedSetRevRange(`uid:${uid}:moderation:notes`, start, stop);
		const keys = noteIds.map(id => `uid:${uid}:moderation:note:${id}`);
		const notes = await db.getObjects(keys);
		const uids = [];

		const noteData = notes.map(note => {
			if (note) {
				uids.push(note.uid);
				note.timestampISO = utils.toISOString(note.timestamp);
				note.note = validator.escape(String(note.note));
			}

			return note;
		});

		const userData = await User.getUsersFields(uids, ['uid', 'username', 'userslug', 'picture']);
		for (const [index, note] of noteData.entries()) {
			if (note) {
				note.user = userData[index];
			}
		}

		return noteData;
	};

	User.appendModerationNote = async ({uid, noteData}) => {
		await db.sortedSetAdd(`uid:${uid}:moderation:notes`, noteData.timestamp, noteData.timestamp);
		await db.setObject(`uid:${uid}:moderation:note:${noteData.timestamp}`, noteData);
	};
};
