'use strict';

define('coverPhoto', [
	'alerts',
	'vendor/jquery/draggable-background/backgroundDraggable',
], alerts => {
	const coverPhoto = {
		coverEl: null,
		saveFn: null,
	};

	coverPhoto.init = function (coverElement, saveFunction, uploadFunction, removeFunction) {
		coverPhoto.coverEl = coverElement;
		coverPhoto.saveFn = saveFunction;

		coverElement.find('.upload').on('click', uploadFunction);
		coverElement.find('.resize').on('click', () => {
			enableDragging(coverElement);
		});
		coverElement.find('.remove').on('click', removeFunction);

		coverElement
			.on('dragover', coverPhoto.onDragOver)
			.on('drop', coverPhoto.onDrop);

		coverElement.find('.save').on('click', coverPhoto.save);
		coverElement.addClass('initialised');
	};

	coverPhoto.onDragOver = function (e) {
		e.stopPropagation();
		e.preventDefault();
		e.originalEvent.dataTransfer.dropEffect = 'copy';
	};

	coverPhoto.onDrop = function (e) {
		e.stopPropagation();
		e.preventDefault();

		const files = e.originalEvent.dataTransfer.files;
		const reader = new FileReader();

		if (files.length > 0 && files[0].type.match('image.*')) {
			reader.addEventListener('load', e => {
				coverPhoto.coverEl.css('background-image', 'url(' + e.target.result + ')');
				coverPhoto.newCover = e.target.result;
			});

			reader.readAsDataURL(files[0]);
			enableDragging(coverPhoto.coverEl);
		}
	};

	function enableDragging(coverElement) {
		coverElement.toggleClass('active', 1)
			.backgroundDraggable({
				axis: 'y',
				units: 'percent',
			});

		alerts.alert({
			alert_id: 'drag_start',
			title: '[[modules:cover.dragging_title]]',
			message: '[[modules:cover.dragging_message]]',
			timeout: 5000,
		});
	}

	coverPhoto.save = function () {
		coverPhoto.coverEl.addClass('saving');

		coverPhoto.saveFn(coverPhoto.newCover || undefined, coverPhoto.coverEl.css('background-position'), error => {
			if (error) {
				alerts.error(error);
			} else {
				coverPhoto.coverEl.toggleClass('active', 0);
				coverPhoto.coverEl.backgroundDraggable('disable');
				coverPhoto.coverEl.off('dragover', coverPhoto.onDragOver);
				coverPhoto.coverEl.off('drop', coverPhoto.onDrop);
				alerts.success('[[modules:cover.saved]]');
			}

			coverPhoto.coverEl.removeClass('saving');
		});
	};

	return coverPhoto;
});
