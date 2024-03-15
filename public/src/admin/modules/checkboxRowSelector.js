'use strict';

define('admin/modules/checkboxRowSelector', () => {
	const self = {};
	let $tableContainer;

	self.toggling = false;

	self.init = function (tableCssSelector) {
		$tableContainer = $(tableCssSelector);
		$tableContainer.on('change', 'input.checkbox-helper', handleChange);
	};

	self.updateAll = function () {
		$tableContainer.find('input.checkbox-helper').each((index, element) => {
			self.updateState($(element));
		});
	};

	self.updateState = function ($checkboxElement) {
		if (self.toggling) {
			return;
		}

		const checkboxes = $checkboxElement.closest('tr').find('input:not([disabled]):visible').toArray();
		const $toggler = $(checkboxes.shift());
		const rowState = checkboxes.length && checkboxes.every(element => element.checked);
		$toggler.prop('checked', rowState);
	};

	function handleChange(event) {
		const $checkboxElement = $(event.target);
		toggleAll($checkboxElement);
	}

	function toggleAll($checkboxElement) {
		self.toggling = true;
		const state = $checkboxElement.prop('checked');
		$checkboxElement.closest('tr').find('input:not(.checkbox-helper):visible').each((index, element) => {
			const $checkbox = $(element);
			if ($checkbox.prop('checked') === state) {
				return;
			}

			$checkbox.click();
		});
		self.toggling = false;
	}

	return self;
});
