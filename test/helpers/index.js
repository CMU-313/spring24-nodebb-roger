'use strict';

const fs = require('node:fs');
const request = require('request');
const requestAsync = require('request-promise-native');
const nconf = require('nconf');
const winston = require('winston');
const utils = require('../../src/utils');

const helpers = module.exports;

helpers.getCsrfToken = async jar => {
	const {csrf_token: token} = await requestAsync({
		url: `${nconf.get('url')}/api/config`,
		json: true,
		jar,
	});

	return token;
};

helpers.request = async function (method, uri, options) {
	const ignoreMethods = ['GET', 'HEAD', 'OPTIONS'];
	const lowercaseMethod = String(method).toLowerCase();
	let csrf_token;
	if (!ignoreMethods.some(method => method.toLowerCase() === lowercaseMethod)) {
		csrf_token = await helpers.getCsrfToken(options.jar);
	}

	return new Promise((resolve, reject) => {
		options.headers = options.headers || {};
		if (csrf_token) {
			options.headers['x-csrf-token'] = csrf_token;
		}

		request[lowercaseMethod](`${nconf.get('url')}${uri}`, options, (error, res, body) => {
			if (error) {
				reject(error);
			} else {
				resolve({res, body});
			}
		});
	});
};

helpers.loginUser = function (username, password, callback) {
	const jar = request.jar();

	request({
		url: `${nconf.get('url')}/api/config`,
		json: true,
		jar,
	}, (error, res, body) => {
		if (error || res.statusCode !== 200) {
			return callback(error || new Error('[[error:invalid-response]]'));
		}

		const {csrf_token} = body;
		request.post(`${nconf.get('url')}/login`, {
			form: {
				username,
				password,
			},
			json: true,
			jar,
			headers: {
				'x-csrf-token': csrf_token,
			},
		}, (error, res, body) => {
			if (error) {
				return callback(error || new Error('[[error:invalid-response]]'));
			}

			callback(null, {
				jar, res, body, csrf_token,
			});
		});
	});
};

helpers.logoutUser = function (jar, callback) {
	request({
		url: `${nconf.get('url')}/api/config`,
		json: true,
		jar,
	}, (error, response, body) => {
		if (error) {
			return callback(error, response, body);
		}

		request.post(`${nconf.get('url')}/logout`, {
			form: {},
			json: true,
			jar,
			headers: {
				'x-csrf-token': body.csrf_token,
			},
		}, (error, response, body) => {
			callback(error, response, body);
		});
	});
};

helpers.connectSocketIO = function (res, callback) {
	const io = require('socket.io-client');
	let cookies = res.headers['set-cookie'];
	cookies = cookies.filter(c => /express.sid=[^;]+;/.test(c));
	const cookie = cookies[0];
	const socket = io(nconf.get('base_url'), {
		path: `${nconf.get('relative_path')}/socket.io`,
		extraHeaders: {
			Origin: nconf.get('url'),
			Cookie: cookie,
		},
	});

	socket.on('connect', () => {
		callback(null, socket);
	});

	socket.on('error', error => {
		callback(error);
	});
};

helpers.uploadFile = function (uploadEndPoint, filePath, body, jar, csrf_token, callback) {
	let formData = {
		files: [
			fs.createReadStream(filePath),
			fs.createReadStream(filePath), // See https://github.com/request/request/issues/2445
		],
	};
	formData = utils.merge(formData, body);
	request.post({
		url: uploadEndPoint,
		formData,
		json: true,
		jar,
		headers: {
			'x-csrf-token': csrf_token,
		},
	}, (error, res, body) => {
		if (error) {
			return callback(error);
		}

		if (res.statusCode !== 200) {
			winston.error(JSON.stringify(body));
		}

		callback(null, res, body);
	});
};

helpers.registerUser = function (data, callback) {
	const jar = request.jar();
	request({
		url: `${nconf.get('url')}/api/config`,
		json: true,
		jar,
	}, (error, response, body) => {
		if (error) {
			return callback(error);
		}

		if (!data.hasOwnProperty('password-confirm')) {
			data['password-confirm'] = data.password;
		}

		request.post(`${nconf.get('url')}/register`, {
			form: data,
			json: true,
			jar,
			headers: {
				'x-csrf-token': body.csrf_token,
			},
		}, (error, response, body) => {
			callback(error, jar, response, body);
		});
	});
};

// http://stackoverflow.com/a/14387791/583363
helpers.copyFile = function (source, target, callback) {
	let callbackCalled = false;

	const rd = fs.createReadStream(source);
	rd.on('error', error => {
		done(error);
	});
	const wr = fs.createWriteStream(target);
	wr.on('error', error => {
		done(error);
	});
	wr.on('close', () => {
		done();
	});
	rd.pipe(wr);

	function done(error) {
		if (!callbackCalled) {
			callback(error);
			callbackCalled = true;
		}
	}
};

helpers.invite = async function (body, uid, jar, csrf_token) {
	const res = await requestAsync.post(`${nconf.get('url')}/api/v3/users/${uid}/invites`, {
		jar,
		// Using "form" since client "api" module make requests with "application/x-www-form-urlencoded" content-type
		form: body,
		headers: {
			'x-csrf-token': csrf_token,
		},
		simple: false,
		resolveWithFullResponse: true,
	});

	res.body = JSON.parse(res.body);
	return {res, body};
};

helpers.createFolder = function (path, folderName, jar, csrf_token) {
	return requestAsync.put(`${nconf.get('url')}/api/v3/files/folder`, {
		jar,
		body: {
			path,
			folderName,
		},
		json: true,
		headers: {
			'x-csrf-token': csrf_token,
		},
		simple: false,
		resolveWithFullResponse: true,
	});
};

require('../../src/promisify')(helpers);
