'use strict';

const os = require('node:os');
const util = require('node:util');
const nconf = require('nconf');
const winston = require('winston');
const validator = require('validator');
const cookieParser = require('cookie-parser')(nconf.get('secret'));
const db = require('../database');
const user = require('../user');
const logger = require('../logger');
const plugins = require('../plugins');
const ratelimit = require('../middleware/ratelimit');

const Namespaces = Object.create(null);

const Sockets = module.exports;

Sockets.init = async function (server) {
	requireModules();

	const SocketIO = require('socket.io').Server;
	const io = new SocketIO({
		path: `${nconf.get('relative_path')}/socket.io`,
	});

	if (nconf.get('isCluster')) {
		if (nconf.get('redis')) {
			const adapter = await require('../database/redis').socketAdapter();
			io.adapter(adapter);
		} else {
			winston.warn('clustering detected, you should setup redis!');
		}
	}

	io.use(authorize);

	io.on('connection', onConnection);

	const options = {
		transports: nconf.get('socket.io:transports') || ['polling', 'websocket'],
		cookie: false,
	};
	/*
     * Restrict socket.io listener to cookie domain. If none is set, infer based on url.
     * Production only so you don't get accidentally locked out.
     * Can be overridden via config (socket.io:origins)
     */
	if (process.env.NODE_ENV !== 'development' || nconf.get('socket.io:cors')) {
		const origins = nconf.get('socket.io:origins');
		options.cors = nconf.get('socket.io:cors') || {
			origin: origins,
			methods: ['GET', 'POST'],
			allowedHeaders: ['content-type'],
		};
		winston.info(`[socket.io] Restricting access to origin: ${origins}`);
	}

	io.listen(server, options);
	Sockets.server = io;
};

function onConnection(socket) {
	socket.ip = (socket.request.headers['x-forwarded-for'] || socket.request.connection.remoteAddress || '').split(',')[0];
	socket.request.ip = socket.ip;
	logger.io_one(socket, socket.uid);

	onConnect(socket);
	socket.onAny((event, ...arguments_) => {
		const payload = {data: [event].concat(arguments_)};
		const als = require('../als');
		als.run({uid: socket.uid}, onMessage, socket, payload);
	});

	socket.on('disconnect', () => {
		onDisconnect(socket);
	});
}

function onDisconnect(socket) {
	require('./uploads').clear(socket.id);
	plugins.hooks.fire('action:sockets.disconnect', {socket});
}

async function onConnect(socket) {
	try {
		await validateSession(socket, '[[error:invalid-session]]');
	} catch (error) {
		if (error.message === '[[error:invalid-session]]') {
			socket.emit('event:invalid_session');
		}

		return;
	}

	if (socket.uid) {
		socket.join(`uid_${socket.uid}`);
		socket.join('online_users');
	} else {
		socket.join('online_guests');
	}

	socket.join(`sess_${socket.request.signedCookies[nconf.get('sessionKey')]}`);
	socket.emit('checkSession', socket.uid);
	socket.emit('setHostname', os.hostname());
	plugins.hooks.fire('action:sockets.connect', {socket});
}

async function onMessage(socket, payload) {
	if (payload.data.length === 0) {
		return winston.warn('[socket.io] Empty payload');
	}

	const eventName = payload.data[0];
	const parameters = typeof payload.data[1] === 'function' ? {} : payload.data[1];
	const callback = typeof payload.data.at(-1) === 'function' ? payload.data.at(-1) : function () {};

	if (!eventName) {
		return winston.warn('[socket.io] Empty method name');
	}

	const parts = eventName.toString().split('.');
	const namespace = parts[0];
	const methodToCall = parts.reduce((previous, current) => {
		if (previous !== null && previous[current] && (!previous.hasOwnProperty || previous.hasOwnProperty(current))) {
			return previous[current];
		}

		return null;
	}, Namespaces);

	if (!methodToCall || typeof methodToCall !== 'function') {
		if (process.env.NODE_ENV === 'development') {
			winston.warn(`[socket.io] Unrecognized message: ${eventName}`);
		}

		const escapedName = validator.escape(String(eventName));
		return callback({message: `[[error:invalid-event, ${escapedName}]]`});
	}

	socket.previousEvents = socket.previousEvents || [];
	socket.previousEvents.push(eventName);
	if (socket.previousEvents.length > 20) {
		socket.previousEvents.shift();
	}

	if (!eventName.startsWith('admin.') && ratelimit.isFlooding(socket)) {
		winston.warn(`[socket.io] Too many emits! Disconnecting uid : ${socket.uid}. Events : ${socket.previousEvents}`);
		return socket.disconnect();
	}

	try {
		await checkMaintenance(socket);
		await validateSession(socket, '[[error:revalidate-failure]]');

		if (Namespaces[namespace].before) {
			await Namespaces[namespace].before(socket, eventName, parameters);
		}

		if (methodToCall.constructor && methodToCall.constructor.name === 'AsyncFunction') {
			const result = await methodToCall(socket, parameters);
			callback(null, result);
		} else {
			methodToCall(socket, parameters, (error, result) => {
				callback(error ? {message: error.message} : null, result);
			});
		}
	} catch (error) {
		winston.error(`${eventName}\n${error.stack ? error.stack : error.message}`);
		callback({message: error.message});
	}
}

