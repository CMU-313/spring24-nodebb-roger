'use strict';

define('admin/settings/general', ['admin/settings'], () => {
	const Module = {};

	Module.init = function () {
		$('button[data-action="removeLogo"]').on('click', () => {
			$('input[data-field="brand:logo"]').val('');
		});
		$('button[data-action="removeFavicon"]').on('click', () => {
			$('input[data-field="brand:favicon"]').val('');
		});
		$('button[data-action="removeTouchIcon"]').on('click', () => {
			$('input[data-field="brand:touchIcon"]').val('');
		});
		$('button[data-action="removeMaskableIcon"]').on('click', () => {
			$('input[data-field="brand:maskableIcon"]').val('');
		});
		$('button[data-action="removeOgImage"]').on('click', () => {
			$('input[data-field="removeOgImage"]').val('');
		});
	};

	return Module;
});
