'use strict';

/*
 * Logger module: ability to dynamically turn on/off logging for http requests & socket.io events
 */

const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const winston = require('winston');
const morgan = require('morgan');
const file = require('./file');
const meta = require('./meta');

const options = {
	/*
     * State used by Logger
     */
	express: {
		app: {},
		set: 0,
		ofn: null,
	},
	streams: {
		log: {f: process.stdout},
	},
};

/* -- Logger -- */
const Logger = module.exports;

Logger.init = function (app) {
	options.express.app = app;
	/* Open log file stream & initialize express logging if meta.config.logger* variables are set */
	Logger.setup();
};

Logger.setup = function () {
	Logger.setup_one('loggerPath', meta.config.loggerPath);
};

Logger.setup_one = function (key, value) {
	/*
     * 1. Open the logger stream: stdout or file
     * 2. Re-initialize the express logger hijack
     */
	if (key === 'loggerPath') {
		Logger.setup_one_log(value);
		Logger.express_open();
	}
};

Logger.setup_one_log = function (value) {
	/*
     * If logging is currently enabled, create a stream.
     * Otherwise, close the current stream
     */
	if (meta.config.loggerStatus > 0 || meta.config.loggerIOStatus) {
		const stream = Logger.open(value);
		options.streams.log.f = stream ? stream : process.stdout;
	} else {
		Logger.close(options.streams.log);
	}
};

Logger.open = function (value) {
	/* Open the streams to log to: either a path or stdout */
	let stream;
	if (value) {
		if (file.existsSync(value)) {
			const stats = fs.statSync(value);
			if (stats) {
				stream = stats.isDirectory() ? fs.createWriteStream(path.join(value, 'nodebb.log'), {flags: 'a'}) : fs.createWriteStream(value, {flags: 'a'});
			}
		} else {
			stream = fs.createWriteStream(value, {flags: 'a'});
		}

		if (stream) {
			stream.on('error', error => {
				winston.error(error.stack);
			});
		}
	} else {
		stream = process.stdout;
	}

	return stream;
};

Logger.close = function (stream) {
	if (stream.f !== process.stdout && stream.f) {
		stream.end();
	}

	stream.f = null;
};

Logger.monitorConfig = function (socket, data) {
	/*
     * This monitor's when a user clicks "save" in the Logger section of the admin panel
     */
	Logger.setup_one(data.key, data.value);
	Logger.io_close(socket);
	Logger.io(socket);
};

Logger.express_open = function () {
	if (options.express.set !== 1) {
		options.express.set = 1;
		options.express.app.use(Logger.expressLogger);
	}

	/*
     * Always initialize "ofn" (original function) with the original logger function
     */
	options.express.ofn = morgan('combined', {stream: options.streams.log.f});
};

Logger.expressLogger = function (request, res, next) {
	/*
     * The new express.logger
     *
     * This hijack allows us to turn logger on/off dynamically within express
     */
	if (meta.config.loggerStatus > 0) {
		return options.express.ofn(request, res, next);
	}

	return next();
};

Logger.prepare_io_string = function (_type, _uid, _arguments) {
	/*
     * This prepares the output string for intercepted socket.io events
     *
     * The format is: io: <uid> <event> <args>
     */
	try {
		return `io: ${_uid} ${_type} ${util.inspect(Array.prototype.slice.call(_arguments), {depth: 3})}\n`;
	} catch (error) {
		winston.info('Logger.prepare_io_string: Failed', error);
		return 'error';
	}
};

Logger.io_close = function (socket) {
	/*
     * Restore all hijacked sockets to their original emit/on functions
     */
	if (!socket || !socket.io || !socket.io.sockets || !socket.io.sockets.sockets) {
		return;
	}

	const clientsMap = socket.io.sockets.sockets;

	for (const [, client] of clientsMap) {
		if (client.oEmit && client.oEmit !== client.emit) {
			client.emit = client.oEmit;
		}

		if (client.$onevent && client.$onevent !== client.onevent) {
			client.onevent = client.$onevent;
		}
	}
};

Logger.io = function (socket) {
	/*
     * Go through all of the currently established sockets & hook their .emit/.on
     */

	if (!socket || !socket.io || !socket.io.sockets || !socket.io.sockets.sockets) {
		return;
	}

	const clientsMap = socket.io.sockets.sockets;
	for (const [, socketObject] of clientsMap) {
		Logger.io_one(socketObject, socketObject.uid);
	}
};

Logger.io_one = function (socket, uid) {
	/*
     * This function replaces a socket's .emit/.on functions in order to intercept events
     */
	function override(method, name, errorMessage) {
		return (...arguments_) => {
			if (options.streams.log.f) {
				options.streams.log.f.write(Logger.prepare_io_string(name, uid, arguments_));
			}

			try {
				method.apply(socket, arguments_);
			} catch (error) {
				winston.info(errorMessage, error);
			}
		};
	}

	if (socket && meta.config.loggerIOStatus > 0) {
		// Courtesy of: http://stackoverflow.com/a/9674248
		socket.oEmit = socket.emit;
		const {emit} = socket;
		socket.emit = override(emit, 'emit', 'Logger.io_one: emit.apply: Failed');

		socket.$onvent = socket.onevent;
		const $onevent = socket.onevent;
		socket.onevent = override($onevent, 'on', 'Logger.io_one: $emit.apply: Failed');
	}
};
