// Import LRU from 'lru-cache';
import LRU from 'lru-cache';
// Lru-cache@7 deprecations
import winston from 'winston';
import chalk from 'chalk';
// Pubsub import should occur after import of chalk
import pubsub from '../pubsub';

/* Can extend the key and value types here */
type keyType = string;
type valueType = string;

type CacheBB = {
	name?: string;
	hits: number;
	misses: number;
	enabled?: boolean;
	set: (key: keyType, value: valueType, ttl?: number) => void;
	get: (key: keyType) => undefined | valueType;
	reset: () => void;
	clear: () => void;
	del: (keys: keyType[]) => void;
	delete: (keys: keyType[]) => void;
	getUnCachedKeys: (keys: keyType[], cachedData: Map<keyType, valueType>) => keyType[];
	dump: () => Array<[ keyType, LRU.Entry<valueType> ]>;
	peek: (key: keyType) => undefined | valueType;
};
type Options = LRU.Options<keyType, valueType> & {name?: string; enabled?: boolean};

function cacheCreate(options: Options) {
	// Sometimes we kept passing in `length` with no corresponding `maxSize`.
	// This is now enforced in v7; drop superfluous property
	if (options.hasOwnProperty('length') && !options.hasOwnProperty('maxSize')) {
		winston.warn(`[cache/init(${options.name})] ${chalk.white.bgRed.bold('DEPRECATION')} ${chalk.yellow('length')} was passed in without a corresponding ${chalk.yellow('maxSize')}. Both are now required as of lru-cache@7.0.0.`);
		delete options.length;
	}

	const deprecations = new Map<string, string>([
		['stale', 'allowStale'],
		['maxAge', 'ttl'],
		['length', 'sizeCalculation'],
	]);
	for (const [oldProperty, newProperty] of deprecations.entries()) {
		if (options.hasOwnProperty(oldProperty) && !options.hasOwnProperty(newProperty)) {
			winston.warn(`[cache/init(${options.name})] ${chalk.white.bgRed.bold('DEPRECATION')} The option ${chalk.yellow(oldProperty)} has been deprecated as of lru-cache@7.0.0. Please change this to ${chalk.yellow(newProperty)} instead.`);
			/* Can pull the types of stale, maxAge, and length from the lru-cache documentation */
			options[newProperty] = options[oldProperty] as (boolean | number);
			delete options[oldProperty];
		}
	}

	const lruCache = new LRU<keyType, valueType>(options);

	const cache = {} as CacheBB;
	cache.name = options.name;
	cache.hits = 0;
	cache.misses = 0;
	cache.enabled = options.hasOwnProperty('enabled') ? options.enabled : true;

	// Expose properties while keeping backwards compatibility
	const propertyMap = new Map([
		['length', 'calculatedSize'],
		['calculatedSize', 'calculatedSize'],
		['max', 'max'],
		['maxSize', 'maxSize'],
		['itemCount', 'size'],
		['size', 'size'],
		['ttl', 'ttl'],
	]);
	for (const [cacheProperty, lruProperty] of propertyMap.entries()) {
		Object.defineProperty(cache, cacheProperty, {
			get() {
				return lruCache[lruProperty] as valueType;
			},
			configurable: true,
			enumerable: true,
		});
	}

	cache.set = function (key, value, ttl?: number) {
		if (!cache.enabled) {
			return;
		}

		const options = ttl ? {ttl} : {};
		lruCache.set.apply(lruCache, [key, value, options]);
	};

	cache.get = function (key) {
		if (!cache.enabled) {
			return undefined;
		}

		const data = lruCache.get(key);
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

		pubsub.publish(`${cache.name}:lruCache:del`, keys);
		for (const key of keys) {
			lruCache.delete(key);
		}
	};

	cache.delete = cache.del;

	function localReset() {
		lruCache.clear();
		cache.hits = 0;
		cache.misses = 0;
	}

	cache.reset = function () {
		pubsub.publish(`${cache.name}:lruCache:reset`);
		localReset();
	};

	cache.clear = cache.reset;

	pubsub.on(`${cache.name}:lruCache:reset`, () => {
		localReset();
	});

	pubsub.on(`${cache.name}:lruCache:del`, (keys: keyType[]) => {
		if (Array.isArray(keys)) {
			for (const key of keys) {
				lruCache.delete(key);
			}
		}
	});

	cache.getUnCachedKeys = function (keys, cachedData) {
		if (!cache.enabled) {
			return keys;
		}

		let data: valueType | undefined;
		let isCached: boolean;
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
		return lruCache.dump();
	};

	cache.peek = function (key) {
		return lruCache.peek(key);
	};

	return cache;
}

export = cacheCreate;
