'use strict';

const winston = require('winston');
const _ = require('lodash');
const Benchpress = require('benchpressjs');
const plugins = require('../plugins');
const groups = require('../groups');
const translator = require('../translator');
const db = require('../database');
const apiController = require('../controllers/api');
const meta = require('../meta');

const widgets = module.exports;

widgets.render = async function (uid, options) {
	if (!options.template) {
		throw new Error('[[error:invalid-data]]');
	}

	const data = await widgets.getWidgetDataForTemplates(['global', options.template]);
	delete data.global.drafts;

	const locations = _.uniq(Object.keys(data.global).concat(Object.keys(data[options.template])));

	const widgetData = await Promise.all(locations.map(location => renderLocation(location, data, uid, options)));

	const returnData = {};
	for (const [i, location] of locations.entries()) {
		if (Array.isArray(widgetData[i]) && widgetData[i].length > 0) {
			returnData[location] = widgetData[i].filter(Boolean);
		}
	}

	return returnData;
};

async function renderLocation(location, data, uid, options) {
	const widgetsAtLocation = (data[options.template][location] || []).concat(data.global[location] || []);

	if (widgetsAtLocation.length === 0) {
		return [];
	}

	const renderedWidgets = await Promise.all(widgetsAtLocation.map(widget => renderWidget(widget, uid, options)));
	return renderedWidgets;
}

async function renderWidget(widget, uid, options) {
	if (!widget || !widget.data || (Boolean(widget.data['hide-mobile']) && options.req.useragent.isMobile)) {
		return;
	}

	const isVisible = await widgets.checkVisibility(widget.data, uid);
	if (!isVisible) {
		return;
	}

	let config = options.res.locals.config || {};
	if (options.res.locals.isAPI) {
		config = await apiController.loadConfig(options.req);
	}

	const userLang = config.userLang || meta.config.defaultLang || 'en-GB';
	const templateData = _.assign({}, options.templateData, {config});
	const data = await plugins.hooks.fire(`filter:widget.render:${widget.widget}`, {
		uid,
		area: options,
		templateData,
		data: widget.data,
		req: options.req,
		res: options.res,
	});

	if (!data) {
		return;
	}

	let {html} = data;

	if (widget.data.container && widget.data.container.match('{body}')) {
		html = await Benchpress.compileRender(widget.data.container, {
			title: widget.data.title,
			body: html,
			template: data.templateData && data.templateData.template,
		});
	}

	html &&= await translator.translate(html, userLang);

	return {html};
}

widgets.checkVisibility = async function (data, uid) {
	let isVisible = true;
	let isHidden = false;
	if (data.groups.length > 0) {
		isVisible = await groups.isMemberOfAny(uid, data.groups);
	}

	if (data.groupsHideFrom.length > 0) {
		isHidden = await groups.isMemberOfAny(uid, data.groupsHideFrom);
	}

	return isVisible && !isHidden;
};

widgets.getWidgetDataForTemplates = async function (templates) {
	const keys = templates.map(tpl => `widgets:${tpl}`);
	const data = await db.getObjects(keys);

	const returnData = {};

	for (const [index, template] of templates.entries()) {
		returnData[template] = returnData[template] || {};

		const templateWidgetData = data[index] || {};
		const locations = Object.keys(templateWidgetData);

		for (const location of locations) {
			if (templateWidgetData && templateWidgetData[location]) {
				try {
					returnData[template][location] = parseWidgetData(templateWidgetData[location]);
				} catch {
					winston.error(`can not parse widget data. template:  ${template} location: ${location}`);
					returnData[template][location] = [];
				}
			} else {
				returnData[template][location] = [];
			}
		}
	}

	return returnData;
};

widgets.getArea = async function (template, location) {
	const result = await db.getObjectField(`widgets:${template}`, location);
	if (!result) {
		return [];
	}

	return parseWidgetData(result);
};

function parseWidgetData(data) {
	const widgets = JSON.parse(data);
	for (const widget of widgets) {
		if (widget) {
			widget.data.groups = widget.data.groups || [];
			if (widget.data.groups && !Array.isArray(widget.data.groups)) {
				widget.data.groups = [widget.data.groups];
			}

			widget.data.groupsHideFrom = widget.data.groupsHideFrom || [];
			if (widget.data.groupsHideFrom && !Array.isArray(widget.data.groupsHideFrom)) {
				widget.data.groupsHideFrom = [widget.data.groupsHideFrom];
			}
		}
	}

	return widgets;
}

widgets.setArea = async function (area) {
	if (!area.location || !area.template) {
		throw new Error('Missing location and template data');
	}

	await db.setObjectField(`widgets:${area.template}`, area.location, JSON.stringify(area.widgets));
};

widgets.setAreas = async function (areas) {
	const templates = {};
	for (const area of areas) {
		if (!area.location || !area.template) {
			throw new Error('Missing location and template data');
		}

		templates[area.template] = templates[area.template] || {};
		templates[area.template][area.location] = JSON.stringify(area.widgets);
	}

	await db.setObjectBulk(
		Object.keys(templates).map(tpl => [`widgets:${tpl}`, templates[tpl]]),
	);
};

widgets.reset = async function () {
	const defaultAreas = [
		{name: 'Draft Zone', template: 'global', location: 'header'},
		{name: 'Draft Zone', template: 'global', location: 'footer'},
		{name: 'Draft Zone', template: 'global', location: 'sidebar'},
	];

	const [areas, drafts] = await Promise.all([
		plugins.hooks.fire('filter:widgets.getAreas', defaultAreas),
		widgets.getArea('global', 'drafts'),
	]);

	let saveDrafts = drafts || [];
	for (const area of areas) {
		/* eslint-disable no-await-in-loop */
		const areaData = await widgets.getArea(area.template, area.location);
		saveDrafts = saveDrafts.concat(areaData);
		area.widgets = [];
		await widgets.setArea(area);
	}

	await widgets.setArea({
		template: 'global',
		location: 'drafts',
		widgets: saveDrafts,
	});
};

widgets.resetTemplate = async function (template) {
	const area = await db.getObject(`widgets:${template}.tpl`);
	if (area) {
		const toBeDrafted = _.flatMap(Object.values(area), value => JSON.parse(value));
		await db.delete(`widgets:${template}.tpl`);
		let draftWidgets = await db.getObjectField('widgets:global', 'drafts');
		draftWidgets = JSON.parse(draftWidgets).concat(toBeDrafted);
		await db.setObjectField('widgets:global', 'drafts', JSON.stringify(draftWidgets));
	}
};

widgets.resetTemplates = async function (templates) {
	for (const template of templates) {
		/* eslint-disable no-await-in-loop */
		await widgets.resetTemplate(template);
	}
};

require('../promisify')(widgets);
