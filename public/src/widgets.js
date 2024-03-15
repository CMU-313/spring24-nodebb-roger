'use strict';

module.exports.render = function (template) {
	if (template.startsWith('admin')) {
		return;
	}

	const locations = Object.keys(ajaxify.data.widgets);

	for (const location of locations) {
		let area = $('#content [widget-area="' + location + '"],#content [data-widget-area="' + location + '"]').eq(0);
		if (area.length > 0) {
			continue;
		}

		const widgetsAtLocation = ajaxify.data.widgets[location] || [];
		let html = '';

		for (const widget of widgetsAtLocation) {
			html += widget.html;
		}

		if (location === 'footer' && $('#content [widget-area="footer"],#content [data-widget-area="footer"]').length === 0) {
			$('#content').append($('<div class="row"><div data-widget-area="footer" class="col-xs-12"></div></div>'));
		} else if (location === 'sidebar' && $('#content [widget-area="sidebar"],#content [data-widget-area="sidebar"]').length === 0) {
			if ($('[component="account/cover"]').length > 0) {
				$('[component="account/cover"]').nextAll().wrapAll($('<div class="row"><div class="col-lg-9 col-xs-12"></div><div data-widget-area="sidebar" class="col-lg-3 col-xs-12"></div></div></div>'));
			} else if ($('[component="groups/cover"]').length > 0) {
				$('[component="groups/cover"]').nextAll().wrapAll($('<div class="row"><div class="col-lg-9 col-xs-12"></div><div data-widget-area="sidebar" class="col-lg-3 col-xs-12"></div></div></div>'));
			} else {
				$('#content > *').wrapAll($('<div class="row"><div class="col-lg-9 col-xs-12"></div><div data-widget-area="sidebar" class="col-lg-3 col-xs-12"></div></div></div>'));
			}
		} else if (location === 'header' && $('#content [widget-area="header"],#content [data-widget-area="header"]').length === 0) {
			$('#content').prepend($('<div class="row"><div data-widget-area="header" class="col-xs-12"></div></div>'));
		}

		area = $('#content [widget-area="' + location + '"],#content [data-widget-area="' + location + '"]').eq(0);
		if (html && area.length > 0) {
			area.html(html);
			area.find('img:not(.not-responsive)').addClass('img-responsive');
		}

		if (widgetsAtLocation.length > 0) {
			area.removeClass('hidden');
		}
	}

	require(['hooks'], hooks => {
		hooks.fire('action:widgets.loaded', {});
	});
};

