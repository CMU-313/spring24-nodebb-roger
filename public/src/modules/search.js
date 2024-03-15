'use strict';

define('search', ['translator', 'storage', 'hooks', 'alerts'], (translator, storage, hooks, alerts) => {
	const Search = {
		current: {},
	};

	Search.init = function (searchOptions) {
		if (!config.searchEnabled) {
			return;
		}

		searchOptions ||= {in: config.searchDefaultInQuick || 'titles'};
		const searchButton = $('#search-button');
		const searchFields = $('#search-fields');
		const searchInput = $('#search-fields input');
		const quickSearchContainer = $('#quick-search-container');

		$('#search-form .advanced-search-link').off('mousedown').on('mousedown', () => {
			ajaxify.go('/search');
		});

		$('#search-form').off('submit').on('submit', () => {
			searchInput.blur();
		});
		searchInput.off('blur').on('blur', function dismissSearch() {
			setTimeout(() => {
				if (!searchInput.is(':focus')) {
					searchFields.addClass('hidden');
					searchButton.removeClass('hidden');
				}
			}, 200);
		});
		searchInput.off('focus');

		const searchElements = {
			inputEl: searchInput,
			resultEl: quickSearchContainer,
		};

		Search.enableQuickSearch({
			searchOptions,
			searchElements,
		});

		searchButton.off('click').on('click', e => {
			if (!config.loggedIn && !app.user.privileges['search:content']) {
				alerts.alert({
					message: '[[error:search-requires-login]]',
					timeout: 3000,
				});
				ajaxify.go('login');
				return false;
			}

			e.stopPropagation();

			Search.showAndFocusInput();
			return false;
		});

		$('#search-form').off('submit').on('submit', function () {
			const input = $(this).find('input');
			const data = Search.getSearchPreferences();
			data.term = input.val();
			data.in = searchOptions.in;
			hooks.fire('action:search.submit', {
				searchOptions: data,
				searchElements,
			});
			Search.query(data, () => {
				input.val('');
			});

			return false;
		});
	};

	Search.enableQuickSearch = function (options) {
		if (!config.searchEnabled || !app.user.privileges['search:content']) {
			return;
		}

		const searchOptions = Object.assign({in: config.searchDefaultInQuick || 'titles'}, options.searchOptions);
		const quickSearchResults = options.searchElements.resultEl;
		const inputElement = options.searchElements.inputEl;
		let oldValue = inputElement.val();
		const filterCategoryElement = quickSearchResults.find('.filter-category');

		function updateCategoryFilterName() {
			if (ajaxify.data.template.category && ajaxify.data.cid) {
				translator.translate('[[search:search-in-category, ' + ajaxify.data.name + ']]', translated => {
					const name = $('<div></div>').html(translated).text();
					filterCategoryElement.find('.name').text(name);
				});
			}

			filterCategoryElement.toggleClass('hidden', !(ajaxify.data.template.category && ajaxify.data.cid));
		}

		function doSearch() {
			options.searchOptions = Object.assign({}, searchOptions);
			options.searchOptions.term = inputElement.val();
			updateCategoryFilterName();

			if (ajaxify.data.template.category && ajaxify.data.cid && filterCategoryElement.find('input[type="checkbox"]').is(':checked')) {
				options.searchOptions.categories = [ajaxify.data.cid];
				options.searchOptions.searchChildren = true;
			}

			quickSearchResults.removeClass('hidden').find('.quick-search-results-container').html('');
			quickSearchResults.find('.loading-indicator').removeClass('hidden');
			hooks.fire('action:search.quick.start', options);
			options.searchOptions.searchOnly = 1;
			Search.api(options.searchOptions, data => {
				quickSearchResults.find('.loading-indicator').addClass('hidden');
				if (!data.posts || (options.hideOnNoMatches && data.posts.length === 0)) {
					return quickSearchResults.addClass('hidden').find('.quick-search-results-container').html('');
				}

				for (const p of data.posts) {
					const text = $('<div>' + p.content + '</div>').text();
					const query = inputElement.val().toLowerCase().replace(/^in:topic-\d+/, '');
					const start = Math.max(0, text.toLowerCase().indexOf(query) - 40);
					p.snippet = utils.escapeHTML((start > 0 ? '...' : '')
                        + text.slice(start, start + 80)
                        + (text.length - start > 80 ? '...' : ''));
				}

				app.parseAndTranslate('partials/quick-search-results', data, html => {
					if (html.length > 0) {
						html.find('.timeago').timeago();
					}

					quickSearchResults.toggleClass('hidden', html.length === 0 || !inputElement.is(':focus'))
						.find('.quick-search-results-container')
						.html(html.length > 0 ? html : '');
					const highlightEls = quickSearchResults.find(
						'.quick-search-results .quick-search-title, .quick-search-results .snippet',
					);
					Search.highlightMatches(options.searchOptions.term, highlightEls);
					hooks.fire('action:search.quick.complete', {
						data,
						options,
					});
				});
			});
		}

		quickSearchResults.find('.filter-category input[type="checkbox"]').on('change', () => {
			inputElement.focus();
			doSearch();
		});

		inputElement.off('keyup').on('keyup', utils.debounce(() => {
			if (inputElement.val().length < 3) {
				quickSearchResults.addClass('hidden');
				oldValue = inputElement.val();
				return;
			}

			if (inputElement.val() === oldValue) {
				return;
			}

			oldValue = inputElement.val();
			if (!inputElement.is(':focus')) {
				return quickSearchResults.addClass('hidden');
			}

			doSearch();
		}, 500));

		let mousedownOnResults = false;
		quickSearchResults.on('mousedown', () => {
			$(window).one('mouseup', () => {
				quickSearchResults.addClass('hidden');
			});
			mousedownOnResults = true;
		});
		inputElement.on('blur', () => {
			if (!inputElement.is(':focus') && !mousedownOnResults && !quickSearchResults.hasClass('hidden')) {
				quickSearchResults.addClass('hidden');
			}
		});

		let ajaxified = false;
		hooks.on('action:ajaxify.end', () => {
			if (!ajaxify.isCold()) {
				ajaxified = true;
			}
		});

		inputElement.on('focus', () => {
			mousedownOnResults = false;
			const query = inputElement.val();
			oldValue = query;
			if (query && quickSearchResults.find('#quick-search-results').children().length > 0) {
				updateCategoryFilterName();
				if (ajaxified) {
					doSearch();
					ajaxified = false;
				} else {
					quickSearchResults.removeClass('hidden');
				}

				inputElement[0].setSelectionRange(
					query.startsWith('in:topic') ? query.indexOf(' ') + 1 : 0,
					query.length,
				);
			}
		});

		inputElement.off('refresh').on('refresh', () => {
			doSearch();
		});
	};

	Search.showAndFocusInput = function () {
		$('#search-fields').removeClass('hidden');
		$('#search-button').addClass('hidden');
		$('#search-fields input').focus();
	};

	Search.query = function (data, callback) {
		callback ||= function () {};
		ajaxify.go('search?' + createQueryString(data));
		callback();
	};

	Search.api = function (data, callback) {
		const apiURL = config.relative_path + '/api/search?' + createQueryString(data);
		data.searchOnly = undefined;
		const searchURL = config.relative_path + '/search?' + createQueryString(data);
		$.get(apiURL, result => {
			result.url = searchURL;
			callback(result);
		});
	};

	function createQueryString(data) {
		const searchIn = data.in || 'titles';
		const postedBy = data.by || '';
		let term = data.term.replace(/^[ ?#]*/, '');
		try {
			term = encodeURIComponent(term);
		} catch {
			return alerts.error('[[error:invalid-search-term]]');
		}

		const query = {
			term,
			in: searchIn,
		};

		if (data.matchWords) {
			query.matchWords = data.matchWords;
		}

		if (postedBy && postedBy.length > 0 && (searchIn === 'posts' || searchIn === 'titles' || searchIn === 'titlesposts')) {
			query.by = postedBy;
		}

		if (data.topicName) {
			query.topicName = data.topicName;
		}

		if (data.categories && data.categories.length > 0) {
			query.categories = data.categories;
			if (data.searchChildren) {
				query.searchChildren = data.searchChildren;
			}
		}

		if (data.hasTags && data.hasTags.length > 0) {
			query.hasTags = data.hasTags;
		}

		if (Number.parseInt(data.replies, 10) > 0) {
			query.replies = data.replies;
			query.repliesFilter = data.repliesFilter || 'atleast';
		}

		if (data.timeRange) {
			query.timeRange = data.timeRange;
			query.timeFilter = data.timeFilter || 'newer';
		}

		if (data.sortBy) {
			query.sortBy = data.sortBy;
			query.sortDirection = data.sortDirection;
		}

		if (data.showAs) {
			query.showAs = data.showAs;
		}

		if (data.searchOnly) {
			query.searchOnly = data.searchOnly;
		}

		hooks.fire('action:search.createQueryString', {
			query,
			data,
		});

		return decodeURIComponent($.param(query));
	}

	Search.getSearchPreferences = function () {
		try {
			return JSON.parse(storage.getItem('search-preferences') || '{}');
		} catch {
			return {};
		}
	};

	Search.highlightMatches = function (searchQuery, els) {
		if (!searchQuery || els.length === 0) {
			return;
		}

		searchQuery = utils.escapeHTML(searchQuery.replace(/^"/, '').replace(/"$/, '').trim());
		const regexString = searchQuery.split(' ')
			.map(word => utils.escapeRegexChars(word))
			.join('|');
		const regex = new RegExp('(' + regexString + ')', 'gi');

		els.each(function () {
			const result = $(this);
			const nested = [];

			result.find('*').each(function () {
				$(this).after('<!-- ' + nested.length + ' -->');
				nested.push($('<div></div>').append($(this)));
			});

			result.html(result.html().replace(regex, (match, p1) => '<strong class="search-match">' + p1 + '</strong>'));

			for (const [i, nestedElement] of nested.entries()) {
				result.html(result.html().replace('<!-- ' + i + ' -->', () => nestedElement.html()));
			}
		});

		$('.search-result-text').find('img:not(.not-responsive)').addClass('img-responsive');
	};

	return Search;
});
