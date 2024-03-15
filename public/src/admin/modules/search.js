'use strict';

define('admin/modules/search', ['mousetrap', 'alerts'], (mousetrap, alerts) => {
	const search = {};

	function find(dictionary, term) {
		const html = dictionary.filter(element => element.translations.toLowerCase().includes(term)).map(parameters => {
			const namespace = parameters.namespace;
			const translations = parameters.translations;
			let title = parameters.title;
			const escaped = utils.escapeRegexChars(term);

			const results = translations
			// Remove all lines without a match
				.replaceAll(new RegExp('^(?:(?!' + escaped + ').)*$', 'gmi'), '')
			// Remove lines that only match the title
				.replaceAll(new RegExp('(^|\\n).*?' + title + '.*?(\\n|$)', 'g'), '')
			// Get up to 25 characters of context on both sides of the match
			// and wrap the match in a `.search-match` element
				.replaceAll(
					new RegExp('^[\\s\\S]*?(.{0,25})(' + escaped + ')(.{0,25})[\\s\\S]*?$', 'gmi'),
					'...$1<span class="search-match">$2</span>$3...<br>',
				)
			// Collapse whitespace
				.replaceAll(/(?:\n ?)+/g, '\n')
				.trim();

			title = title.replaceAll(
				new RegExp('(^.*?)(' + escaped + ')(.*?$)', 'gi'),
				'$1<span class="search-match">$2</span>$3',
			);

			return '<li role="presentation" class="result">'
                + '<a role= "menuitem" href= "' + config.relative_path + '/' + namespace + '" >'
                    + title
                    + '<br>' + (results ? ('<small><code>'
                        + results
                    + '</small></code>')
				: '')
                + '</a>'
            + '</li>';
		}).join('');
		return html;
	}

	search.init = function () {
		if (!app.user.privileges['admin:settings']) {
			return;
		}

		socket.emit('admin.getSearchDict', {}, (error, dictionary) => {
			if (error) {
				alerts.error(error);
				throw error;
			}

			setupACPSearch(dictionary);
		});
	};

	function setupACPSearch(dictionary) {
		const dropdown = $('#acp-search .dropdown');
		const menu = $('#acp-search .dropdown-menu');
		const input = $('#acp-search input');
		const placeholderText = dropdown.attr('data-text');

		if (!config.searchEnabled) {
			menu.addClass('search-disabled');
		}

		input.on('keyup', () => {
			dropdown.addClass('open');
		});

		$('#acp-search').parents('form').on('submit', event => {
			const query = input.val();
			const selected = menu.get(0).querySelector('li.result > a.focus') || menu.get(0).querySelector('li.result > a');
			const href = selected ? selected.getAttribute('href') : config.relative_path + '/search?in=titlesposts&term=' + escape(query);

			ajaxify.go(href.replace(/^\//, ''));

			setTimeout(() => {
				dropdown.removeClass('open');
				input.blur();
				dropdown.attr('data-text', query || placeholderText);
			}, 150);

			event.preventDefault();
			return false;
		});

		mousetrap.bind('/', event => {
			input.select();
			event.preventDefault();
		});

		mousetrap(input[0]).bind(['up', 'down'], (event, key) => {
			let next;
			if (key === 'up') {
				next = menu.find('li.result > a.focus').removeClass('focus').parent().prev('.result')
					.children();
				if (next.length === 0) {
					next = menu.find('li.result > a').last();
				}

				next.addClass('focus');
				if (menu[0].getBoundingClientRect().top > next[0].getBoundingClientRect().top) {
					next[0].scrollIntoView(true);
				}
			} else if (key === 'down') {
				next = menu.find('li.result > a.focus').removeClass('focus').parent().next('.result')
					.children();
				if (next.length === 0) {
					next = menu.find('li.result > a').first();
				}

				next.addClass('focus');
				if (menu[0].getBoundingClientRect().bottom < next[0].getBoundingClientRect().bottom) {
					next[0].scrollIntoView(false);
				}
			}

			event.preventDefault();
		});

		let previousValue;

		input.on('keyup focus', () => {
			const value = input.val().toLowerCase();

			if (value === previousValue) {
				return;
			}

			previousValue = value;

			menu.children('.result').remove();

			const length = /\W/.test(value) ? 3 : value.length;
			let results;

			menu.toggleClass('state-start-typing', length === 0);
			menu.toggleClass('state-keep-typing', length > 0 && length < 3);

			if (length >= 3) {
				menu.prepend(find(dictionary, value));

				results = menu.children('.result').length;

				menu.toggleClass('state-no-results', !results);
				menu.toggleClass('state-yes-results', Boolean(results));

				menu.find('.search-forum')
					.not('.divider')
					.find('a')
					.attr('href', config.relative_path + '/search?in=titlesposts&term=' + escape(value))
					.find('strong')
					.text(value);
			} else {
				menu.removeClass('state-no-results state-yes-results');
			}
		});
	}

	return search;
});
