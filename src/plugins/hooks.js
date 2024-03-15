'use strict';

const util = require('node:util');
const winston = require('winston');
const utils = require('../utils');
const plugins = require('.');

const Hooks = module.exports;

Hooks._deprecated = new Map([
	['filter:email.send', {
		new: 'static:email.send',
		since: 'v1.17.0',
		until: 'v2.0.0',
	}],
	['filter:router.page', {
		new: 'response:router.page',
		since: 'v1.15.3',
		until: 'v2.1.0',
	}],
	['filter:post.purge', {
		new: 'filter:posts.purge',
		since: 'v1.19.6',
		until: 'v2.1.0',
	}],
	['action:post.purge', {
		new: 'action:posts.purge',
		since: 'v1.19.6',
		until: 'v2.1.0',
	}],
	['filter:user.verify.code', {
		new: 'filter:user.verify',
		since: 'v2.2.0',
		until: 'v3.0.0',
	}],
	['filter:flags.getFilters', {
		new: 'filter:flags.init',
		since: 'v2.7.0',
		until: 'v3.0.0',
	}],
]);

Hooks.internals = {
	_register(data) {
		plugins.loadedHooks[data.hook] = plugins.loadedHooks[data.hook] || [];
		plugins.loadedHooks[data.hook].push(data);
	},
};

const hookTypeToMethod = {
	filter: fireFilterHook,
	action: fireActionHook,
	static: fireStaticHook,
	response: fireResponseHook,
};

/*
    `data` is an object consisting of (* is required):
        `data.hook`*, the name of the NodeBB hook
        `data.method`*, the method called in that plugin (can be an array of functions)
        `data.priority`, the relative priority of the method when it is eventually called (default: 10)
*/
Hooks.register = function (id, data) {
	if (!data.hook || !data.method) {
		winston.warn(`[plugins/${id}] registerHook called with invalid data.hook/method`, data);
		return;
	}

	// `hasOwnProperty` needed for hooks with no alternative (set to null)
	if (Hooks._deprecated.has(data.hook)) {
		const deprecation = Hooks._deprecated.get(data.hook);
		if (!deprecation.hasOwnProperty('affected')) {
			deprecation.affected = new Set();
		}

		deprecation.affected.add(id);
		Hooks._deprecated.set(data.hook, deprecation);
	}

	data.id = id;
	data.priority ||= 10;

	if (Array.isArray(data.method) && data.method.every(method => typeof method === 'function' || typeof method === 'string')) {
		// Go go gadget recursion!
		for (const method of data.method) {
			const singularData = {...data, method};
			Hooks.register(id, singularData);
		}
	} else if (typeof data.method === 'string' && data.method.length > 0) {
		const method = data.method.split('.').reduce((memo, property) => {
			if (memo && memo[property]) {
				return memo[property];
			}

			// Couldn't find method by path, aborting
			return null;
		}, plugins.libraries[data.id]);

		// Write the actual method reference to the hookObj
		data.method = method;

		Hooks.internals._register(data);
	} else if (typeof data.method === 'function') {
		Hooks.internals._register(data);
	} else {
		winston.warn(`[plugins/${id}] Hook method mismatch: ${data.hook} => ${data.method}`);
	}
};

Hooks.unregister = function (id, hook, method) {
	const hooks = plugins.loadedHooks[hook] || [];
	plugins.loadedHooks[hook] = hooks.filter(hookData => hookData && hookData.id !== id && hookData.method !== method);
};

Hooks.fire = async function (hook, parameters) {
	const hookList = plugins.loadedHooks[hook];
	const hookType = hook.split(':')[0];
	if (global.env === 'development' && hook !== 'action:plugins.firehook' && hook !== 'filter:plugins.firehook') {
		winston.verbose(`[plugins/fireHook] ${hook}`);
	}

	if (!hookTypeToMethod[hookType]) {
		winston.warn(`[plugins] Unknown hookType: ${hookType}, hook : ${hook}`);
		return;
	}

	let deleteCaller = false;
	if (parameters && typeof parameters === 'object' && !Array.isArray(parameters) && !parameters.hasOwnProperty('caller')) {
		const als = require('../als');
		parameters.caller = als.getStore();
		deleteCaller = true;
	}

	const result = await hookTypeToMethod[hookType](hook, hookList, parameters);

	if (hook !== 'action:plugins.firehook' && hook !== 'filter:plugins.firehook') {
		const payload = await Hooks.fire('filter:plugins.firehook', {hook, params: result || parameters});
		Hooks.fire('action:plugins.firehook', payload);
	}

	if (result !== undefined) {
		if (deleteCaller && result && result.hasOwnProperty('caller')) {
			delete result.caller;
		}

		return result;
	}
};

