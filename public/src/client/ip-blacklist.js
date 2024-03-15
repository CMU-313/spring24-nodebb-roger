'use strict';

define('forum/ip-blacklist', ['Chart', 'benchpress', 'bootbox', 'alerts'], (Chart, Benchpress, bootbox, alerts) => {
	const Exclude = {};

	Exclude.init = function () {
		const exclude = $('#blacklist-rules');

		exclude.on('keyup', () => {
			$('#blacklist-rules-holder').val(exclude.val());
		});

		$('[data-action="apply"]').on('click', () => {
			socket.emit('blacklist.save', exclude.val(), error => {
				if (error) {
					return alerts.error(error);
				}

				alerts.alert({
					type: 'success',
					alert_id: 'blacklist-saved',
					title: '[[ip-blacklist:alerts.applied-success]]',
				});
			});
		});

		$('[data-action="test"]').on('click', () => {
			socket.emit('blacklist.validate', {
				rules: exclude.val(),
			}, (error, data) => {
				if (error) {
					return alerts.error(error);
				}

				Benchpress.render('admin/partials/blacklist-validate', data).then(html => {
					bootbox.alert(html);
				});
			});
		});

		Exclude.setupAnalytics();
	};

	Exclude.setupAnalytics = function () {
		const hourlyCanvas = document.querySelector('#blacklist:hourly');
		const dailyCanvas = document.querySelector('#blacklist:daily');
		const hourlyLabels = utils.getHoursArray().map((text, index) => index % 3 ? '' : text);
		const dailyLabels = utils.getDaysArray().slice(-7).map((text, index) => index % 3 ? '' : text);

		if (utils.isMobile()) {
			Chart.defaults.global.tooltips.enabled = false;
		}

		const data = {
			'blacklist:hourly': {
				labels: hourlyLabels,
				datasets: [
					{
						label: '',
						backgroundColor: 'rgba(186,139,175,0.2)',
						borderColor: 'rgba(186,139,175,1)',
						pointBackgroundColor: 'rgba(186,139,175,1)',
						pointHoverBackgroundColor: '#fff',
						pointBorderColor: '#fff',
						pointHoverBorderColor: 'rgba(186,139,175,1)',
						data: ajaxify.data.analytics.hourly,
					},
				],
			},
			'blacklist:daily': {
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
						data: ajaxify.data.analytics.daily,
					},
				],
			},
		};

		hourlyCanvas.width = $(hourlyCanvas).parent().width();
		dailyCanvas.width = $(dailyCanvas).parent().width();

		new Chart(hourlyCanvas.getContext('2d'), {
			type: 'line',
			data: data['blacklist:hourly'],
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
						},
					}],
				},
			},
		});

		new Chart(dailyCanvas.getContext('2d'), {
			type: 'line',
			data: data['blacklist:daily'],
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
						},
					}],
				},
			},
		});
	};

	return Exclude;
});
