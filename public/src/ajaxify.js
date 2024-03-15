'use strict';

const hooks = require('./modules/hooks');
const {render} = require('./widgets');

window.ajaxify = window.ajaxify || {};
ajaxify.widgets = {render};
(function () {
	let apiXHR = null;
	let ajaxifyTimer;

	let retry = true;
	let previousBodyClass = '';

	ajaxify.count = 0;
	ajaxify.currentPage = null;

	ajaxify.go = function (url, callback, quiet) {
		// Automatically reconnect to socket and re-ajaxify on success
		if (!socket.connected) {
			app.reconnect();

			if (ajaxify.reconnectAction) {
				$(window).off('action:reconnected', ajaxify.reconnectAction);
			}

			ajaxify.reconnectAction = function (e) {
				ajaxify.go(url, callback, quiet);
				$(window).off(e);
			};

			$(window).on('action:reconnected', ajaxify.reconnectAction);
		}

		// Abort subsequent requests if clicked multiple times within a short window of time
		if (ajaxifyTimer && (Date.now() - ajaxifyTimer) < 500) {
			return true;
		}

		ajaxifyTimer = Date.now();

		if (ajaxify.handleRedirects(url)) {
			return true;
		}

		if (!quiet && url === ajaxify.currentPage + window.location.search + window.location.hash) {
			quiet = true;
		}

		ajaxify.cleanup(url, ajaxify.data.template.name);

		if ($('#content').hasClass('ajaxifying') && apiXHR) {
			apiXHR.abort();
		}

		app.previousUrl = ['reset'].includes(ajaxify.currentPage)
			? app.previousUrl
			: window.location.pathname.slice(config.relative_path.length) + window.location.search;

		url = ajaxify.start(url);

		// If any listeners alter url and set it to an empty string, abort the ajaxification
		if (url === null) {
			hooks.fire('action:ajaxify.end', {url, tpl_url: ajaxify.data.template.name, title: ajaxify.data.title});
			return false;
		}

		previousBodyClass = ajaxify.data.bodyClass;
		$('#footer, #content').removeClass('hide').addClass('ajaxifying');

		ajaxify.loadData(url, (error, data) => {
			if (!error || (
				error
                && error.data
                && (Number.parseInt(error.data.status, 10) !== 302 && Number.parseInt(error.data.status, 10) !== 308)
			)) {
				ajaxify.updateHistory(url, quiet);
			}

			if (error) {
				return onAjaxError(error, url, callback, quiet);
			}

			retry = true;

			renderTemplate(url, data.templateToRender || data.template.name, data, callback);
		});

		return true;
	};

	// This function is called just once from footer on page load
	ajaxify.coldLoad = function () {
		const url = ajaxify.start(window.location.pathname.slice(1) + window.location.search + window.location.hash);
		ajaxify.updateHistory(url, true);
		ajaxify.end(url, ajaxify.data.template.name);
		hooks.fire('action:ajaxify.coldLoad');
	};

	ajaxify.isCold = function () {
		return ajaxify.count <= 1;
	};

	ajaxify.handleRedirects = function (url) {
		url = ajaxify.removeRelativePath(url.replaceAll(/^\/|\/$/g, '')).toLowerCase();
		const isClientToAdmin = url.startsWith('admin') && window.location.pathname.indexOf(config.relative_path + '/admin') !== 0;
		const isAdminToClient = !url.startsWith('admin') && window.location.pathname.indexOf(config.relative_path + '/admin') === 0;

		if (isClientToAdmin || isAdminToClient) {
			window.open(config.relative_path + '/' + url, '_top');
			return true;
		}

		return false;
	};

	ajaxify.start = function (url) {
		url = ajaxify.removeRelativePath(url.replaceAll(/^\/|\/$/g, ''));

		const payload = {
			url,
		};

		hooks.logs.collect();
		hooks.fire('action:ajaxify.start', payload);

		ajaxify.count += 1;

		return payload.url;
	};

	ajaxify.updateHistory = function (url, quiet) {
		ajaxify.currentPage = url.split(/[?#]/)[0];
		if (window.history && window.history.pushState) {
			window.history[quiet ? 'replaceState' : 'pushState']({
				url,
			}, url, config.relative_path + '/' + url);
		}
	};

	function onAjaxError(error, url, callback, quiet) {
		const data = error.data;
		const textStatus = error.textStatus;

		if (data) {
			let status = Number.parseInt(data.status, 10);
			if ([400, 403, 404, 500, 502, 504].includes(status)) {
				if (status === 502 && retry) {
					retry = false;
					ajaxifyTimer = undefined;
					return ajaxify.go(url, callback, quiet);
				}

				if (status === 502) {
					status = 500;
				}

				if (data.responseJSON) {
					data.responseJSON.config = config;
				}

				$('#footer, #content').removeClass('hide').addClass('ajaxifying');
				return renderTemplate(url, status.toString(), data.responseJSON || {}, callback);
			}

			if (status === 401) {
				require(['alerts'], alerts => {
					alerts.error('[[global:please_log_in]]');
				});
				app.previousUrl = url;
				window.location.href = config.relative_path + '/login';
			} else if (status === 302 || status === 308) {
				if (data.responseJSON && data.responseJSON.external) {
					// This is used by sso plugins to redirect to the auth route
					// cant use ajaxify.go for /auth/sso routes
					window.location.href = data.responseJSON.external;
				} else if (typeof data.responseJSON === 'string') {
					ajaxifyTimer = undefined;
					if (data.responseJSON.startsWith('http://') || data.responseJSON.startsWith('https://')) {
						window.location.href = data.responseJSON;
					} else {
						ajaxify.go(data.responseJSON.slice(1), callback, quiet);
					}
				}
			}
		} else if (textStatus !== 'abort') {
			require(['alerts'], alerts => {
				alerts.error(data.responseJSON.error);
			});
		}
	}

	function renderTemplate(url, tpl_url, data, callback) {
		hooks.fire('action:ajaxify.loadingTemplates', {});
		require(['translator', 'benchpress'], (translator, Benchpress) => {
			Benchpress.render(tpl_url, data)
				.then(rendered => translator.translate(rendered))
				.then(translated => {
					translated = translator.unescape(translated);
					$('body').removeClass(previousBodyClass).addClass(data.bodyClass);
					$('#content').html(translated);

					ajaxify.end(url, tpl_url);

					if (typeof callback === 'function') {
						callback();
					}

					$('#content, #footer').removeClass('ajaxifying');

					// Only executed on ajaxify. Otherwise these'd be in ajaxify.end()
					updateTitle(data.title);
					updateTags();
				});
		});
	}

	function updateTitle(title) {
		if (!title) {
			return;
		}

		require(['translator'], translator => {
			title = config.titleLayout.replaceAll('&#123;', '{').replaceAll('&#125;', '}')
				.replace('{pageTitle}', () => title)
				.replace('{browserTitle}', () => config.browserTitle);

			// Allow translation strings in title on ajaxify (#5927)
			title = translator.unescape(title);
			const data = {title};
			hooks.fire('action:ajaxify.updateTitle', data);
			translator.translate(data.title, translated => {
				window.document.title = $('<div></div>').html(translated).text();
			});
		});
	}

	function updateTags() {
		const metaInclude = ['title', 'description', /og:.+/, /article:.+/, 'robots'].map(value => new RegExp(value));
		const linkInclude = new Set(['canonical', 'alternate', 'up']);

		// Delete the old meta tags
		for (const element of Array.prototype.slice
			.call(document.querySelectorAll('head meta'))
			.filter(element_ => {
				const name = element_.getAttribute('property') || element_.getAttribute('name');
				return metaInclude.some(exp => Boolean(exp.test(name)));
			})) {
			element.remove();
		}

		require(['translator'], translator => {
			// Add new meta tags
			ajaxify.data._header.tags.meta
				.filter(tagObject => {
					const name = tagObject.name || tagObject.property;
					return metaInclude.some(exp => Boolean(exp.test(name)));
				}).forEach(async tagObject => {
					tagObject.content &&= await translator.translate(tagObject.content);

					const metaElement = document.createElement('meta');
					for (const property of Object.keys(tagObject)) {
						metaElement.setAttribute(property, tagObject[property]);
					}

					document.head.append(metaElement);
				});
		});

		// Delete the old link tags
		for (const element of Array.prototype.slice
			.call(document.querySelectorAll('head link'))
			.filter(element_ => {
				const name = element_.getAttribute('rel');
				return linkInclude.has(name);
			})) {
			element.remove();
		}

		// Add new link tags
		for (const tagObject of ajaxify.data._header.tags.link
			.filter(tagObject_ => linkInclude.has(tagObject_.rel))) {
			const linkElement = document.createElement('link');
			for (const property of Object.keys(tagObject)) {
				linkElement.setAttribute(property, tagObject[property]);
			}

			document.head.append(linkElement);
		}
	}

	ajaxify.end = function (url, tpl_url) {
		// Scroll back to top of page
		if (!ajaxify.isCold()) {
			window.scrollTo(0, 0);
		}

		ajaxify.loadScript(tpl_url, function done() {
			hooks.fire('action:ajaxify.end', {url, tpl_url, title: ajaxify.data.title});
			hooks.logs.flush();
		});
		ajaxify.widgets.render(tpl_url);

		hooks.fire('action:ajaxify.contentLoaded', {url, tpl: tpl_url});

		app.processPage();
	};

	ajaxify.parseData = () => {
		const dataElement = document.querySelector('#ajaxify-data');
		if (dataElement) {
			try {
				ajaxify.data = JSON.parse(dataElement.textContent);
			} catch (error) {
				console.error(error);
				ajaxify.data = {};
			} finally {
				dataElement.remove();
			}
		}
	};

	ajaxify.removeRelativePath = function (url) {
		if (url.startsWith(config.relative_path.slice(1))) {
			url = url.slice(config.relative_path.length);
		}

		return url;
	};

	ajaxify.refresh = function (callback) {
		ajaxify.go(ajaxify.currentPage + window.location.search + window.location.hash, callback, true);
	};

	ajaxify.loadScript = function (tpl_url, callback) {
		let location = app.inAdmin ? '' : 'forum/';

		if (tpl_url.startsWith('admin')) {
			location = '';
		}

		const data = {
			tpl_url,
			scripts: [location + tpl_url],
		};

		// Hint: useful if you want to load a module on a specific page (append module name to `scripts`)
		hooks.fire('action:script.load', data);
		hooks.fire('filter:script.load', data).then(data => {
			// Require and parse modules
			let outstanding = data.scripts.length;

			const scripts = data.scripts.map(script => {
				if (typeof script === 'function') {
					return function (next) {
						script();
						next();
					};
				}

				if (typeof script === 'string') {
					return async function (next) {
						const module = await app.require(script);
						// Hint: useful if you want to override a loaded library (e.g. replace core client-side logic),
						// or call a method other than .init()
						hooks.fire('static:script.init', {tpl_url, name: script, module}).then(() => {
							if (module && module.init) {
								module.init();
							}

							next();
						});
					};
				}

				return null;
			}).filter(Boolean);

			if (scripts.length > 0) {
				for (const function_ of scripts) {
					function_(() => {
						outstanding -= 1;
						if (outstanding === 0) {
							callback();
						}
					});
				}
			} else {
				callback();
			}
		});
	};

	ajaxify.loadData = function (url, callback) {
		url = ajaxify.removeRelativePath(url);

		hooks.fire('action:ajaxify.loadingData', {url});

		apiXHR = $.ajax({
			url: config.relative_path + '/api/' + url,
			cache: false,
			headers: {
				'X-Return-To': app.previousUrl,
			},
			success(data, textStatus, xhr) {
				if (!data) {
					return;
				}

				if (xhr.getResponseHeader('X-Redirect')) {
					return callback({
						data: {
							status: 302,
							responseJSON: data,
						},
						textStatus: 'error',
					});
				}

				ajaxify.data = data;
				data.config = config;

				hooks.fire('action:ajaxify.dataLoaded', {url, data});

				callback(null, data);
			},
			error(data, textStatus) {
				if (data.status === 0 && textStatus === 'error') {
					data.status = 500;
					data.responseJSON = data.responseJSON || {};
					data.responseJSON.error = '[[error:no-connection]]';
				}

				callback({
					data,
					textStatus,
				});
			},
		});
	};

	ajaxify.loadTemplate = function (template, callback) {
		$.ajax({
			url: `${config.asset_base_url}/templates/${template}.js`,
			cache: false,
			dataType: 'text',
			success(script) {
				// eslint-disable-next-line no-new-func
				const renderFunction = new Function('module', script);
				const moduleObject = {exports: {}};
				renderFunction(moduleObject);
				callback(moduleObject.exports);
			},
		}).fail(() => {
			console.error('Unable to load template: ' + template);
			callback(new Error('[[error:unable-to-load-template]]'));
		});
	};

	ajaxify.cleanup = (url, tpl_url) => {
		app.leaveCurrentRoom();
		$(window).off('scroll');
		hooks.fire('action:ajaxify.cleanup', {url, tpl_url});
	};

	require(['translator', 'benchpress'], (translator, Benchpress) => {
		translator.translate('[[error:no-connection]]');
		translator.translate('[[error:socket-reconnect-failed]]');
		translator.translate(`[[global:reconnecting-message, ${config.siteTitle}]]`);
		Benchpress.registerLoader(ajaxify.loadTemplate);
		Benchpress.setGlobal('config', config);
		Benchpress.render('500', {}); // Loads and caches the 500.tpl
	});
})();

$(document).ready(() => {
	$(window).on('popstate', event => {
		event = event.originalEvent;

		if (event !== null && event.state) {
			if (event.state.url === null && event.state.returnPath !== undefined) {
				window.history.replaceState({
					url: event.state.returnPath,
				}, event.state.returnPath, config.relative_path + '/' + event.state.returnPath);
			} else if (event.state.url !== undefined) {
				ajaxify.go(event.state.url, () => {
					hooks.fire('action:popstate', {url: event.state.url});
				}, true);
			}
		}
	});

	function ajaxifyAnchors() {
		function hrefEmpty(href) {
			// eslint-disable-next-line no-script-url
			return href === undefined || href === '' || href === 'javascript:;';
		}

		const location = document.location || window.location;
		const rootUrl = location.protocol + '//' + (location.hostname || location.host) + (location.port ? ':' + location.port : '');
		const contentElement = document.querySelector('#content');

		// Enhancing all anchors to ajaxify...
		$(document.body).on('click', 'a', function (e) {
			const _self = this;
			if (this.target !== '' || (this.protocol !== 'http:' && this.protocol !== 'https:')) {
				return;
			}

			const $this = $(this);
			const href = $this.attr('href');
			const internalLink = utils.isInternalURI(this, window.location, config.relative_path);

			const rootAndPath = new RegExp(`^${rootUrl}${config.relative_path}/?`);
			const process = function () {
				if (!e.ctrlKey && !e.shiftKey && !e.metaKey && e.which === 1) {
					if (internalLink) {
						const pathname = this.href.replace(rootAndPath, '');

						// Special handling for urls with hashes
						if (window.location.pathname === this.pathname && this.hash.length > 0) {
							window.location.hash = this.hash;
						} else if (ajaxify.go(pathname)) {
							e.preventDefault();
						}
					} else if (window.location.pathname !== config.relative_path + '/outgoing') {
						if (config.openOutgoingLinksInNewTab && $.contains(contentElement, this)) {
							const externalTab = window.open();
							externalTab.opener = null;
							externalTab.location = this.href;
							e.preventDefault();
						} else if (config.useOutgoingLinksPage) {
							const safeUrls = config.outgoingLinksWhitelist.trim().split(/[\s,]+/g).filter(Boolean);
							const href = this.href;
							if (safeUrls.length === 0
                                || !safeUrls.some(url => href.includes(url))) {
								ajaxify.go('outgoing?url=' + encodeURIComponent(href));
								e.preventDefault();
							}
						}
					}
				}
			};

			if ($this.attr('data-ajaxify') === 'false') {
				if (!internalLink) {
					return;
				}

				return e.preventDefault();
			}

			// Default behaviour for rss feeds
			if (internalLink && href && href.endsWith('.rss')) {
				return;
			}

			// Default behaviour for sitemap
			if (internalLink && href && String(_self.pathname).startsWith(config.relative_path + '/sitemap') && href.endsWith('.xml')) {
				return;
			}

			// Default behaviour for uploads and direct links to API urls
			if (internalLink && ['/uploads', '/assets/', '/api/'].some(prefix => String(_self.pathname).startsWith(config.relative_path + prefix))) {
				return;
			}

			// eslint-disable-next-line no-script-url
			if (hrefEmpty(this.href) || this.protocol === 'javascript:' || href === '#' || href === '') {
				return e.preventDefault();
			}

			if (app.flags && app.flags.hasOwnProperty('_unsaved') && app.flags._unsaved === true) {
				if (e.ctrlKey) {
					return;
				}

				require(['bootbox'], bootbox => {
					bootbox.confirm('[[global:unsaved-changes]]', navigate => {
						if (navigate) {
							app.flags._unsaved = false;
							process.call(_self);
						}
					});
				});
				return e.preventDefault();
			}

			process.call(_self);
		});
	}

	if (window.history && window.history.pushState) {
		// Progressive Enhancement, ajaxify available only to modern browsers
		ajaxifyAnchors();
	}
});
