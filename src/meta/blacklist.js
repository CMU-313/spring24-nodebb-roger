'use strict';

const ipaddr = require('ipaddr.js');
const winston = require('winston');
const _ = require('lodash');
const validator = require('validator');
const db = require('../database');
const pubsub = require('../pubsub');
const plugins = require('../plugins');
const analytics = require('../analytics');

const Exclude = module.exports;
Exclude._rules = {};

Exclude.load = async function () {
	let rules = await Exclude.get();
	rules = Exclude.validate(rules);

	winston.verbose(`[meta/blacklist] Loading ${rules.valid.length} blacklist rule(s)${rules.duplicateCount > 0 ? `, ignored ${rules.duplicateCount} duplicate(s)` : ''}`);
	if (rules.invalid.length > 0) {
		winston.warn(`[meta/blacklist] ${rules.invalid.length} invalid blacklist rule(s) were ignored.`);
	}

	Exclude._rules = {
		ipv4: rules.ipv4,
		ipv6: rules.ipv6,
		cidr: rules.cidr,
		cidr6: rules.cidr6,
	};
};

pubsub.on('blacklist:reload', Exclude.load);

Exclude.save = async function (rules) {
	await db.setObject('ip-blacklist-rules', {rules});
	await Exclude.load();
	pubsub.publish('blacklist:reload');
};

Exclude.get = async function () {
	const data = await db.getObject('ip-blacklist-rules');
	return data && data.rules;
};

Exclude.test = async function (clientIp) {
	// Some handy test addresses
	// clientIp = '2001:db8:85a3:0:0:8a2e:370:7334'; // IPv6
	// clientIp = '127.0.15.1'; // IPv4
	// clientIp = '127.0.15.1:3443'; // IPv4 with port strip port to not fail
	if (!clientIp) {
		return;
	}

	clientIp = clientIp.split(':').length === 2 ? clientIp.split(':')[0] : clientIp;

	let addr;
	try {
		addr = ipaddr.parse(clientIp);
	} catch (error) {
		winston.error(`[meta/blacklist] Error parsing client IP : ${clientIp}`);
		throw error;
	}

	if (
		!Exclude._rules.ipv4.includes(clientIp) // Not explicitly specified in ipv4 list
        && !Exclude._rules.ipv6.includes(clientIp) // Not explicitly specified in ipv6 list
        && !Exclude._rules.cidr.some(subnet => {
        	const cidr = ipaddr.parseCIDR(subnet);
        	if (addr.kind() !== cidr[0].kind()) {
        		return false;
        	}

        	return addr.match(cidr);
        }) // Not in a blacklisted IPv4 or IPv6 cidr range
	) {
		try {
			// To return test failure, pass back an error in callback
			await plugins.hooks.fire('filter:blacklist.test', {ip: clientIp});
		} catch (error) {
			analytics.increment('blacklist');
			throw error;
		}
	} else {
		const error = new Error('[[error:blacklisted-ip]]');
		error.code = 'blacklisted-ip';

		analytics.increment('blacklist');
		throw error;
	}
};

Exclude.validate = function (rules) {
	rules = (rules || '').split('\n');
	const ipv4 = [];
	const ipv6 = [];
	const cidr = [];
	const invalid = [];
	let duplicateCount = 0;

	const inlineCommentMatch = /#.*$/;
	const include = new Set(['127.0.0.1', '::1', '::ffff:0:127.0.0.1']);

	// Filter out blank lines and lines starting with the hash character (comments)
	// Also trim inputs and remove inline comments
	rules = rules.map(rule => {
		rule = rule.replace(inlineCommentMatch, '').trim();
		return rule.length > 0 && !rule.startsWith('#') ? rule : null;
	}).filter(Boolean);

	// Filter out duplicates
	const uniqRules = _.uniq(rules);
	duplicateCount += rules.length - uniqRules.length;
	rules = uniqRules;

	// Filter out invalid rules
	rules = rules.filter(rule => {
		let addr;
		let isRange = false;
		try {
			addr = ipaddr.parse(rule);
		} catch {
			// Do nothing
		}

		try {
			addr = ipaddr.parseCIDR(rule);
			isRange = true;
		} catch {
			// Do nothing
		}

		if (!addr || include.has(rule)) {
			invalid.push(validator.escape(rule));
			return false;
		}

		if (isRange) {
			cidr.push(rule);
			return true;
		}

		if (addr.kind() === 'ipv4' && ipaddr.IPv4.isValid(rule)) {
			ipv4.push(rule);
			return true;
		}

		if (addr.kind() === 'ipv6' && ipaddr.IPv6.isValid(rule)) {
			ipv6.push(rule);
			return true;
		}

		return false;
	});

	return {
		numRules: rules.length + invalid.length,
		ipv4,
		ipv6,
		cidr,
		valid: rules,
		invalid,
		duplicateCount,
	};
};

Exclude.addRule = async function (rule) {
	const {valid} = Exclude.validate(rule);
	if (valid.length === 0) {
		throw new Error('[[error:invalid-rule]]');
	}

	let rules = await Exclude.get();
	rules = `${rules}\n${valid[0]}`;
	await Exclude.save(rules);
};
