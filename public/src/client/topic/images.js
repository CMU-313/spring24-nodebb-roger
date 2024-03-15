'use strict';

define('forum/topic/images', [], () => {
	const Images = {};

	Images.wrapImagesInLinks = function (posts) {
		posts.find('[component="post/content"] img:not(.emoji)').each(function () {
			const $this = $(this);
			let source = $this.attr('src') || '';
			const alt = $this.attr('alt') || '';
			const suffixRegex = /-resized(\.\w+)?$/;

			if (source === 'about:blank') {
				return;
			}

			if (utils.isRelativeUrl(source) && suffixRegex.test(source)) {
				source = source.replace(suffixRegex, '$1');
			}

			const sourceExtension = source.split('.').slice(1).pop();
			const altFilename = alt.split('/').pop();
			const altExtension = altFilename.split('.').slice(1).pop();

			if (!$this.parent().is('a')) {
				$this.wrap('<a href="' + source + '" '
                    + (!sourceExtension && altExtension ? ' download="' + altFilename + '" ' : '')
                    + ' target="_blank" rel="noopener">');
			}
		});
	};

	return Images;
});
