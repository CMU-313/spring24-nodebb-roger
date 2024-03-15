'use strict';

const nconf = require('nconf');
const validator = require('validator');
const plugins = require('../plugins');
const meta = require('../meta');
const translator = require('../translator');
const widgets = require('../widgets');
const utils = require('../utils');
const helpers = require('./helpers');

const relative_path = nconf.get('relative_path');

module.exports = function (middleware) {
	middleware.processRender = function processRender(request, res, next) {
		// Res.render post-processing, modified from here: https://gist.github.com/mrlannigan/5051687
		const {render} = res;

		res.render = async function renderOverride(template, options, function_) {
			const self = this;
			const {req} = this;
			async function renderMethod(template, options, function__) {
				options ||= {};
				if (typeof options === 'function') {
					function__ = options;
					options = {};
				}

				options.loggedIn = req.uid > 0;
				options.relative_path = relative_path;
				options.template = {name: template, [template]: true};
				options.url = (req.baseUrl + req.path.replace(/^\/api/, ''));
				options.bodyClass = helpers.buildBodyClass(req, res, options);

				if (req.loggedIn) {
					res.set('cache-control', 'private');
				}

				const buildResult = await plugins.hooks.fire(`filter:${template}.build`, {req, res, templateData: options});
				if (res.headersSent) {
					return;
				}

				const templateToRender = buildResult.templateData.templateToRender || template;

				const renderResult = await plugins.hooks.fire('filter:middleware.render', {req, res, templateData: buildResult.templateData});
				if (res.headersSent) {
					return;
				}

				options = renderResult.templateData;
				options._header = {
					tags: await meta.tags.parse(req, renderResult, res.locals.metaTags, res.locals.linkTags),
				};
				options.widgets = await widgets.render(req.uid, {
					template: `${template}.tpl`,
					url: options.url,
					templateData: options,
					req,
					res,
				});
				res.locals.template = template;
				options._locals = undefined;

				if (res.locals.isAPI) {
					if (req.route && req.route.path === '/api/') {
						options.title = '[[pages:home]]';
					}

					req.app.set('json spaces', global.env === 'development' || req.query.pretty ? 4 : 0);
					return res.json(options);
				}

				const optionsString = JSON.stringify(options).replaceAll('</', '<\\/');
				const results = await utils.promiseParallel({
					header: renderHeaderFooter('renderHeader', req, res, options),
					content: renderContent(render, templateToRender, req, res, options),
					footer: renderHeaderFooter('renderFooter', req, res, options),
				});

				const string_ = `${results.header
                    + (res.locals.postHeader || '')
                    + results.content
				}<script id="ajaxify-data" type="application/json">${
					optionsString
				}</script>${
					res.locals.preFooter || ''
				}${results.footer}`;

				if (typeof function__ === 'function') {
					function__(null, string_);
				} else {
					self.send(string_);
				}
			}

			try {
				await renderMethod(template, options, function_);
			} catch (error) {
				next(error);
			}
		};

		next();
	};

	async function renderContent(render, tpl, request, res, options) {
		return new Promise((resolve, reject) => {
			render.call(res, tpl, options, async (error, string_) => {
				if (error) {
					reject(error);
				} else {
					resolve(await translate(string_, getLang(request, res)));
				}
			});
		});
	}

	async function renderHeaderFooter(method, request, res, options) {
		let string_ = '';
		if (res.locals.renderHeader) {
			string_ = await middleware[method](request, res, options);
		} else if (res.locals.renderAdminHeader) {
			string_ = await middleware.admin[method](request, res, options);
		} else {
			string_ = '';
		}

		return await translate(string_, getLang(request, res));
	}

	function getLang(request, res) {
		let language = (res.locals.config && res.locals.config.userLang) || 'en-GB';
		if (res.locals.renderAdminHeader) {
			language = (res.locals.config && res.locals.config.acpLang) || 'en-GB';
		}

		return request.query.lang ? validator.escape(String(request.query.lang)) : language;
	}

	async function translate(string_, language) {
		const translated = await translator.translate(string_, language);
		return translator.unescape(translated);
	}
};
