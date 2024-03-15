
'use strict';

const user = require('../user');
const meta = require('../meta');
const events = require('../events');

const SocketExclude = module.exports;

SocketExclude.validate = async function (socket, data) {
	return meta.blacklist.validate(data.rules);
};

SocketExclude.save = async function (socket, rules) {
	await exclude(socket, 'save', rules);
};

SocketExclude.addRule = async function (socket, rule) {
	await exclude(socket, 'addRule', rule);
};

async function exclude(socket, method, rule) {
	const isAdminOrGlobalModule = await user.isAdminOrGlobalMod(socket.uid);
	if (!isAdminOrGlobalModule) {
		throw new Error('[[error:no-privileges]]');
	}

	await meta.blacklist[method](rule);
	await events.log({
		type: `ip-blacklist-${method}`,
		uid: socket.uid,
		ip: socket.ip,
		rule,
	});
}

require('../promisify')(SocketExclude);
