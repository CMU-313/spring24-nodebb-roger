'use strict';

const db = require('../../database');

module.exports = {
	name: 'Unescape navigation titles',
	timestamp: Date.UTC(2020, 5, 26),
	async method() {
		const data = await db.getSortedSetRangeWithScores('navigation:enabled', 0, -1);
		const translator = require('../../translator');
		const order = [];
		const items = [];
		for (const item of data) {
			const navItem = JSON.parse(item.value);
			if (navItem.hasOwnProperty('title')) {
				navItem.title = translator.unescape(navItem.title);
				navItem.title = navItem.title.replaceAll('&#x5C;', '');
			}

			if (navItem.hasOwnProperty('text')) {
				navItem.text = translator.unescape(navItem.text);
				navItem.text = navItem.text.replaceAll('&#x5C;', '');
			}

			if (navItem.hasOwnProperty('route')) {
				navItem.route = navItem.route.replace('&#x2F;', '/');
			}

			order.push(item.score);
			items.push(JSON.stringify(navItem));
		}

		await db.delete('navigation:enabled');
		await db.sortedSetAdd('navigation:enabled', order, items);
	},
};
