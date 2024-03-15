'use strict';

define('topicThumbs', [
	'api', 'bootbox', 'alerts', 'uploader', 'benchpress', 'translator', 'jquery-ui/widgets/sortable',
], (api, bootbox, alerts, uploader, Benchpress, translator) => {
	const Thumbs = {};

	Thumbs.get = id => api.get(`/topics/${id}/thumbs`, {});

	Thumbs.getByPid = pid => api.get(`/posts/${pid}`, {}).then(post => Thumbs.get(post.tid));

	Thumbs.delete = (id, path) => api.del(`/topics/${id}/thumbs`, {
		path,
	});

	Thumbs.deleteAll = id => {
		Thumbs.get(id).then(thumbs => {
			Promise.all(thumbs.map(thumb => Thumbs.delete(id, thumb.url)));
		});
	};

	Thumbs.upload = id => new Promise(resolve => {
		uploader.show({
			title: '[[topic:composer.thumb_title]]',
			method: 'put',
			route: config.relative_path + `/api/v3/topics/${id}/thumbs`,
		}, url => {
			resolve(url);
		});
	});

	Thumbs.modal = {};

	Thumbs.modal.open = function (payload) {
		const {id, pid} = payload;
		let {modal} = payload;
		let numberThumbs;

		return new Promise(resolve => {
			Promise.all([
				Thumbs.get(id),
				pid ? Thumbs.getByPid(pid) : [],
			]).then(results => new Promise(resolve => {
				const thumbs = results.reduce((memo, current) => memo.concat(current));
				numberThumbs = thumbs.length;

				resolve(thumbs);
			})).then(thumbs => Benchpress.render('modals/topic-thumbs', {thumbs})).then(html => {
				if (modal) {
					translator.translate(html, translated => {
						modal.find('.bootbox-body').html(translated);
						Thumbs.modal.handleSort({modal, numThumbs: numberThumbs});
					});
				} else {
					modal = bootbox.dialog({
						title: '[[modules:thumbs.modal.title]]',
						message: html,
						buttons: {
							add: {
								label: '<i class="fa fa-plus"></i> [[modules:thumbs.modal.add]]',
								className: 'btn-success',
								callback() {
									Thumbs.upload(id).then(() => {
										Thumbs.modal.open({...payload, modal});
										require(['composer'], composer => {
											composer.updateThumbCount(id, $(`[component="composer"][data-uuid="${id}"]`));
											resolve();
										});
									});
									return false;
								},
							},
							close: {
								label: '[[global:close]]',
								className: 'btn-primary',
							},
						},
					});
					Thumbs.modal.handleDelete({...payload, modal});
					Thumbs.modal.handleSort({modal, numThumbs: numberThumbs});
				}
			});
		});
	};

	Thumbs.modal.handleDelete = payload => {
		const modalElement = payload.modal.get(0);

		modalElement.addEventListener('click', event => {
			if (event.target.closest('button[data-action="remove"]')) {
				bootbox.confirm('[[modules:thumbs.modal.confirm-remove]]', ok => {
					if (!ok) {
						return;
					}

					const id = event.target.closest('.media[data-id]').dataset.id;
					const path = event.target.closest('.media[data-path]').dataset.path;
					api.del(`/topics/${id}/thumbs`, {
						path,
					}).then(() => {
						Thumbs.modal.open(payload);
					}).catch(alerts.error);
				});
			}
		});
	};

	Thumbs.modal.handleSort = ({modal, numThumbs}) => {
		if (numThumbs > 1) {
			const selectorElement = modal.find('.topic-thumbs-modal');
			selectorElement.sortable({
				items: '[data-id]',
			});
			selectorElement.on('sortupdate', Thumbs.modal.handleSortChange);
		}
	};

	Thumbs.modal.handleSortChange = (event, ui) => {
		const items = ui.item.get(0).parentNode.querySelectorAll('[data-id]');
		for (const [order, element] of Array.from(items).entries()) {
			const id = element.dataset.id;
			let path = element.dataset.path;
			path = path.replace(new RegExp(`^${config.upload_url}`), '');

			api.put(`/topics/${id}/thumbs/order`, {path, order}).catch(alerts.error);
		}
	};

	return Thumbs;
});
