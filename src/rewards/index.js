'use strict';

const util = require('node:util');
const db = require('../database');
const plugins = require('../plugins');

const rewards = module.exports;

rewards.checkConditionAndRewardUser = async function (parameters) {
	const {uid, condition, method} = parameters;
	const isActive = await isConditionActive(condition);
	if (!isActive) {
		return;
	}

	const ids = await getIDsByCondition(condition);
	let rewardData = await getRewardDataByIDs(ids);
	rewardData = await filterCompletedRewards(uid, rewardData);
	rewardData = rewardData.filter(Boolean);
	if (!rewardData || rewardData.length === 0) {
		return;
	}

	const eligible = await Promise.all(rewardData.map(reward => checkCondition(reward, method)));
	const eligibleRewards = rewardData.filter((reward, index) => eligible[index]);
	await giveRewards(uid, eligibleRewards);
};

async function isConditionActive(condition) {
	return await db.isSetMember('conditions:active', condition);
}

async function getIDsByCondition(condition) {
	return await db.getSetMembers(`condition:${condition}:rewards`);
}

async function filterCompletedRewards(uid, rewards) {
	const data = await db.getSortedSetRangeByScoreWithScores(`uid:${uid}:rewards`, 0, -1, 1, '+inf');
	const userRewards = {};

	for (const object of data) {
		userRewards[object.value] = Number.parseInt(object.score, 10);
	}

	return rewards.filter(reward => {
		if (!reward) {
			return false;
		}

		const claimable = Number.parseInt(reward.claimable, 10);
		return claimable === 0 || (!userRewards[reward.id] || userRewards[reward.id] < reward.claimable);
	});
}

async function getRewardDataByIDs(ids) {
	return await db.getObjects(ids.map(id => `rewards:id:${id}`));
}

async function getRewardsByRewardData(rewards) {
	return await db.getObjects(rewards.map(reward => `rewards:id:${reward.id}:rewards`));
}

async function checkCondition(reward, method) {
	if (method.constructor && method.constructor.name !== 'AsyncFunction') {
		method = util.promisify(method);
	}

	const value = await method();
	const bool = await plugins.hooks.fire(`filter:rewards.checkConditional:${reward.conditional}`, {left: value, right: reward.value});
	return bool;
}

async function giveRewards(uid, rewards) {
	const rewardData = await getRewardsByRewardData(rewards);
	for (const [i, reward] of rewards.entries()) {
		/* eslint-disable no-await-in-loop */
		await plugins.hooks.fire(`action:rewards.award:${reward.rid}`, {uid, reward: rewardData[i]});
		await db.sortedSetIncrBy(`uid:${uid}:rewards`, 1, reward.id);
	}
}

require('../promisify')(rewards);
