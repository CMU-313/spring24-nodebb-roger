'use strict';

define('admin/advanced/events', ['bootbox', 'alerts'], (bootbox, alerts) => {
	const Events = {};

	Events.init = function () {
		$('[data-action="clear"]').on('click', () => {
			bootbox.confirm('[[admin/advanced/events:confirm-delete-all-events]]', confirm => {
				if (confirm) {
					socket.emit('admin.deleteAllEvents', error => {
						if (error) {
							return alerts.error(error);
						}

						$('.events-list').empty();
					});
				}
			});
		});

		$('.delete-event').on('click', function () {
			const $parentElement = $(this).parents('[data-eid]');
			const eid = $parentElement.attr('data-eid');
			socket.emit('admin.deleteEvents', [eid], error => {
				if (error) {
					return alerts.error(error);
				}

				$parentElement.remove();
			});
		});

		$('#apply').on('click', Events.refresh);
	};

	Events.refresh = function (event) {
		event.preventDefault();

		const $formElement = $('#filters');
		ajaxify.go('admin/advanced/events?' + $formElement.serialize());
	};

	return Events;
});
