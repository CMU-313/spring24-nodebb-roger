'use strict';

define('forum/flags/list', [
	'components', 'Chart', 'categoryFilter', 'autocomplete', 'api', 'alerts',
], (components, Chart, categoryFilter, autocomplete, api, alerts) => {
	const Flags = {};

	let selectedCids;

	Flags.init = function () {
		Flags.enableFilterForm();
		Flags.enableCheckboxes();
		Flags.handleBulkActions();

		selectedCids = [];
		if (ajaxify.data.filters.hasOwnProperty('cid')) {
			selectedCids = Array.isArray(ajaxify.data.filters.cid)
				? ajaxify.data.filters.cid : [ajaxify.data.filters.cid];
		}

		categoryFilter.init($('[component="category/dropdown"]'), {
			privilege: 'moderate',
			selectedCids,
			onHidden(data) {
				selectedCids = data.selectedCids;
			},
		});

		components.get('flags/list')
			.on('click', '[data-flag-id]', function (e) {
				if (['BUTTON', 'A'].includes(e.target.nodeName)) {
					return;
				}

				const flagId = this.dataset.flagId;
				ajaxify.go('flags/' + flagId);
			});

		$('#flags-daily-wrapper').one('shown.bs.collapse', () => {
			Flags.handleGraphs();
		});

		autocomplete.user($('#filter-assignee, #filter-targetUid, #filter-reporterId'), (event, ui) => {
			setTimeout(() => {
				event.target.value = ui.item.user.uid;
			});
		});
	};

	Flags.enableFilterForm = function () {
		const $filtersElement = components.get('flags/filters');

		// Parse ajaxify data to set form values to reflect current filters
		for (const filter in ajaxify.data.filters) {
			if (ajaxify.data.filters.hasOwnProperty(filter)) {
				$filtersElement.find('[name="' + filter + '"]').val(ajaxify.data.filters[filter]);
			}
		}

		$filtersElement.find('[name="sort"]').val(ajaxify.data.sort);

		document.querySelector('#apply-filters').addEventListener('click', () => {
			const payload = $filtersElement.serializeArray();
			// Cid is special comes from categoryFilter module
			for (const cid of selectedCids) {
				payload.push({name: 'cid', value: cid});
			}

			ajaxify.go('flags?' + (payload.length > 0 ? $.param(payload) : 'reset=1'));
		});

		$filtersElement.find('button[data-target="#more-filters"]').click(event => {
			const textVariant = event.target.dataset.textVariant;
			if (!textVariant) {
				return;
			}

			event.target.dataset.textVariant = event.target.textContent;
			event.target.firstChild.textContent = textVariant;
		});
	};

	Flags.enableCheckboxes = function () {
		const flagsList = document.querySelector('[component="flags/list"]');
		const checkboxes = flagsList.querySelectorAll('[data-flag-id] input[type="checkbox"]');
		const bulkElement = document.querySelector('[component="flags/bulk-actions"] button');
		let lastClicked;

		document.querySelector('[data-action="toggle-all"]').addEventListener('click', function () {
			const state = this.checked;

			for (const element of checkboxes) {
				element.checked = state;
			}

			bulkElement.disabled = !state;
		});

		flagsList.addEventListener('click', e => {
			const subselector = e.target.closest('input[type="checkbox"]');
			if (subselector) {
				// Stop checkbox clicks from going into the flag details
				e.stopImmediatePropagation();

				if (lastClicked && e.shiftKey && lastClicked !== subselector) {
					// Select all the checkboxes in between
					const state = subselector.checked;
					let started = false;

					for (const element of checkboxes) {
						if ([subselector, lastClicked].includes(element)) {
							started = !started;
						}

						if (started) {
							element.checked = state;
						}
					}
				}

				// (De)activate bulk actions button based on checkboxes' state
				bulkElement.disabled = !Array.prototype.some.call(checkboxes, element => element.checked);

				lastClicked = subselector;
			}

			// If you miss the checkbox, don't descend into the flag details, either
			if (e.target.querySelector('input[type="checkbox"]')) {
				e.stopImmediatePropagation();
			}
		});
	};

	Flags.handleBulkActions = function () {
		document.querySelector('[component="flags/bulk-actions"]').addEventListener('click', e => {
			const subselector = e.target.closest('[data-action]');
			if (subselector) {
				const action = subselector.dataset.action;
				const flagIds = Flags.getSelected();
				const promises = flagIds.map(flagId => {
					const data = {};
					if (action === 'bulk-assign') {
						data.assignee = app.user.uid;
					} else if (action === 'bulk-mark-resolved') {
						data.state = 'resolved';
					}

					return api.put(`/flags/${flagId}`, data);
				});

				Promise.allSettled(promises).then(results => {
					const fulfilled = results.filter(res => res.status === 'fulfilled').length;
					const errors = results.filter(res => res.status === 'rejected');
					if (fulfilled) {
						alerts.success('[[flags:bulk-success, ' + fulfilled + ']]');
						ajaxify.refresh();
					}

					for (const res of errors) {
						alerts.error(res.reason);
					}
				});
			}
		});
	};

	Flags.getSelected = function () {
		const checkboxes = document.querySelectorAll('[component="flags/list"] [data-flag-id] input[type="checkbox"]');
		const payload = [];
		for (const element of checkboxes) {
			if (element.checked) {
				payload.push(element.closest('[data-flag-id]').dataset.flagId);
			}
		}

		return payload;
	};

	Flags.handleGraphs = function () {
		const dailyCanvas = document.querySelector('#flags:daily');
		const dailyLabels = utils.getDaysArray().map((text, index) => index % 3 ? '' : text);

		if (utils.isMobile()) {
			Chart.defaults.global.tooltips.enabled = false;
		}

		const data = {
			'flags:daily': {
				labels: dailyLabels,
				datasets: [
					{
						label: '',
						backgroundColor: 'rgba(151,187,205,0.2)',
						borderColor: 'rgba(151,187,205,1)',
						pointBackgroundColor: 'rgba(151,187,205,1)',
						pointHoverBackgroundColor: '#fff',
						pointBorderColor: '#fff',
						pointHoverBorderColor: 'rgba(151,187,205,1)',
						data: ajaxify.data.analytics,
					},
				],
			},
		};

		dailyCanvas.width = $(dailyCanvas).parent().width();
		new Chart(dailyCanvas.getContext('2d'), {
			type: 'line',
			data: data['flags:daily'],
			options: {
				responsive: true,
				animation: false,
				legend: {
					display: false,
				},
				scales: {
					yAxes: [{
						ticks: {
							beginAtZero: true,
							precision: 0,
						},
					}],
				},
			},
		});
	};

	return Flags;
});
