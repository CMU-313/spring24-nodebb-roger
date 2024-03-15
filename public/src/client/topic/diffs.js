'use strict';

define('forum/topic/diffs', ['api', 'bootbox', 'alerts', 'forum/topic/images'], (api, bootbox, alerts) => {
	const Diffs = {};
	const localeStringOptions = {
		year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric',
	};

	Diffs.open = function (pid) {
		if (!config.enablePostHistory) {
			return;
		}

		api.get(`/posts/${pid}/diffs`, {}).then(data => {
			parsePostHistory(data).then($html => {
				const $modal = bootbox.dialog({title: '[[topic:diffs.title]]', message: $html, size: 'large'});

				if (data.timestamps.length === 0) {
					return;
				}

				const $selectElement = $modal.find('select');
				const $revertElement = $modal.find('button[data-action="restore"]');
				const $deleteElement = $modal.find('button[data-action="delete"]');
				const $postContainer = $modal.find('ul.posts-list');
				const $numberOfDiffCon = $modal.find('.number-of-diffs strong');

				$selectElement.on('change', function () {
					Diffs.load(pid, this.value, $postContainer);
					$revertElement.prop('disabled', data.timestamps.indexOf(this.value) === 0);
					$deleteElement.prop('disabled', data.timestamps.indexOf(this.value) === 0);
				});

				$revertElement.on('click', () => {
					Diffs.restore(pid, $selectElement.val(), $modal);
				});

				$deleteElement.on('click', () => {
					Diffs.delete(pid, $selectElement.val(), $selectElement, $numberOfDiffCon);
				});

				$modal.on('shown.bs.modal', () => {
					Diffs.load(pid, $selectElement.val(), $postContainer);
					$revertElement.prop('disabled', true);
					$deleteElement.prop('disabled', true);
				});
			});
		}).catch(alerts.error);
	};

	Diffs.load = function (pid, since, $postContainer) {
		if (!config.enablePostHistory) {
			return;
		}

		api.get(`/posts/${pid}/diffs/${since}`, {}).then(data => {
			data.deleted = Boolean(Number.parseInt(data.deleted, 10));

			app.parseAndTranslate('partials/posts_list', 'posts', {
				posts: [data],
			}, $html => {
				$postContainer.empty().append($html);
				$postContainer.find('.timeago').timeago();
			});
		}).catch(alerts.error);
	};

	Diffs.restore = function (pid, since, $modal) {
		if (!config.enablePostHistory) {
			return;
		}

		api.put(`/posts/${pid}/diffs/${since}`, {}).then(() => {
			$modal.modal('hide');
			alerts.success('[[topic:diffs.post-restored]]');
		}).catch(alerts.error);
	};

	Diffs.delete = function (pid, timestamp, $selectElement, $numberOfDiffCon) {
		api.del(`/posts/${pid}/diffs/${timestamp}`).then(data => {
			parsePostHistory(data, 'diffs').then($html => {
				$selectElement.empty().append($html);
				$selectElement.trigger('change');
				const numberOfDiffs = $selectElement.find('option').length;
				$numberOfDiffCon.text(numberOfDiffs);
				alerts.success('[[topic:diffs.deleted]]');
			});
		}).catch(alerts.error);
	};

	function parsePostHistory(data, blockName) {
		return new Promise(resolve => {
			const parameters = [{
				diffs: data.revisions.map(revision => {
					const timestamp = Number.parseInt(revision.timestamp, 10);

					return {
						username: revision.username,
						timestamp,
						pretty: new Date(timestamp).toLocaleString(config.userLang.replace('_', '-'), localeStringOptions),
					};
				}),
				numDiffs: data.timestamps.length,
				editable: data.editable,
				deletable: data.deletable,
			}, function ($html) {
				resolve($html);
			}];

			if (blockName) {
				parameters.unshift(blockName);
			}

			app.parseAndTranslate('partials/modals/post_history', ...parameters);
		});
	}

	return Diffs;
});
