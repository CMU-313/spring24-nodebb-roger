"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
// Import LRU from 'lru-cache';
const lru_cache_1 = __importDefault(require("lru-cache"));
// Lru-cache@7 deprecations
const winston_1 = __importDefault(require("winston"));
const chalk_1 = __importDefault(require("chalk"));
// Pubsub import should occur after import of chalk
const pubsub_1 = __importDefault(require("../pubsub"));
function cacheCreate(options) {
    // Sometimes we kept passing in `length` with no corresponding `maxSize`.
    // This is now enforced in v7; drop superfluous property
    if (options.hasOwnProperty('length') && !options.hasOwnProperty('maxSize')) {
        winston_1.default.warn(`[cache/init(${options.name})] ${chalk_1.default.white.bgRed.bold('DEPRECATION')} ${chalk_1.default.yellow('length')} was passed in without a corresponding ${chalk_1.default.yellow('maxSize')}. Both are now required as of lru-cache@7.0.0.`);
        delete options.length;
    }
    const deprecations = new Map([
        ['stale', 'allowStale'],
        ['maxAge', 'ttl'],
        ['length', 'sizeCalculation'],
    ]);
    for (const [oldProperty, newProperty] of deprecations.entries()) {
        if (options.hasOwnProperty(oldProperty) && !options.hasOwnProperty(newProperty)) {
            winston_1.default.warn(`[cache/init(${options.name})] ${chalk_1.default.white.bgRed.bold('DEPRECATION')} The option ${chalk_1.default.yellow(oldProperty)} has been deprecated as of lru-cache@7.0.0. Please change this to ${chalk_1.default.yellow(newProperty)} instead.`);
            /* Can pull the types of stale, maxAge, and length from the lru-cache documentation */
            options[newProperty] = options[oldProperty];
            delete options[oldProperty];
        }
    }
    const lruCache = new lru_cache_1.default(options);
    const cache = {};
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
                return lruCache[lruProperty];
            },
            configurable: true,
            enumerable: true,
        });
    }
    cache.set = function (key, value, ttl) {
        if (!cache.enabled) {
            return;
        }
        const options = ttl ? { ttl } : {};
        lruCache.set.apply(lruCache, [key, value, options]);
    };
    cache.get = function (key) {
        if (!cache.enabled) {
            return undefined;
        }
        const data = lruCache.get(key);
        if (data === undefined) {
            cache.misses += 1;
        }
        else {
            cache.hits += 1;
        }
        return data;
    };
    cache.del = function (keys) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        pubsub_1.default.publish(`${cache.name}:lruCache:del`, keys);
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
        pubsub_1.default.publish(`${cache.name}:lruCache:reset`);
        localReset();
    };
    cache.clear = cache.reset;
    pubsub_1.default.on(`${cache.name}:lruCache:reset`, () => {
        localReset();
    });
    pubsub_1.default.on(`${cache.name}:lruCache:del`, (keys) => {
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
        return lruCache.dump();
    };
    cache.peek = function (key) {
        return lruCache.peek(key);
    };
    return cache;
}
module.exports = cacheCreate;
