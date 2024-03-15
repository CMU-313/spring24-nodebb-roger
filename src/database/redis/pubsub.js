'use strict';

const util = require('node:util');
const {EventEmitter} = require('node:events');
const nconf = require('nconf');
const winston = require('winston');
const connection = require('./connection');

let channelName;
const PubSub = function () {
	const self = this;
	channelName = `db:${nconf.get('redis:database')}:pubsub_channel`;
	self.queue = [];
	connection.connect().then(client => {
		self.subClient = client;
		self.subClient.subscribe(channelName);
		self.subClient.on('message', (channel, message) => {
			if (channel !== channelName) {
				return;
			}

			try {
				const message_ = JSON.parse(message);
				self.emit(message_.event, message_.data);
			} catch (error) {
				winston.error(error.stack);
			}
		});
	});

	connection.connect().then(client => {
		self.pubClient = client;
		for (const payload of self.queue) {
			client.publish(channelName, payload);
		}

		self.queue.length = 0;
	});
};

util.inherits(PubSub, EventEmitter);

PubSub.prototype.publish = function (event, data) {
	const payload = JSON.stringify({event, data});
	if (this.pubClient) {
		this.pubClient.publish(channelName, payload);
	} else {
		this.queue.push(payload);
	}
};

module.exports = new PubSub();
