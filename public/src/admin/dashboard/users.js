'use strict';

define('admin/dashboard/users', ['admin/modules/dashboard-line-graph', 'hooks'], (graph, hooks) => {
	const ACP = {};

	ACP.init = () => {
		graph.init({
			set: 'registrations',
			dataset: ajaxify.data.dataset,
		}).then(() => {
			hooks.onPage('action:admin.dashboard.updateGraph', ACP.updateTable);
		});
	};

	ACP.updateTable = () => {
		if (window.fetch) {
			fetch(`${config.relative_path}/api${ajaxify.data.url}${window.location.search}`, {credentials: 'include'}).then(response => {
				if (response.ok) {
					response.json().then(payload => {
						app.parseAndTranslate(ajaxify.data.template.name, 'users', payload, html => {
							const tbodyElement = document.querySelector('.users-list tbody');
							tbodyElement.innerHTML = '';
							tbodyElement.append(...html.map((index, element) => element));

							html.find('.timeago').timeago();
						});
					});
				}
			});
		}
	};

	return ACP;
});
