'use strict';

/**
 * Checks localStorage and provides a fallback if it doesn't exist or is disabled
 */
define('storage', () => {
	function Storage() {
		this._store = {};
		this._keys = [];
	}

	Storage.prototype.isMock = true;
	Storage.prototype.setItem = function (key, value) {
		key = String(key);
		if (!this._keys.includes(key)) {
			this._keys.push(key);
		}

		this._store[key] = value;
	};

	Storage.prototype.getItem = function (key) {
		key = String(key);
		if (!this._keys.includes(key)) {
			return null;
		}

		return this._store[key];
	};

	Storage.prototype.removeItem = function (key) {
		key = String(key);
		this._keys = this._keys.filter(x => x !== key);
		this._store[key] = null;
	};

	Storage.prototype.clear = function () {
		this._keys = [];
		this._store = {};
	};

	Storage.prototype.key = function (n) {
		n = Number.parseInt(n, 10) || 0;
		return this._keys[n];
	};

	if (Object.defineProperty) {
		Object.defineProperty(Storage.prototype, 'length', {
			get() {
				return this._keys.length;
			},
		});
	}

	let storage;
	const item = Date.now().toString();

	try {
		storage = window.localStorage;
		storage.setItem(item, item);
		if (storage.getItem(item) !== item) {
			throw new Error('localStorage behaved unexpectedly');
		}

		storage.removeItem(item);

		return storage;
	} catch (error) {
		console.warn(error);
		console.warn('localStorage failed, falling back on sessionStorage');

		// See if sessionStorage works, and if so, return that
		try {
			storage = window.sessionStorage;
			storage.setItem(item, item);
			if (storage.getItem(item) !== item) {
				throw new Error('sessionStorage behaved unexpectedly');
			}

			storage.removeItem(item);

			return storage;
		} catch (error) {
			console.warn(error);
			console.warn('sessionStorage failed, falling back on memory storage');

			// Return an object implementing mock methods
			return new Storage();
		}
	}
});
