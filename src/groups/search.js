'use strict';

const user = require('../user');
const db = require('../database');

module.exports = function (Groups) {
	Groups.search = async function (query, options) {
		if (!query) {
			return [];
		}

		query = String(query).toLowerCase();
		let groupNames = await db.getSortedSetRange('groups:createtime', 0, -1);
		if (!options.hideEphemeralGroups) {
			groupNames = Groups.ephemeralGroups.concat(groupNames);
		}

		groupNames = groupNames.filter(name => name.toLowerCase().includes(query)
            && name !== Groups.BANNED_USERS // Hide banned-users in searches
            && !Groups.isPrivilegeGroup(name));
		groupNames = groupNames.slice(0, 100);

		let groupsData;
		groupsData = await (options.showMembers ? Groups.getGroupsAndMembers(groupNames) : Groups.getGroupsData(groupNames));

		groupsData = groupsData.filter(Boolean);
		if (options.filterHidden) {
			groupsData = groupsData.filter(group => !group.hidden);
		}

		return Groups.sort(options.sort, groupsData);
	};

	Groups.sort = function (strategy, groups) {
		switch (strategy) {
			case 'count': {
				groups.sort((a, b) => a.slug > b.slug)
					.sort((a, b) => b.memberCount - a.memberCount);
				break;
			}

			case 'date': {
				groups.sort((a, b) => b.createtime - a.createtime);
				break;
			}

			case 'alpha': // Intentional fall-through
			default: {
				groups.sort((a, b) => (a.slug > b.slug ? 1 : -1));
			}
		}

		return groups;
	};

	Groups.searchMembers = async function (data) {
		if (!data.query) {
			const users = await Groups.getOwnersAndMembers(data.groupName, data.uid, 0, 19);
			return {users};
		}

		const results = await user.search({
			...data,
			paginate: false,
			hardCap: -1,
		});

		const uids = results.users.map(user => user && user.uid);
		const isOwners = await Groups.ownership.isOwners(uids, data.groupName);

		for (const [index, user] of results.users.entries()) {
			if (user) {
				user.isOwner = isOwners[index];
			}
		}

		results.users.sort((a, b) => {
			if (a.isOwner && !b.isOwner) {
				return -1;
			}

			if (!a.isOwner && b.isOwner) {
				return 1;
			}

			return 0;
		});
		return results;
	};
};
