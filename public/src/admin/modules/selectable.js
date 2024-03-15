'use strict';

define('admin/modules/selectable', [
	'jquery-ui/widgets/selectable',
], () => {
	const selectable = {};

	selectable.enable = function (containerElement, targets) {
		$(containerElement).selectable({
			filter: targets,
		});
	};

	return selectable;
});
