'use strict';

define('settings/select', () => {
	let Settings = null;

	function addOptions(element, options) {
		for (const optionData of options) {
			const value = optionData.text || optionData.value;
			delete optionData.text;
			element.append($(Settings.helper.createElement('option', optionData)).text(value));
		}
	}

	const SettingsSelect = {
		types: ['select'],
		use() {
			Settings = this;
		},
		create(ignore, ignored, data) {
			const element = $(Settings.helper.createElement('select'));
			// Prevent data-options from being attached to DOM
			addOptions(element, data['data-options']);
			delete data['data-options'];
			return element;
		},
		init(element) {
			const options = element.data('options');
			if (options != null) {
				addOptions(element, options);
			}
		},
		set(element, value) {
			element.val(value || '');
		},
		get(element, ignored, empty) {
			const value = element.val();
			if (empty || value) {
				return value;
			}
		},
	};

	return SettingsSelect;
});
