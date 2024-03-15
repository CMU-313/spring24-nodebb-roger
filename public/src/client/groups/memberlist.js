'use strict';

define('forum/groups/memberlist', ['api', 'bootbox', 'alerts'], (api, bootbox, alerts) => {
	const MemberList = {};
	let groupName;
	let templateName;

	MemberList.init = function (_templateName) {
		templateName = _templateName || 'groups/details';
		groupName = ajaxify.data.group.name;

		handleMemberAdd();
		handleMemberSearch();
		handleMemberInfiniteScroll();
	};

	function handleMemberAdd() {
		$('[component="groups/members/add"]').on('click', () => {
			app.parseAndTranslate('admin/partials/groups/add-members', {}, html => {
				const foundUsers = [];
				const modal = bootbox.dialog({
					title: '[[groups:details.add-member]]',
					message: html,
					buttons: {
						ok: {
							callback() {
								const users = [];
								modal.find('[data-uid][data-selected]').each((index, element) => {
									users.push(foundUsers[$(element).attr('data-uid')]);
								});
								addUserToGroup(users, () => {
									modal.modal('hide');
								});
							},
						},
					},
				});
				modal.on('click', '[data-username]', function () {
					const isSelected = $(this).attr('data-selected') === '1';
					if (isSelected) {
						$(this).removeAttr('data-selected');
					} else {
						$(this).attr('data-selected', 1);
					}

					$(this).find('i').toggleClass('invisible');
				});
				modal.find('input').on('keyup', function () {
					api.get('/api/users', {
						query: $(this).val(),
						paginate: false,
					}, (error, result) => {
						if (error) {
							return alerts.error(error);
						}

						for (const user of result.users) {
							foundUsers[user.uid] = user;
						}

						app.parseAndTranslate('admin/partials/groups/add-members', 'users', {users: result.users}, html => {
							modal.find('#search-result').html(html);
						});
					});
				});
			});
		});
	}

	function addUserToGroup(users, callback) {
		function done() {
			users = users.filter(user => $('[component="groups/members"] [data-uid="' + user.uid + '"]').length === 0);
			parseAndTranslate(users, html => {
				$('[component="groups/members"] tbody').prepend(html);
			});
			callback();
		}

		const uids = users.map(user => user.uid);
		if (groupName === 'administrators') {
			socket.emit('admin.user.makeAdmins', uids, error => {
				if (error) {
					return alerts.error(error);
				}

				done();
			});
		} else {
			Promise.all(uids.map(uid => api.put('/groups/' + ajaxify.data.group.slug + '/membership/' + uid))).then(done).catch(alerts.error);
		}
	}

	function handleMemberSearch() {
		const searchElement = $('[component="groups/members/search"]');
		searchElement.on('keyup', utils.debounce(() => {
			const query = searchElement.val();
			socket.emit('groups.searchMembers', {
				groupName,
				query,
			}, (error, results) => {
				if (error) {
					return alerts.error(error);
				}

				parseAndTranslate(results.users, html => {
					$('[component="groups/members"] tbody').html(html);
					$('[component="groups/members"]').attr('data-nextstart', 20);
				});
			});
		}, 250));
	}

	function handleMemberInfiniteScroll() {
		$('[component="groups/members"] tbody').on('scroll', function () {
			const $this = $(this);
			const bottom = ($this[0].scrollHeight - $this.innerHeight()) * 0.9;

			if ($this.scrollTop() > bottom && !$('[component="groups/members/search"]').val()) {
				loadMoreMembers();
			}
		});
	}

	function loadMoreMembers() {
		const members = $('[component="groups/members"]');
		if (members.attr('loading')) {
			return;
		}

		members.attr('loading', 1);
		socket.emit('groups.loadMoreMembers', {
			groupName,
			after: members.attr('data-nextstart'),
		}, (error, data) => {
			if (error) {
				return alerts.error(error);
			}

			if (data && data.users.length > 0) {
				onMembersLoaded(data.users, () => {
					members.removeAttr('loading');
					members.attr('data-nextstart', data.nextStart);
				});
			} else {
				members.removeAttr('loading');
			}
		});
	}

	function onMembersLoaded(users, callback) {
		users = users.filter(user => $('[component="groups/members"] [data-uid="' + user.uid + '"]').length === 0);

		parseAndTranslate(users, html => {
			$('[component="groups/members"] tbody').append(html);
			callback();
		});
	}

	function parseAndTranslate(users, callback) {
		app.parseAndTranslate(templateName, 'group.members', {
			group: {
				members: users,
				isOwner: ajaxify.data.group.isOwner,
			},
		}, callback);
	}

	return MemberList;
});