Hooks.hasListeners = function (hook) {
	return Boolean(plugins.loadedHooks[hook] && plugins.loadedHooks[hook].length > 0);
};

async function fireFilterHook(hook, hookList, parameters) {
	if (!Array.isArray(hookList) || hookList.length === 0) {
		return parameters;
	}

	async function fireMethod(hookObject, parameters_) {
		if (typeof hookObject.method !== 'function') {
			if (global.env === 'development') {
				winston.warn(`[plugins] Expected method for hook '${hook}' in plugin '${hookObject.id}' not found, skipping.`);
			}

			return parameters_;
		}

		if (hookObject.method.constructor && hookObject.method.constructor.name === 'AsyncFunction') {
			return await hookObject.method(parameters_);
		}

		return new Promise((resolve, reject) => {
			let resolved = false;
			function _resolve(result) {
				if (resolved) {
					winston.warn(`[plugins] ${hook} already resolved in plugin ${hookObject.id}`);
					return;
				}

				resolved = true;
				resolve(result);
			}

			const returned = hookObject.method(parameters_, (error, result) => {
				if (error) {
					reject(error);
				} else {
					_resolve(result);
				}
			});

			if (utils.isPromise(returned)) {
				returned.then(
					payload => _resolve(payload),
					error => reject(error),
				);
				return;
			}

			if (returned) {
				_resolve(returned);
			}
		});
	}

	for (const hookObject of hookList) {
		// eslint-disable-next-line
        parameters = await fireMethod(hookObject, parameters);
	}

	return parameters;
}

async function fireActionHook(hook, hookList, parameters) {
	if (!Array.isArray(hookList) || hookList.length === 0) {
		return;
	}

	for (const hookObject of hookList) {
		if (typeof hookObject.method === 'function') {
			// eslint-disable-next-line
            await hookObject.method(parameters);
		} else if (global.env === 'development') {
			winston.warn(`[plugins] Expected method for hook '${hook}' in plugin '${hookObject.id}' not found, skipping.`);
		}
	}
}

async function fireStaticHook(hook, hookList, parameters) {
	if (!Array.isArray(hookList) || hookList.length === 0) {
		return;
	}

	// Don't bubble errors from these hooks, so bad plugins don't stop startup
	const noErrorHooks = new Set(['static:app.load', 'static:assets.prepare', 'static:app.preload']);

	for (const hookObject of hookList) {
		if (typeof hookObject.method === 'function') {
			let hookFunction = hookObject.method;
			if (hookFunction.constructor && hookFunction.constructor.name !== 'AsyncFunction') {
				hookFunction = util.promisify(hookFunction);
			}

			try {
				// eslint-disable-next-line
                await timeout(hookFunction(parameters), 5000, 'timeout');
			} catch (error) {
				if (error && error.message === 'timeout') {
					winston.warn(`[plugins] Callback timed out, hook '${hook}' in plugin '${hookObject.id}'`);
				} else {
					winston.error(`[plugins] Error executing '${hook}' in plugin '${hookObject.id}'\n${error.stack}`);
					if (!noErrorHooks.has(hook)) {
						throw error;
					}
				}
			}
		} else if (global.env === 'development') {
			winston.warn(`[plugins] Expected method for hook '${hook}' in plugin '${hookObject.id}' not found, skipping.`);
		}
	}
}

// https://advancedweb.hu/how-to-add-timeout-to-a-promise-in-javascript/
const timeout = (prom, time, error) => {
	let timer;
	return Promise.race([
		prom,
		new Promise((resolve, reject) => {
			timer = setTimeout(reject, time, new Error(error));
		}),
	]).finally(() => clearTimeout(timer));
};

async function fireResponseHook(hook, hookList, parameters) {
	if (!Array.isArray(hookList) || hookList.length === 0) {
		return;
	}

	for (const hookObject of hookList) {
		if (typeof hookObject.method === 'function') {
			// Skip remaining hooks if headers have been sent
			if (parameters.res.headersSent) {
				return;
			}
			// eslint-disable-next-line
            await hookObject.method(parameters);
		} else if (global.env === 'development') {
			winston.warn(`[plugins] Expected method for hook '${hook}' in plugin '${hookObject.id}' not found, skipping.`);
		}
	}
}
