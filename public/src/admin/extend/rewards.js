'use strict';

define('admin/extend/rewards', ['alerts'], alerts => {
	const rewards = {};

	let available;
	let active;
	let conditions;
	let conditionals;

	rewards.init = function () {
		available = ajaxify.data.rewards;
		active = ajaxify.data.active;
		conditions = ajaxify.data.conditions;
		conditionals = ajaxify.data.conditionals;

		$('[data-selected]').each(function () {
			select($(this));
		});

		$('#active')
			.on('change', '[data-selected]', function () {
				update($(this));
			})
			.on('click', '.delete', function () {
				const parent = $(this).parents('[data-id]');
				const id = parent.attr('data-id');

				socket.emit('admin.rewards.delete', {id}, error => {
					if (error) {
						alerts.error(error);
					} else {
						alerts.success('[[admin/extend/rewards:alert.delete-success]]');
					}
				});

				parent.remove();
				return false;
			})
			.on('click', '.toggle', function () {
				const button = $(this);
				const disabled = button.hasClass('btn-success');
				button.toggleClass('btn-warning').toggleClass('btn-success').translateHtml('[[admin/extend/rewards:' + (disabled ? 'disable' : 'enable') + ']]');
				// Send disable api call
				return false;
			});

		$('#new').on('click', newReward);
		$('#save').on('click', saveRewards);

		populateInputs();
	};

	function select(element) {
		element.val(element.attr('data-selected'));
		switch (element.attr('name')) {
			case 'rid': {
				selectReward(element);
				break;
			}
		}
	}

	function update(element) {
		element.attr('data-selected', element.val());
		switch (element.attr('name')) {
			case 'rid': {
				selectReward(element);
				break;
			}
		}
	}

	function selectReward(element) {
		const parent = element.parents('[data-rid]');
		const div = parent.find('.inputs');
		let inputs;
		let html = '';

		for (const reward in available) {
			if (available.hasOwnProperty(reward) && available[reward].rid === element.attr('data-selected')) {
				inputs = available[reward].inputs;
				parent.attr('data-rid', available[reward].rid);
				break;
			}
		}

		if (!inputs) {
			return alerts.error('[[admin/extend/rewards:alert.no-inputs-found]] ' + element.attr('data-selected'));
		}

		for (const input of inputs) {
			html += '<label for="' + input.name + '">' + input.label + '<br />';
			switch (input.type) {
				case 'select': {
					html += '<select class="form-control" name="' + input.name + '">';
					for (const value of input.values) {
						html += '<option value="' + value.value + '">' + value.name + '</option>';
					}

					break;
				}

				case 'text': {
					html += '<input type="text" class="form-control" name="' + input.name + '" />';
					break;
				}
			}

			html += '</label><br />';
		}

		div.html(html);
	}

	function populateInputs() {
		$('[data-rid]').each(function (i) {
			const div = $(this).find('.inputs');
			const rewards = active[i].rewards;

			for (const reward in rewards) {
				if (rewards.hasOwnProperty(reward)) {
					div.find('[name="' + reward + '"]').val(rewards[reward]);
				}
			}
		});
	}

	function newReward() {
		const ul = $('#active');

		const data = {
			active: [{
				disabled: true,
				value: '',
				claimable: 1,
				rid: null,
				id: null,
			}],
			conditions,
			conditionals,
			rewards: available,
		};

		app.parseAndTranslate('admin/extend/rewards', 'active', data, li => {
			ul.append(li);
			li.find('select').val('');
		});
	}

	function saveRewards() {
		const activeRewards = [];

		$('#active li').each(function () {
			const data = {rewards: {}};
			const main = $(this).find('form.main').serializeArray();
			const rewards = $(this).find('form.rewards').serializeArray();

			for (const object of main) {
				data[object.name] = object.value;
			}

			for (const object of rewards) {
				data.rewards[object.name] = object.value;
			}

			data.id = $(this).attr('data-id');
			data.disabled = $(this).find('.toggle').hasClass('btn-success');

			activeRewards.push(data);
		});

		socket.emit('admin.rewards.save', activeRewards, (error, result) => {
			if (error) {
				alerts.error(error);
			} else {
				alerts.success('[[admin/extend/rewards:alert.save-success]]');
				// Newly added rewards are missing data-id, update to prevent rewards getting duplicated
				$('#active li').each(function (index) {
					if (!$(this).attr('data-id')) {
						$(this).attr('data-id', result[index].id);
					}
				});
			}
		});
	}

	return rewards;
});
