'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const util = require('node:util');
const bcrypt = require('bcryptjs');
const fork = require('./meta/debugFork');

function forkChild(message, callback) {
	const child = fork(path.join(__dirname, 'password'));

	child.on('message', message_ => {
		callback(message_.err ? new Error(message_.err) : null, message_.result);
	});
	child.on('error', error => {
		console.error(error.stack);
		callback(error);
	});

	child.send(message);
}

const forkChildAsync = util.promisify(forkChild);

exports.hash = async function (rounds, password) {
	password = crypto.createHash('sha512').update(password).digest('hex');
	return await forkChildAsync({type: 'hash', rounds, password});
};

exports.compare = async function (password, hash, shaWrapped) {
	const fakeHash = await getFakeHash();

	if (shaWrapped) {
		password = crypto.createHash('sha512').update(password).digest('hex');
	}

	return await forkChildAsync({type: 'compare', password, hash: hash || fakeHash});
};

let fakeHashCache;
async function getFakeHash() {
	if (fakeHashCache) {
		return fakeHashCache;
	}

	fakeHashCache = await exports.hash(12, Math.random().toString());
	return fakeHashCache;
}

// Child process
process.on('message', message => {
	if (message.type === 'hash') {
		tryMethod(hashPassword, message);
	} else if (message.type === 'compare') {
		tryMethod(compare, message);
	}
});

async function tryMethod(method, message) {
	try {
		const result = await method(message);
		process.send({result});
	} catch (error) {
		process.send({err: error.message});
	} finally {
		process.disconnect();
	}
}

async function hashPassword(message) {
	const salt = await bcrypt.genSalt(Number.parseInt(message.rounds, 10));
	const hash = await bcrypt.hash(message.password, salt);
	return hash;
}

async function compare(message) {
	return await bcrypt.compare(String(message.password || ''), String(message.hash || ''));
}

require('./promisify')(exports);
