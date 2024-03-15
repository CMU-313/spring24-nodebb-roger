'use strict';

const cacheCreate = require('../cache/ttl');
const meta = require('../meta');
const user = require('../user');
const helpers = require('./helpers');

const cache = cacheCreate({
	ttl: meta.config.uploadRateLimitCooldown * 1000,
});

exports.clearCache = function () {
	cache.clear();
};

exports.ratelimit = helpers.try(async (request, res, next) => {
	const {uid} = request;
	if (!meta.config.uploadRateLimitThreshold || (uid && await user.isAdminOrGlobalMod(uid))) {
		return next();
	}

	const count = (cache.get(`${request.ip}:uploaded_file_count`) || 0) + request.files.files.length;
	if (count > meta.config.uploadRateLimitThreshold) {
		return next(new Error(['[[error:upload-ratelimit-reached]]']));
	}

	cache.set(`${request.ip}:uploaded_file_count`, count);
	next();
});

