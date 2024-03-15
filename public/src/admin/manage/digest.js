'use strict';

define('admin/manage/digest', ['bootbox', 'alerts'], (bootbox, alerts) => {
	const Digest = {};

	Digest.init = function () {
		$('table').on('click', '[data-action]', function () {
			const action = this.dataset.action;
			const uid = this.dataset.uid;

			if (action.startsWith('resend-')) {
				const interval = action.slice(7);
				bootbox.confirm('[[admin/manage/digest:resend-all-confirm]]', ok => {
					if (ok) {
						Digest.send(action, undefined, error => {
							if (error) {
								return alerts.error(error);
							}

							alerts.success('[[admin/manage/digest:resent-' + interval + ']]');
						});
					}
				});
			} else {
				Digest.send(action, uid, error => {
					if (error) {
						return alerts.error(error);
					}

					alerts.success('[[admin/manage/digest:resent-single]]');
				});
			}
		});
	};

	Digest.send = function (action, uid, callback) {
		socket.emit('admin.digest.resend', {
			action,
			uid,
		}, callback);
	};

	return Digest;
});
