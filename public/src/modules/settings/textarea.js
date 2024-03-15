'use strict';

define('settings/textarea', () => {
	let Settings = null;

	const SettingsArea = {
		types: ['textarea'],
		use() {
			Settings = this;
		},
		create() {
			return Settings.helper.createElement('textarea');
		},
		set(element, value, trim) {
			if (trim && value != null && typeof value.trim === 'function') {
				value = value.trim();
			}

			element.val(value || '');
		},
		get(element, trim, empty) {
			let value = element.val();
			if (trim) {
				value = value == null ? undefined : value.trim();
			}

			if (empty || value) {
				return value;
			}
		},
	};

	return SettingsArea;
});
