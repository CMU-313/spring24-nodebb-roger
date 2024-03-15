'use strict';

define('admin/manage/users', [
	'translator', 'benchpress', 'autocomplete', 'api', 'slugify', 'bootbox', 'alerts', 'accounts/invite',
], (translator, Benchpress, autocomplete, api, slugify, bootbox, alerts, AccountInvite) => {
	const Users = {};

	Users.init = function () {
		$('#results-per-page').val(ajaxify.data.resultsPerPage).on('change', () => {
			const query = utils.params();
			query.resultsPerPage = $('#results-per-page').val();
			const qs = buildSearchQuery(query);
			ajaxify.go(window.location.pathname + '?' + qs);
		});

		$('.export-csv').on('click', () => {
			socket.once('event:export-users-csv', () => {
				alerts.remove('export-users-start');
				alerts.alert({
					alert_id: 'export-users',
					type: 'success',
					title: '[[global:alert.success]]',
					message: '[[admin/manage/users:export-users-completed]]',
					clickfn() {
						window.location.href = config.relative_path + '/api/admin/users/csv';
					},
					timeout: 0,
				});
			});
			socket.emit('admin.user.exportUsersCSV', {}, error => {
				if (error) {
					return alerts.error(error);
				}

				alerts.alert({
					alert_id: 'export-users-start',
					message: '[[admin/manage/users:export-users-started]]',
					timeout: (ajaxify.data.userCount / 5000) * 500,
				});
			});

			return false;
		});

		function getSelectedUids() {
			const uids = [];

			$('.users-table [component="user/select/single"]').each(function () {
				if ($(this).is(':checked')) {
					uids.push($(this).attr('data-uid'));
				}
			});

			return uids;
		}

		function update(className, state) {
			$('.users-table [component="user/select/single"]:checked').parents('.user-row').find(className).each(function () {
				$(this).toggleClass('hidden', !state);
			});
		}

		function unselectAll() {
			$('.users-table [component="user/select/single"]').prop('checked', false);
			$('.users-table [component="user/select/all"]').prop('checked', false);
		}

		function removeRow(uid) {
			const checkboxElement = document.querySelector(`.users-table [component="user/select/single"][data-uid="${uid}"]`);
			if (checkboxElement) {
				const rowElement = checkboxElement.closest('.user-row');
				rowElement.remove();
			}
		}

		// Use onSuccess instead
		function done(successMessage, className, flag) {
			return function (error) {
				if (error) {
					return alerts.error(error);
				}

				alerts.success(successMessage);
				if (className) {
					update(className, flag);
				}

				unselectAll();
			};
		}

		function onSuccess(successMessage, className, flag) {
			alerts.success(successMessage);
			if (className) {
				update(className, flag);
			}

			unselectAll();
		}

		$('[component="user/select/all"]').on('click', function () {
			$('.users-table [component="user/select/single"]').prop('checked', $(this).is(':checked'));
		});

		$('.manage-groups').on('click', () => {
			const uids = getSelectedUids();
			if (uids.length === 0) {
				alerts.error('[[error:no-users-selected]]');
				return false;
			}

			socket.emit('admin.user.loadGroups', uids, (error, data) => {
				if (error) {
					return alerts.error(error);
				}

				Benchpress.render('admin/partials/manage_user_groups', data).then(html => {
					const modal = bootbox.dialog({
						message: html,
						title: '[[admin/manage/users:manage-groups]]',
						onEscape: true,
					});
					modal.on('shown.bs.modal', () => {
						autocomplete.group(modal.find('.group-search'), (event, ui) => {
							const uid = $(event.target).attr('data-uid');
							api.put('/groups/' + ui.item.group.slug + '/membership/' + uid, undefined).then(() => {
								ui.item.group.nameEscaped = translator.escape(ui.item.group.displayName);
								app.parseAndTranslate('admin/partials/manage_user_groups', {users: [{groups: [ui.item.group]}]}, html => {
									$('[data-uid=' + uid + '] .group-area').append(html.find('.group-area').html());
								});
							}).catch(alerts.error);
						});
					});
					modal.on('click', '.group-area a', () => {
						modal.modal('hide');
					});
					modal.on('click', '.remove-group-icon', function () {
						const groupCard = $(this).parents('[data-group-name]');
						const groupName = groupCard.attr('data-group-name');
						const uid = $(this).parents('[data-uid]').attr('data-uid');
						api.del('/groups/' + slugify(groupName) + '/membership/' + uid).then(() => {
							groupCard.remove();
						}).catch(alerts.error);
						return false;
					});
				});
			});
		});

		$('.ban-user').on('click', () => {
			const uids = getSelectedUids();
			if (uids.length === 0) {
				alerts.error('[[error:no-users-selected]]');
				return false; // Specifically to keep the menu open
			}

			bootbox.confirm((uids.length > 1 ? '[[admin/manage/users:alerts.confirm-ban-multi]]' : '[[admin/manage/users:alerts.confirm-ban]]'), confirm => {
				if (confirm) {
					Promise.all(uids.map(uid => api.put('/users/' + uid + '/ban'))).then(() => {
						onSuccess('[[admin/manage/users:alerts.ban-success]]', '.ban', true);
					}).catch(alerts.error);
				}
			});
		});

		$('.ban-user-temporary').on('click', () => {
			const uids = getSelectedUids();
			if (uids.length === 0) {
				alerts.error('[[error:no-users-selected]]');
				return false; // Specifically to keep the menu open
			}

			Benchpress.render('admin/partials/temporary-ban', {}).then(html => {
				bootbox.dialog({
					className: 'ban-modal',
					title: '[[user:ban_account]]',
					message: html,
					show: true,
					buttons: {
						close: {
							label: '[[global:close]]',
							className: 'btn-link',
						},
						submit: {
							label: '[[admin/manage/users:alerts.button-ban-x, ' + uids.length + ']]',
							callback() {
								const formData = $('.ban-modal form').serializeArray().reduce((data, current) => {
									data[current.name] = current.value;
									return data;
								}, {});
								const until = formData.length > 0 ? (
									Date.now()
                                    + (formData.length * 1000 * 60 * 60 * (Number.parseInt(formData.unit, 10) ? 24 : 1))
								) : 0;

								Promise.all(uids.map(uid => api.put('/users/' + uid + '/ban', {
									until,
									reason: formData.reason,
								}))).then(() => {
									onSuccess('[[admin/manage/users:alerts.ban-success]]', '.ban', true);
								}).catch(alerts.error);
							},
						},
					},
				});
			});
		});

		$('.unban-user').on('click', () => {
			const uids = getSelectedUids();
			if (uids.length === 0) {
				alerts.error('[[error:no-users-selected]]');
				return false; // Specifically to keep the menu open
			}

			Promise.all(uids.map(uid => api.del('/users/' + uid + '/ban'))).then(() => {
				onSuccess('[[admin/manage/users:alerts.unban-success]]', '.ban', false);
			});
		});

		$('.reset-lockout').on('click', () => {
			const uids = getSelectedUids();
			if (uids.length === 0) {
				return;
			}

			socket.emit('admin.user.resetLockouts', uids, done('[[admin/manage/users:alerts.lockout-reset-success]]'));
		});

		$('.validate-email').on('click', () => {
			const uids = getSelectedUids();
			if (uids.length === 0) {
				return;
			}

			bootbox.confirm('[[admin/manage/users:alerts.confirm-validate-email]]', confirm => {
				if (!confirm) {
					return;
				}

				socket.emit('admin.user.validateEmail', uids, error => {
					if (error) {
						return alerts.error(error);
					}

					alerts.success('[[admin/manage/users:alerts.validate-email-success]]');
					update('.notvalidated', false);
					update('.validated', true);
					unselectAll();
				});
			});
		});

		$('.send-validation-email').on('click', () => {
			const uids = getSelectedUids();
			if (uids.length === 0) {
				return;
			}

			socket.emit('admin.user.sendValidationEmail', uids, error => {
				if (error) {
					return alerts.error(error);
				}

				alerts.success('[[notifications:email-confirm-sent]]');
			});
		});

		$('.password-reset-email').on('click', () => {
			const uids = getSelectedUids();
			if (uids.length === 0) {
				return;
			}

			bootbox.confirm('[[admin/manage/users:alerts.password-reset-confirm]]', confirm => {
				if (confirm) {
					socket.emit('admin.user.sendPasswordResetEmail', uids, done('[[admin/manage/users:alerts.password-reset-email-sent]]'));
				}
			});
		});

		$('.force-password-reset').on('click', () => {
			const uids = getSelectedUids();
			if (uids.length === 0) {
				return;
			}

			bootbox.confirm('[[admin/manage/users:alerts.confirm-force-password-reset]]', confirm => {
				if (confirm) {
					socket.emit('admin.user.forcePasswordReset', uids, done('[[admin/manage/users:alerts.validate-force-password-reset-success]]'));
				}
			});
		});

		$('.delete-user').on('click', () => {
			handleDelete('[[admin/manage/users:alerts.confirm-delete]]', '/account');
		});

		$('.delete-user-content').on('click', () => {
			handleDelete('[[admin/manage/users:alerts.confirm-delete-content]]', '/content');
		});

		$('.delete-user-and-content').on('click', () => {
			handleDelete('[[admin/manage/users:alerts.confirm-purge]]', '');
		});

		const tableElement = document.querySelector('.users-table');
		const actionButton = document.querySelector('#action-dropdown');
		tableElement.addEventListener('change', e => {
			const subselector = e.target.closest('[component="user/select/single"]') || e.target.closest('[component="user/select/all"]');
			if (subselector) {
				const uids = getSelectedUids();
				if (uids.length > 0) {
					actionButton.removeAttribute('disabled');
				} else {
					actionButton.setAttribute('disabled', 'disabled');
				}
			}
		});

		function handleDelete(confirmMessage, path) {
			const uids = getSelectedUids();
			if (uids.length === 0) {
				return;
			}

			bootbox.confirm(confirmMessage, confirm => {
				if (confirm) {
					Promise.all(
						uids.map(
							uid => api.del(`/users/${uid}${path}`, {}).then(() => {
								if (path !== '/content') {
									removeRow(uid);
								}
							}),
						),
					).then(() => {
						if (path === '/content') {
							alerts.success('[[admin/manage/users:alerts.delete-content-success]]');
						} else {
							alerts.success('[[admin/manage/users:alerts.delete-success]]');
						}

						unselectAll();
						if ($('.users-table [component="user/select/single"]').length === 0) {
							ajaxify.refresh();
						}
					}).catch(alerts.error);
				}
			});
		}

		function handleUserCreate() {
			$('[data-action="create"]').on('click', () => {
				Benchpress.render('admin/partials/create_user_modal', {}).then(html => {
					const modal = bootbox.dialog({
						message: html,
						title: '[[admin/manage/users:alerts.create]]',
						onEscape: true,
						buttons: {
							cancel: {
								label: '[[admin/manage/users:alerts.button-cancel]]',
								className: 'btn-link',
							},
							create: {
								label: '[[admin/manage/users:alerts.button-create]]',
								className: 'btn-primary',
								callback() {
									createUser.call(this);
									return false;
								},
							},
						},
					});
					modal.on('shown.bs.modal', () => {
						modal.find('#create-user-name').focus();
					});
				});
				return false;
			});
		}

		function createUser() {
			const modal = this;
			const username = document.querySelector('#create-user-name').value;
			const email = document.querySelector('#create-user-email').value;
			const password = document.querySelector('#create-user-password').value;
			const passwordAgain = document.querySelector('#create-user-password-again').value;

			const errorElement = $('#create-modal-error');

			if (password !== passwordAgain) {
				return errorElement.translateHtml('[[admin/manage/users:alerts.error-x, [[admin/manage/users:alerts.error-passwords-different]]]]').removeClass('hide');
			}

			const user = {
				username,
				email,
				password,
			};

			api.post('/users', user)
				.then(() => {
					modal.modal('hide');
					modal.on('hidden.bs.modal', () => {
						ajaxify.refresh();
					});
					alerts.success('[[admin/manage/users:alerts.create-success]]');
				})
				.catch(error => errorElement.translateHtml('[[admin/manage/users:alerts.error-x, ' + error.message + ']]').removeClass('hidden'));
		}

		handleSearch();
		handleUserCreate();
		handleSort();
		handleFilter();
		AccountInvite.handle();
	};

	function handleSearch() {
		function doSearch() {
			$('.fa-spinner').removeClass('hidden');
			loadSearchPage({
				searchBy: $('#user-search-by').val(),
				query: $('#user-search').val(),
				page: 1,
			});
		}

		$('#user-search').on('keyup', utils.debounce(doSearch, 250));
		$('#user-search-by').on('change', doSearch);
	}

	function loadSearchPage(query) {
		const parameters = utils.params();
		parameters.searchBy = query.searchBy;
		parameters.query = query.query;
		parameters.page = query.page;
		parameters.sortBy = parameters.sortBy || 'lastonline';
		const qs = decodeURIComponent($.param(parameters));
		$.get(config.relative_path + '/api/admin/manage/users?' + qs, data => {
			renderSearchResults(data);
			const url = config.relative_path + '/admin/manage/users?' + qs;
			if (history.pushState) {
				history.pushState({
					url,
				}, null, window.location.protocol + '//' + window.location.host + url);
			}
		}).fail(xhrError => {
			if (xhrError && xhrError.responseJSON && xhrError.responseJSON.error) {
				alerts.error(xhrError.responseJSON.error);
			}
		});
	}

	function renderSearchResults(data) {
		Benchpress.render('partials/paginator', {pagination: data.pagination}).then(html => {
			$('.pagination-container').replaceWith(html);
		});

		app.parseAndTranslate('admin/manage/users', 'users', data, html => {
			$('.users-table tbody tr').remove();
			$('.users-table tbody').append(html);
			html.find('.timeago').timeago();
			$('.fa-spinner').addClass('hidden');
			if (!$('#user-search').val()) {
				$('#user-found-notify').addClass('hidden');
				$('#user-notfound-notify').addClass('hidden');
				return;
			}

			if (data && data.users.length === 0) {
				$('#user-notfound-notify').translateHtml('[[admin/manage/users:search.not-found]]')
					.removeClass('hidden');
				$('#user-found-notify').addClass('hidden');
			} else {
				$('#user-found-notify').translateHtml(
					translator.compile('admin/manage/users:alerts.x-users-found', data.matchCount, data.timing),
				).removeClass('hidden');
				$('#user-notfound-notify').addClass('hidden');
			}
		});
	}

	function buildSearchQuery(parameters) {
		if ($('#user-search').val()) {
			parameters.query = $('#user-search').val();
			parameters.searchBy = $('#user-search-by').val();
		} else {
			delete parameters.query;
			delete parameters.searchBy;
		}

		return decodeURIComponent($.param(parameters));
	}

	function handleSort() {
		$('.users-table thead th').on('click', function () {
			const $this = $(this);
			const sortBy = $this.attr('data-sort');
			if (!sortBy) {
				return;
			}

			const parameters = utils.params();
			parameters.sortBy = sortBy;
			if (ajaxify.data.sortBy === sortBy) {
				parameters.sortDirection = ajaxify.data.reverse ? 'asc' : 'desc';
			} else {
				parameters.sortDirection = 'desc';
			}

			const qs = buildSearchQuery(parameters);
			ajaxify.go('admin/manage/users?' + qs);
		});
	}

	function getFilters() {
		const filters = [];
		$('#filter-by').find('[data-filter-by]').each(function () {
			if ($(this).find('.fa-check').length > 0) {
				filters.push($(this).attr('data-filter-by'));
			}
		});
		return filters;
	}

	function handleFilter() {
		let currentFilters = getFilters();
		$('#filter-by').on('click', 'li', function () {
			const $this = $(this);
			$this.find('i').toggleClass('fa-check', !$this.find('i').hasClass('fa-check'));
			return false;
		});

		$('#filter-by').on('hidden.bs.dropdown', () => {
			const filters = getFilters();
			let changed = filters.length !== currentFilters.length;
			if (filters.length === currentFilters.length) {
				for (const [i, filter] of filters.entries()) {
					if (filter !== currentFilters[i]) {
						changed = true;
					}
				}
			}

			currentFilters = getFilters();
			if (changed) {
				const parameters = utils.params();
				parameters.filters = filters;
				const qs = buildSearchQuery(parameters);
				ajaxify.go('admin/manage/users?' + qs);
			}
		});
	}

	return Users;
});
