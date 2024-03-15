'use strict';

define('forum/groups/list', [
	'forum/infinitescroll', 'benchpress', 'api', 'bootbox', 'alerts',
], (infinitescroll, Benchpress, api, bootbox, alerts) => {
	const Groups = {};

	Groups.init = function () {
		infinitescroll.init(Groups.loadMoreGroups);

		// Group creation
		$('button[data-action="new"]').on('click', () => {
			bootbox.prompt('[[groups:new-group.group_name]]', name => {
				if (name && name.length > 0) {
					api.post('/groups', {
						name,
					}).then(res => {
						ajaxify.go('groups/' + res.slug);
					}).catch(alerts.error);
				}
			});
		});
		const parameters = utils.params();
		$('#search-sort').val(parameters.sort || 'alpha');

		// Group searching
		$('#search-text').on('keyup', Groups.search);
		$('#search-button').on('click', Groups.search);
		$('#search-sort').on('change', () => {
			ajaxify.go('groups?sort=' + $('#search-sort').val());
		});
	};

	Groups.loadMoreGroups = function (direction) {
		if (direction < 0) {
			return;
		}

		infinitescroll.loadMore('groups.loadMore', {
			sort: $('#search-sort').val(),
			after: $('[component="groups/container"]').attr('data-nextstart'),
		}, (data, done) => {
			if (data && data.groups.length > 0) {
				Benchpress.render('partials/groups/list', {
					groups: data.groups,
				}).then(html => {
					$('#groups-list').append(html);
					done();
				});
			} else {
				done();
			}

			if (data && data.nextStart) {
				$('[component="groups/container"]').attr('data-nextstart', data.nextStart);
			}
		});
	};

	Groups.search = function () {
		const groupsElement = $('#groups-list');
		const queryElement = $('#search-text');
		const sortElement = $('#search-sort');

		socket.emit('groups.search', {
			query: queryElement.val(),
			options: {
				sort: sortElement.val(),
				filterHidden: true,
				showMembers: true,
				hideEphemeralGroups: true,
			},
		}, (error, groups) => {
			if (error) {
				return alerts.error(error);
			}

			groups = groups.filter(group => group.name !== 'registered-users' && group.name !== 'guests');
			Benchpress.render('partials/groups/list', {
				groups,
			}).then(html => {
				groupsElement.empty().append(html);
			});
		});
		return false;
	};

	return Groups;
});
