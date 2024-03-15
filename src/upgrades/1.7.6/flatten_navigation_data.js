'use strict';

const db = require('../../database');

module.exports = {
	name: 'Flatten navigation data',
	timestamp: Date.UTC(2018, 1, 17),
	async method() {
		const data = await db.getSortedSetRangeWithScores('navigation:enabled', 0, -1);
		const order = [];
		const items = [];
		for (const item of data) {
			let navItem = JSON.parse(item.value);
			const keys = Object.keys(navItem);
			if (keys.length > 0 && Number.parseInt(keys[0], 10) >= 0) {
				navItem = navItem[keys[0]];
			}

			order.push(item.score);
			items.push(JSON.stringify(navItem));
		}

		await db.delete('navigation:enabled');
		await db.sortedSetAdd('navigation:enabled', order, items);
	},
};
