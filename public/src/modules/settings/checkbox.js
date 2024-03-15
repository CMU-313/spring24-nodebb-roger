'use strict';

define('settings/checkbox', () => {
	let Settings = null;

	const SettingsCheckbox = {
		types: ['checkbox'],
		use() {
			Settings = this;
		},
		create() {
			return Settings.helper.createElement('input', {
				type: 'checkbox',
			});
		},
		set(element, value) {
			element.prop('checked', value);
			element.closest('.mdl-switch').toggleClass('is-checked', element.is(':checked'));
		},
		get(element, trim, empty) {
			const value = element.prop('checked');
			if (value == null) {
				return;
			}

			if (!empty) {
				if (value) {
					return value;
				}

				return;
			}

			if (trim) {
				return value ? 1 : 0;
			}

			return value;
		},
	};

	return SettingsCheckbox;
});
