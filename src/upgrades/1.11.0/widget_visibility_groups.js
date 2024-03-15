'use strict';

module.exports = {
	name: 'Widget visibility groups',
	timestamp: Date.UTC(2018, 10, 10),
	async method() {
		const widgetAdmin = require('../../widgets/admin');
		const widgets = require('../../widgets');
		const areas = await widgetAdmin.getAreas();
		for (const area of areas) {
			if (area.data.length > 0) {
				// Area.data is actually an array of widgets
				area.widgets = area.data;
				for (const widget of area.widgets) {
					if (widget && widget.data) {
						const groupsToShow = ['administrators', 'Global Moderators'];
						if (widget.data['hide-guests'] !== 'on') {
							groupsToShow.push('guests');
						}

						if (widget.data['hide-registered'] !== 'on') {
							groupsToShow.push('registered-users');
						}

						widget.data.groups = groupsToShow;

						// If we are showing to all 4 groups, set to empty array
						// empty groups is shown to everyone
						if (groupsToShow.length === 4) {
							widget.data.groups.length = 0;
						}
					}
				}

				// eslint-disable-next-line no-await-in-loop
				await widgets.setArea(area);
			}
		}
	},
};
