'use strict';

define('settings/number', () => ({
	types: ['number'],
	get(element, trim, empty) {
		const value = element.val();
		if (!empty) {
			if (value) {
				return Number(value);
			}

			return;
		}

		return value ? Number(value) : 0;
	},
}));
