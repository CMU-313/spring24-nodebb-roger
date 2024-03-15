'use strict';

// TODO: no longer used remove in 1.19.0
define('admin/modules/colorpicker', () => {
	const colorpicker = {};

	colorpicker.enable = function (inputElement, callback) {
		(inputElement instanceof jQuery ? inputElement : $(inputElement)).each(function () {
			const $this = $(this);

			$this.ColorPicker({
				color: $this.val() || '#000',
				onChange(hsb, hex) {
					$this.val('#' + hex);
					if (typeof callback === 'function') {
						callback(hsb, hex);
					}
				},
				onShow(colpkr) {
					$(colpkr).css('z-index', 1051);
				},
			});

			$(window).one('action:ajaxify.start', () => {
				$this.ColorPickerHide();
			});
		});
	};

	return colorpicker;
});
