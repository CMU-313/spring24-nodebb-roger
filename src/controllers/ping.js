'use strict';

const nconf = require('nconf');
const db = require('../database');

module.exports.ping = async function (request, res, next) {
	try {
		await db.getObject('config');
		res.status(200).send(request.path === `${nconf.get('relative_path')}/sping` ? 'healthy' : '200');
	} catch (error) {
		next(error);
	}
};
