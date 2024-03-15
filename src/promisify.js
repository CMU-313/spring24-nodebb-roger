'use strict';

const util = require('node:util');

module.exports = function (theModule, ignoreKeys) {
	ignoreKeys ||= [];
	function isCallbackedFunction(function_) {
		if (typeof function_ !== 'function') {
			return false;
		}

		const string_ = function_.toString().split('\n')[0];
		return string_.includes('callback)');
	}

	function isAsyncFunction(function_) {
		return function_ && function_.constructor && function_.constructor.name === 'AsyncFunction';
	}

	function promisifyRecursive(module) {
		if (!module) {
			return;
		}

		const keys = Object.keys(module);
		for (const key of keys) {
			if (ignoreKeys.includes(key)) {
				continue;
			}

			if (isAsyncFunction(module[key])) {
				module[key] = wrapCallback(module[key], util.callbackify(module[key]));
			} else if (isCallbackedFunction(module[key])) {
				module[key] = wrapPromise(module[key], util.promisify(module[key]));
			} else if (typeof module[key] === 'object') {
				promisifyRecursive(module[key]);
			}
		}
	}

	function wrapCallback(origFunction, callbackFunction) {
		return async function wrapperCallback(...arguments_) {
			if (arguments_.length > 0 && typeof arguments_.at(-1) === 'function') {
				const callback = arguments_.pop();
				arguments_.push((error, res) => (res === undefined ? callback(error) : callback(error, res)));
				return callbackFunction(...arguments_);
			}

			return origFunction(...arguments_);
		};
	}

	function wrapPromise(origFunction, promiseFunction) {
		return function wrapperPromise(...arguments_) {
			if (arguments_.length > 0 && typeof arguments_.at(-1) === 'function') {
				return origFunction(...arguments_);
			}

			return promiseFunction(...arguments_);
		};
	}

	promisifyRecursive(theModule);
};
