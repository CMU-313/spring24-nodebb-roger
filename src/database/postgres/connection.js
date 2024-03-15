'use strict';

const nconf = require('nconf');
const winston = require('winston');
const _ = require('lodash');

const connection = module.exports;

connection.getConnectionOptions = function (postgres) {
	postgres ||= nconf.get('postgres');
	// Sensible defaults for PostgreSQL, if not set
	postgres.host ||= '127.0.0.1';

	postgres.port ||= 5432;

	const databaseName = postgres.database;
	if (databaseName === undefined || databaseName === '') {
		winston.warn('You have no database name, using "nodebb"');
		postgres.database = 'nodebb';
	}

	const connOptions = {
		host: postgres.host,
		port: postgres.port,
		user: postgres.username,
		password: postgres.password,
		database: postgres.database,
		ssl: String(postgres.ssl) === 'true',
	};

	return _.merge(connOptions, postgres.options || {});
};

connection.connect = async function (options) {
	const {Pool} = require('pg');
	const connOptions = connection.getConnectionOptions(options);
	const database = new Pool(connOptions);
	await database.connect();
	return database;
};

require('../../promisify')(connection);
