'use strict';

const cacheCreate = require('./cache/lru');

module.exports = cacheCreate({
	name: 'local',
	max: 40_000,
	ttl: 0,
});
