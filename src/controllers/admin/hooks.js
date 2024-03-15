'use strict';

const validator = require('validator');
const plugins = require('../../plugins');

const hooksController = module.exports;

hooksController.get = function (request, res) {
	const hooks = [];
	for (const [hookIndex, key] of Object.keys(plugins.loadedHooks).entries()) {
		const current = {
			hookName: key,
			methods: [],
			index: `hook-${hookIndex}`,
			count: plugins.loadedHooks[key].length,
		};

		for (const [methodIndex, hookData] of plugins.loadedHooks[key].entries()) {
			current.methods.push({
				id: hookData.id,
				priority: hookData.priority,
				method: hookData.method ? validator.escape(hookData.method.toString()) : 'No plugin function!',
				index: `${hookIndex}-code-${methodIndex}`,
			});
		}

		hooks.push(current);
	}

	hooks.sort((a, b) => b.count - a.count);

	res.render('admin/advanced/hooks', {hooks});
};
