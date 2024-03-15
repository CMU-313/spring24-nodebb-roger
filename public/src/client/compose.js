'use strict';

define('forum/compose', ['hooks'], hooks => {
	const Compose = {};

	Compose.init = function () {
		const container = $('.composer');

		if (container.length > 0) {
			hooks.fire('action:composer.enhance', {
				container,
			});
		}
	};

	return Compose;
});