function requireModules() {
	const modules = [
		'admin',
		'categories',
		'groups',
		'meta',
		'modules',
		'notifications',
		'plugins',
		'posts',
		'topics',
		'user',
		'blacklist',
		'uploads',
	];

	for (const module of modules) {
		Namespaces[module] = require(`./${module}`);
	}
}

async function checkMaintenance(socket) {
	const meta = require('../meta');
	if (!meta.config.maintenanceMode) {
		return;
	}

	const isAdmin = await user.isAdministrator(socket.uid);
	if (isAdmin) {
		return;
	}

	const validator = require('validator');
	throw new Error(`[[pages:maintenance.text, ${validator.escape(String(meta.config.title || 'NodeBB'))}]]`);
}

const getSessionAsync = util.promisify(
	(sid, callback) => db.sessionStore.get(sid, (error, sessionObject) => callback(error, sessionObject || null)),
);

async function validateSession(socket, errorMessage) {
	const request = socket.request;
	const {sessionId} = await plugins.hooks.fire('filter:sockets.sessionId', {
		sessionId: request.signedCookies ? request.signedCookies[nconf.get('sessionKey')] : null,
		request,
	});

	if (!sessionId) {
		return;
	}

	const sessionData = await getSessionAsync(sessionId);

	if (!sessionData) {
		throw new Error(errorMessage);
	}

	await plugins.hooks.fire('static:sockets.validateSession', {
		req: request,
		socket,
		session: sessionData,
	});
}

const cookieParserAsync = util.promisify((request, callback) => cookieParser(request, {}, error => callback(error)));

async function authorize(socket, callback) {
	const {request} = socket;

	if (!request) {
		return callback(new Error('[[error:not-authorized]]'));
	}

	await cookieParserAsync(request);

	const {sessionId} = await plugins.hooks.fire('filter:sockets.sessionId', {
		sessionId: request.signedCookies ? request.signedCookies[nconf.get('sessionKey')] : null,
		request,
	});

	const sessionData = await getSessionAsync(sessionId);

	if (sessionData && sessionData.passport && sessionData.passport.user) {
		request.session = sessionData;
		socket.uid = Number.parseInt(sessionData.passport.user, 10);
	} else {
		socket.uid = 0;
	}

	request.uid = socket.uid;
	callback();
}

Sockets.in = function (room) {
	return Sockets.server && Sockets.server.in(room);
};

Sockets.getUserSocketCount = function (uid) {
	return Sockets.getCountInRoom(`uid_${uid}`);
};

Sockets.getCountInRoom = function (room) {
	if (!Sockets.server) {
		return 0;
	}

	const roomMap = Sockets.server.sockets.adapter.rooms.get(room);
	return roomMap ? roomMap.size : 0;
};

Sockets.warnDeprecated = (socket, replacement) => {
	if (socket.previousEvents && socket.emit) {
		socket.emit('event:deprecated_call', {
			eventName: socket.previousEvents.at(-1),
			replacement,
		});
	}

	winston.warn(`[deprecated]\n ${new Error('-').stack.split('\n').slice(2, 5).join('\n')}\n     use ${replacement}`);
};
