'use strict';

module.exports = function (options) {
	const TTLCache = require('@isaacs/ttlcache');
	const pubsub = require('../pubsub');

	const ttlCache = new TTLCache(options);

	const cache = {};
	cache.name = options.name;
	cache.hits = 0;
	cache.misses = 0;
	cache.enabled = options.hasOwnProperty('enabled') ? options.enabled : true;
	const cacheSet = ttlCache.set;

	// Expose properties
	const propertyMap = new Map([
		['max', 'max'],
		['itemCount', 'size'],
		['size', 'size'],
		['ttl', 'ttl'],
	]);
	for (const [cacheProperty, ttlProperty] of propertyMap.entries()) {
		Object.defineProperty(cache, cacheProperty, {
			get() {
				return ttlCache[ttlProperty];
			},
			configurable: true,
			enumerable: true,
		});
	}

	cache.set = function (key, value, ttl) {
		if (!cache.enabled) {
			return;
		}

		const options = {};
		if (ttl) {
			options.ttl = ttl;
		}

		cacheSet.apply(ttlCache, [key, value, options]);
	};

	cache.get = function (key) {
		if (!cache.enabled) {
			return undefined;
		}

		const data = ttlCache.get(key);
		if (data === undefined) {
			cache.misses += 1;
		} else {
			cache.hits += 1;
		}

		return data;
	};

	cache.del = function (keys) {
		if (!Array.isArray(keys)) {
			keys = [keys];
		}

		pubsub.publish(`${cache.name}:ttlCache:del`, keys);
		for (const key of keys) {
			ttlCache.delete(key);
		}
	};

	cache.delete = cache.del;

	cache.reset = function () {
		pubsub.publish(`${cache.name}:ttlCache:reset`);
		localReset();
	};

	cache.clear = cache.reset;

	function localReset() {
		ttlCache.clear();
		cache.hits = 0;
		cache.misses = 0;
	}

	pubsub.on(`${cache.name}:ttlCache:reset`, () => {
		localReset();
	});

	pubsub.on(`${cache.name}:ttlCache:del`, keys => {
		if (Array.isArray(keys)) {
			for (const key of keys) {
				ttlCache.delete(key);
			}
		}
	});

	cache.getUnCachedKeys = function (keys, cachedData) {
		if (!cache.enabled) {
			return keys;
		}

		let data;
		let isCached;
		const unCachedKeys = keys.filter(key => {
			data = cache.get(key);
			isCached = data !== undefined;
			if (isCached) {
				cachedData[key] = data;
			}

			return !isCached;
		});

		const hits = keys.length - unCachedKeys.length;
		const misses = keys.length - hits;
		cache.hits += hits;
		cache.misses += misses;
		return unCachedKeys;
	};

	cache.dump = function () {
		return Array.from(ttlCache.entries());
	};

	cache.peek = function (key) {
		return ttlCache.get(key, {updateAgeOnGet: false});
	};

	return cache;
};
