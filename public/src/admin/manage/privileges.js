'use strict';

define('admin/manage/privileges', [
	'api',
	'autocomplete',
	'bootbox',
	'alerts',
	'translator',
	'categorySelector',
	'mousetrap',
	'admin/modules/checkboxRowSelector',
], (api, autocomplete, bootbox, alerts, translator, categorySelector, mousetrap, checkboxRowSelector) => {
	const Privileges = {};

	let cid;
	// Number of columns to skip in category privilege tables
	const SKIP_PRIV_COLS = 3;

	Privileges.init = function () {
		cid = isNaN(Number.parseInt(ajaxify.data.selectedCategory.cid, 10)) ? 'admin' : ajaxify.data.selectedCategory.cid;

		checkboxRowSelector.init('.privilege-table-container');

		categorySelector.init($('[component="category-selector"]'), {
			onSelect(category) {
				cid = Number.parseInt(category.cid, 10);
				cid = isNaN(cid) ? 'admin' : cid;
				Privileges.refreshPrivilegeTable();
				ajaxify.updateHistory('admin/manage/privileges/' + (cid || ''));
			},
			localCategories: ajaxify.data.categories,
			privilege: 'find',
			showLinks: true,
		});

		Privileges.setupPrivilegeTable();

		highlightRow();
		$('.privilege-filters button:last-child').click();
	};

	Privileges.setupPrivilegeTable = function () {
		$('.privilege-table-container').on('change', 'input[type="checkbox"]:not(.checkbox-helper)', function () {
			const $checkboxElement = $(this);
			const $wrapperElement = $checkboxElement.parent();
			const columnNo = $wrapperElement.index() + 1;
			const privilege = $wrapperElement.attr('data-privilege');
			const state = $checkboxElement.prop('checked');
			const $rowElement = $checkboxElement.parents('tr');
			const member = $rowElement.attr('data-group-name') || $rowElement.attr('data-uid');
			const isPrivate = Number.parseInt($rowElement.attr('data-private') || 0, 10);
			const isGroup = $rowElement.attr('data-group-name') !== undefined;
			const isBanned = (isGroup && $rowElement.attr('data-group-name') === 'banned-users') || $rowElement.attr('data-banned') !== undefined;
			const sourceGroupName = isBanned ? 'banned-users' : 'registered-users';
			const delta = $checkboxElement.prop('checked') === ($wrapperElement.attr('data-value') === 'true') ? null : state;

			if (member) {
				if (isGroup && privilege === 'groups:moderate' && !isPrivate && state) {
					bootbox.confirm('[[admin/manage/privileges:alert.confirm-moderate]]', confirm => {
						if (confirm) {
							$wrapperElement.attr('data-delta', delta);
							Privileges.exposeSingleAssumedPriv(columnNo, sourceGroupName);
						} else {
							$checkboxElement.prop('checked', !$checkboxElement.prop('checked'));
						}
					});
				} else if (privilege.endsWith('admin:admins-mods') && state) {
					bootbox.confirm('[[admin/manage/privileges:alert.confirm-admins-mods]]', confirm => {
						if (confirm) {
							$wrapperElement.attr('data-delta', delta);
							Privileges.exposeSingleAssumedPriv(columnNo, sourceGroupName);
						} else {
							$checkboxElement.prop('checked', !$checkboxElement.prop('checked'));
						}
					});
				} else {
					$wrapperElement.attr('data-delta', delta);
					Privileges.exposeSingleAssumedPriv(columnNo, sourceGroupName);
				}

				checkboxRowSelector.updateState($checkboxElement);
			} else {
				alerts.error('[[error:invalid-data]]');
			}
		});

		Privileges.exposeAssumedPrivileges();
		checkboxRowSelector.updateAll();
		Privileges.addEvents(); // Events with confirmation modals
	};

	Privileges.addEvents = function () {
		document.querySelector('#save').addEventListener('click', () => {
			throwConfirmModal('save', Privileges.commit);
		});

		document.querySelector('#discard').addEventListener('click', () => {
			throwConfirmModal('discard', Privileges.discard);
		});

		// Expose discard button as necessary
		const containerElement = document.querySelector('.privilege-table-container');
		containerElement.addEventListener('change', e => {
			const subselector = e.target.closest('td[data-privilege] input');
			if (subselector) {
				document.querySelector('#discard').style.display = containerElement.querySelectorAll('td[data-delta]').length > 0 ? 'unset' : 'none';
			}
		});

		const $privTableCon = $('.privilege-table-container');
		$privTableCon.on('click', '[data-action="search.user"]', Privileges.addUserToPrivilegeTable);
		$privTableCon.on('click', '[data-action="search.group"]', Privileges.addGroupToPrivilegeTable);
		$privTableCon.on('click', '[data-action="copyToChildren"]', () => {
			throwConfirmModal('copyToChildren', Privileges.copyPrivilegesToChildren.bind(null, cid, ''));
		});
		$privTableCon.on('click', '[data-action="copyToChildrenGroup"]', function () {
			const groupName = $(this).parents('[data-group-name]').attr('data-group-name');
			throwConfirmModal('copyToChildrenGroup', Privileges.copyPrivilegesToChildren.bind(null, cid, groupName));
		});

		$privTableCon.on('click', '[data-action="copyPrivilegesFrom"]', () => {
			Privileges.copyPrivilegesFromCategory(cid, '');
		});
		$privTableCon.on('click', '[data-action="copyPrivilegesFromGroup"]', function () {
			const groupName = $(this).parents('[data-group-name]').attr('data-group-name');
			Privileges.copyPrivilegesFromCategory(cid, groupName);
		});

		$privTableCon.on('click', '[data-action="copyToAll"]', () => {
			throwConfirmModal('copyToAll', Privileges.copyPrivilegesToAllCategories.bind(null, cid, ''));
		});
		$privTableCon.on('click', '[data-action="copyToAllGroup"]', function () {
			const groupName = $(this).parents('[data-group-name]').attr('data-group-name');
			throwConfirmModal('copyToAllGroup', Privileges.copyPrivilegesToAllCategories.bind(null, cid, groupName));
		});

		$privTableCon.on('click', '.privilege-filters > button', filterPrivileges);

		mousetrap.bind('ctrl+s', event => {
			throwConfirmModal('save', Privileges.commit);
			event.preventDefault();
		});

		function throwConfirmModal(method, onConfirm) {
			const privilegeSubset = getPrivilegeSubset();
			bootbox.confirm(`[[admin/manage/privileges:alert.confirm-${method}, ${privilegeSubset}]]<br /><br />[[admin/manage/privileges:alert.no-undo]]`, ok => {
				if (ok) {
					onConfirm.call();
				}
			});
		}
	};

	Privileges.commit = function () {
		const tableElement = document.querySelector('.privilege-table-container');
		const requests = $.map(tableElement.querySelectorAll('td[data-delta]'), element => {
			const privilege = element.dataset.privilege;
			const rowElement = element.parentNode;
			const member = rowElement.dataset.groupName || rowElement.dataset.uid;
			const state = element.dataset.delta === 'true' ? 1 : 0;

			return Privileges.setPrivilege(member, privilege, state);
		});

		Promise.allSettled(requests).then(results => {
			Privileges.refreshPrivilegeTable();

			const rejects = results.filter(r => r.status === 'rejected');
			if (rejects.length > 0) {
				for (const result of rejects) {
					alerts.error(result.reason);
				}
			} else {
				alerts.success('[[admin/manage/privileges:alert.saved]]');
			}
		});
	};

	Privileges.discard = function () {
		Privileges.refreshPrivilegeTable();
		alerts.success('[[admin/manage/privileges:alert.discarded]]');
	};

	Privileges.refreshPrivilegeTable = function (groupToHighlight) {
		api.get(`/categories/${cid}/privileges`, {}).then(privileges => {
			ajaxify.data.privileges = {...ajaxify.data.privileges, ...privileges};
			const tpl = Number.parseInt(cid, 10) ? 'admin/partials/privileges/category' : 'admin/partials/privileges/global';
			const isAdminPriv = ajaxify.currentPage.endsWith('admin/manage/privileges/admin');
			app.parseAndTranslate(tpl, {privileges, isAdminPriv}).then(html => {
				// Get currently selected filters
				const buttonIndices = $('.privilege-filters button.btn-warning').map((index, element) => $(element).index()).get();
				$('.privilege-table-container').html(html);
				Privileges.exposeAssumedPrivileges();
				for (const [i, con] of document.querySelectorAll('.privilege-filters').entries()) {
					// Three buttons, placed in reverse order
					const lastIndex = $('.privilege-filters').first().find('button').length - 1;
					const index = buttonIndices[i] === undefined ? lastIndex : buttonIndices[i];
					con.querySelectorAll('button')[index].click();
				}

				hightlightRowByDataAttribute('data-group-name', groupToHighlight);
			});
		}).catch(alert.error);
	};

	Privileges.exposeAssumedPrivileges = function () {
		/*
            If registered-users has a privilege enabled, then all users and groups of that privilege
            should be assumed to have that privilege as well, even if not set in the db, so reflect
            this arrangement in the table
        */

		// As such, individual banned users inherits privileges from banned-users group
		const getBannedUsersInputSelector = (privs, i) => `.privilege-table tr[data-banned] td[data-privilege="${privs[i]}"] input`;
		const bannedUsersPrivs = getPrivilegesFromRow('banned-users');
		applyPrivileges(bannedUsersPrivs, getBannedUsersInputSelector);

		// For rest that inherits from registered-users
		const getRegisteredUsersInputSelector = (privs, i) => `.privilege-table tr[data-group-name]:not([data-group-name="registered-users"],[data-group-name="banned-users"],[data-group-name="guests"],[data-group-name="spiders"]) td[data-privilege="${privs[i]}"] input, .privilege-table tr[data-uid]:not([data-banned]) td[data-privilege="${privs[i]}"] input`;
		const registeredUsersPrivs = getPrivilegesFromRow('registered-users');
		applyPrivileges(registeredUsersPrivs, getRegisteredUsersInputSelector);
	};

	Privileges.exposeSingleAssumedPriv = function (columnNo, sourceGroupName) {
		let inputSelectorFunction;
		switch (sourceGroupName) {
			case 'banned-users': {
				inputSelectorFunction = () => `.privilege-table tr[data-banned] td[data-privilege]:nth-child(${columnNo}) input`;
				break;
			}

			default: {
				inputSelectorFunction = () => `.privilege-table tr[data-group-name]:not([data-group-name="registered-users"],[data-group-name="banned-users"],[data-group-name="guests"],[data-group-name="spiders"]) td[data-privilege]:nth-child(${columnNo}) input, .privilege-table tr[data-uid]:not([data-banned]) td[data-privilege]:nth-child(${columnNo}) input`;
			}
		}

		const sourceChecked = getPrivilegeFromColumn(sourceGroupName, columnNo);
		applyPrivilegesToColumn(inputSelectorFunction, sourceChecked);
	};

	Privileges.setPrivilege = (member, privilege, state) => api[state ? 'put' : 'delete'](`/categories/${isNaN(cid) ? 0 : cid}/privileges/${encodeURIComponent(privilege)}`, {member});

	Privileges.addUserToPrivilegeTable = function () {
		const modal = bootbox.dialog({
			title: '[[admin/manage/categories:alert.find-user]]',
			message: '<input class="form-control input-lg" placeholder="[[admin/manage/categories:alert.user-search]]" />',
			show: true,
		});

		modal.on('shown.bs.modal', () => {
			const inputElement = modal.find('input');
			inputElement.focus();

			autocomplete.user(inputElement, (event, ui) => {
				addUserToCategory(ui.item.user, () => {
					modal.modal('hide');
				});
			});
		});
	};

	Privileges.addGroupToPrivilegeTable = function () {
		const modal = bootbox.dialog({
			title: '[[admin/manage/categories:alert.find-group]]',
			message: '<input class="form-control input-lg" placeholder="[[admin/manage/categories:alert.group-search]]" />',
			show: true,
		});

		modal.on('shown.bs.modal', () => {
			const inputElement = modal.find('input');
			inputElement.focus();

			autocomplete.group(inputElement, (event, ui) => {
				if (ui.item.group.name === 'administrators') {
					return alerts.alert({
						type: 'warning',
						message: '[[admin/manage/privileges:alert.admin-warning]]',
					});
				}

				addGroupToCategory(ui.item.group.name, () => {
					modal.modal('hide');
				});
			});
		});
	};

	Privileges.copyPrivilegesToChildren = function (cid, group) {
		const filter = getPrivilegeFilter();
		socket.emit('admin.categories.copyPrivilegesToChildren', {cid, group, filter}, error => {
			if (error) {
				return alerts.error(error.message);
			}

			alerts.success('[[admin/manage/categories:privileges.copy-success]]');
		});
	};

	Privileges.copyPrivilegesFromCategory = function (cid, group) {
		const privilegeSubset = getPrivilegeSubset();
		const message = '<br>'
            + (group ? `[[admin/manage/privileges:alert.copyPrivilegesFromGroup-warning, ${privilegeSubset}]]`
            	: `[[admin/manage/privileges:alert.copyPrivilegesFrom-warning, ${privilegeSubset}]]`)
            + '<br><br>[[admin/manage/privileges:alert.no-undo]]';
		categorySelector.modal({
			title: '[[admin/manage/privileges:alert.copyPrivilegesFrom-title]]',
			message,
			localCategories: [],
			showLinks: true,
			onSubmit(selectedCategory) {
				socket.emit('admin.categories.copyPrivilegesFrom', {
					toCid: cid,
					filter: getPrivilegeFilter(),
					fromCid: selectedCategory.cid,
					group,
				}, error => {
					if (error) {
						return alerts.error(error);
					}

					ajaxify.refresh();
				});
			},
		});
	};

	Privileges.copyPrivilegesToAllCategories = function (cid, group) {
		const filter = getPrivilegeFilter();
		socket.emit('admin.categories.copyPrivilegesToAllCategories', {cid, group, filter}, error => {
			if (error) {
				return alerts.error(error);
			}

			alerts.success('[[admin/manage/categories:privileges.copy-success]]');
		});
	};

	function getPrivilegesFromRow(sourceGroupName) {
		const privs = [];
		$(`.privilege-table tr[data-group-name="${sourceGroupName}"] td input[type="checkbox"]:not(.checkbox-helper)`)
			.parent()
			.each((index, element) => {
				if ($(element).find('input').prop('checked')) {
					privs.push(element.dataset.privilege);
				}
			});

		// Also apply to non-group privileges
		return privs.concat(privs.map(priv => {
			if (priv.startsWith('groups:')) {
				return priv.slice(7);
			}

			return false;
		})).filter(Boolean);
	}

	function getPrivilegeFromColumn(sourceGroupName, columnNo) {
		return $(`.privilege-table tr[data-group-name="${sourceGroupName}"] td:nth-child(${columnNo}) input[type="checkbox"]`)[0].checked;
	}

	function applyPrivileges(privs, inputSelectorFunction) {
		for (let x = 0, numberPrivs = privs.length; x < numberPrivs; x += 1) {
			const inputs = $(inputSelectorFunction(privs, x));
			inputs.each((index, element) => {
				if (!element.checked) {
					element.indeterminate = true;
				}
			});
		}
	}

	function applyPrivilegesToColumn(inputSelectorFunction, sourceChecked) {
		const $inputs = $(inputSelectorFunction());
		$inputs.each((index, element) => {
			element.indeterminate = element.checked ? false : sourceChecked;
		});
	}

	function hightlightRowByDataAttribute(attributeName, attributeValue) {
		if (attributeValue) {
			const $element = $('[' + attributeName + ']').filter(function () {
				return $(this).attr(attributeName) === String(attributeValue);
			});

			if ($element.length > 0) {
				$element.addClass('selected');
				return true;
			}
		}

		return false;
	}

	function highlightRow() {
		if (ajaxify.data.group) {
			if (hightlightRowByDataAttribute('data-group-name', ajaxify.data.group)) {
				return;
			}

			addGroupToCategory(ajaxify.data.group);
		}
	}

	function addGroupToCategory(group, callback) {
		callback ||= function () {};
		const groupRow = document.querySelector('.privilege-table [data-group-name="' + group + '"]');
		if (groupRow) {
			hightlightRowByDataAttribute('data-group-name', group);
			return callback();
		}

		// Generate data for new row
		const privilegeSet = ajaxify.data.privileges.keys.groups.reduce((memo, current) => {
			memo[current] = false;
			return memo;
		}, {});

		app.parseAndTranslate('admin/partials/privileges/' + ((isNaN(cid) || cid === 0) ? 'global' : 'category'), 'privileges.groups', {
			privileges: {
				groups: [
					{
						name: group,
						nameEscaped: translator.escape(group),
						privileges: privilegeSet,
					},
				],
			},
		}, html => {
			const tbodyElement = document.querySelector('.privilege-table tbody');
			const buttonIndex = $('.privilege-filters').first().find('button.btn-warning').index();
			tbodyElement.append(html.get(0));
			Privileges.exposeAssumedPrivileges();
			hightlightRowByDataAttribute('data-group-name', group);
			document.querySelector('.privilege-filters').querySelectorAll('button')[buttonIndex].click();
			callback();
		});
	}

	async function addUserToCategory(user, callback) {
		callback ||= function () {};
		const userRow = document.querySelector('.privilege-table [data-uid="' + user.uid + '"]');
		if (userRow) {
			hightlightRowByDataAttribute('data-uid', user.uid);
			return callback();
		}

		// Generate data for new row
		const privilegeSet = ajaxify.data.privileges.keys.users.reduce((memo, current) => {
			memo[current] = false;
			return memo;
		}, {});

		const html = await app.parseAndTranslate('admin/partials/privileges/' + (isNaN(cid) ? 'global' : 'category'), 'privileges.users', {
			privileges: {
				users: [
					{
						picture: user.picture,
						username: user.username,
						banned: user.banned,
						uid: user.uid,
						'icon:text': user['icon:text'],
						'icon:bgColor': user['icon:bgColor'],
						privileges: privilegeSet,
					},
				],
			},
		});

		const tbodyElement = document.querySelectorAll('.privilege-table tbody');
		const buttonIndex = $('.privilege-filters').last().find('button.btn-warning').index();
		tbodyElement[1].append(html.get(0));
		Privileges.exposeAssumedPrivileges();
		hightlightRowByDataAttribute('data-uid', user.uid);
		document.querySelectorAll('.privilege-filters')[1].querySelectorAll('button')[buttonIndex].click();
		callback();
	}

	function filterPrivileges(event) {
		const [startIndex, endIndex] = event.target.dataset.filter.split(',').map(i => Number.parseInt(i, 10));
		const rows = $(event.target).closest('table')[0].querySelectorAll('thead tr:last-child, tbody tr ');
		for (const tr of rows) {
			for (const [index, element] of tr.querySelectorAll('td, th').entries()) {
				const offset = element.tagName.toUpperCase() === 'TH' ? 1 : 0;
				if (index < (SKIP_PRIV_COLS - offset)) {
					continue;
				}

				element.classList.toggle('hidden', !(index >= (startIndex - offset) && index <= (endIndex - offset)));
			}
		}

		checkboxRowSelector.updateAll();
		for (const button of $(event.target).siblings('button').toArray()) {
			button.classList.remove('btn-warning');
		}

		event.target.classList.add('btn-warning');
	}

	function getPrivilegeFilter() {
		const indices = document.querySelector('.privilege-filters .btn-warning').dataset.filter
			.split(',')
			.map(i => Number.parseInt(i, 10));
		indices[0] -= SKIP_PRIV_COLS;
		indices[1] = indices[1] - SKIP_PRIV_COLS + 1;
		return indices;
	}

	function getPrivilegeSubset() {
		const currentPrivFilter = document.querySelector('.privilege-filters .btn-warning');
		const filterText = currentPrivFilter ? currentPrivFilter.textContent.toLocaleLowerCase() : '';
		return filterText.includes('privileges') ? filterText : `${filterText} privileges`.trim();
	}

	return Privileges;
});
