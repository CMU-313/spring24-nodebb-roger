'use strict';

const EventEmitter = require('node:events');
const nconf = require('nconf');

let real;
let noCluster;
let singleHost;

function get() {
	if (real) {
		return real;
	}

	let pubsub;

	if (!nconf.get('isCluster')) {
		if (noCluster) {
			real = noCluster;
			return real;
		}

		noCluster = new EventEmitter();
		noCluster.publish = noCluster.emit.bind(noCluster);
		pubsub = noCluster;
	} else if (nconf.get('singleHostCluster')) {
		if (singleHost) {
			real = singleHost;
			return real;
		}

		singleHost = new EventEmitter();
		if (process.send) {
			singleHost.publish = function (event, data) {
				process.send({
					action: 'pubsub',
					event,
					data,
				});
			};

			process.on('message', message => {
				if (message && typeof message === 'object' && message.action === 'pubsub') {
					singleHost.emit(message.event, message.data);
				}
			});
		} else {
			singleHost.publish = singleHost.emit.bind(singleHost);
		}

		pubsub = singleHost;
	} else if (nconf.get('redis')) {
		pubsub = require('./database/redis/pubsub');
	} else {
		throw new Error('[[error:redis-required-for-pubsub]]');
	}

	real = pubsub;
	return pubsub;
}

module.exports = {
	publish(event, data) {
		get().publish(event, data);
	},
	on(event, callback) {
		get().on(event, callback);
	},
	removeAllListeners(event) {
		get().removeAllListeners(event);
	},
	reset() {
		real = null;
	},
};
