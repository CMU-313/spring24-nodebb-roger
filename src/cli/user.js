'use strict';

const {Command, Option} = require('commander');

module.exports = () => {
	const userCmd = new Command('user')
		.description('Manage users')
		.arguments('[command]');

	userCmd.configureHelp(require('./colors'));
	const userCommands = UserCommands();

	userCmd
		.command('info')
		.description('Display user info by uid/username/userslug.')
		.option('-i, --uid <uid>', 'Retrieve user by uid')
		.option('-u, --username <username>', 'Retrieve user by username')
		.option('-s, --userslug <userslug>', 'Retrieve user by userslug')
		.action((...arguments_) => execute(userCommands.info, arguments_));
	userCmd
		.command('create')
		.description('Create a new user.')
		.arguments('<username>')
		.option('-p, --password <password>', 'Set a new password. (Auto-generates if omitted)')
		.option('-e, --email <email>', 'Associate with an email.')
		.action((...arguments_) => execute(userCommands.create, arguments_));
	userCmd
		.command('reset')
		.description('Reset a user\'s password or send a password reset email.')
		.arguments('<uid>')
		.option('-p, --password <password>', 'Set a new password. (Auto-generates if passed empty)', false)
		.option('-s, --send-reset-email', 'Send a password reset email.', false)
		.action((...arguments_) => execute(userCommands.reset, arguments_));
	userCmd
		.command('delete')
		.description('Delete user(s) and/or their content')
		.arguments('<uids...>')
		.addOption(
			new Option('-t, --type [operation]', 'Delete user content ([purge]), leave content ([account]), or delete content only ([content])')
				.choices(['purge', 'account', 'content']).default('purge'),
		)
		.action((...arguments_) => execute(userCommands.deleteUser, arguments_));

	const make = userCmd.command('make')
		.description('Make user(s) admin, global mod, moderator or a regular user.')
		.arguments('[command]');

	make.command('admin')
		.description('Make user(s) an admin')
		.arguments('<uids...>')
		.action((...arguments_) => execute(userCommands.makeAdmin, arguments_));
	make.command('global-mod')
		.description('Make user(s) a global moderator')
		.arguments('<uids...>')
		.action((...arguments_) => execute(userCommands.makeGlobalMod, arguments_));
	make.command('mod')
		.description('Make uid(s) of user(s) moderator of given category IDs (cids)')
		.arguments('<uids...>')
		.requiredOption('-c, --cid <cids...>', 'ID(s) of categories to make the user a moderator of')
		.action((...arguments_) => execute(userCommands.makeMod, arguments_));
	make.command('regular')
		.description('Make user(s) a non-privileged user')
		.arguments('<uids...>')
		.action((...arguments_) => execute(userCommands.makeRegular, arguments_));

	return userCmd;
};

let database;
let user;
let groups;
let privileges;
let privHelpers;
let utils;
let winston;

async function init() {
	database = require('../database');
	await database.init();

	user = require('../user');
	groups = require('../groups');
	privileges = require('../privileges');
	privHelpers = require('../privileges/helpers');
	utils = require('../utils');
	winston = require('winston');
}

async function execute(cmd, arguments_) {
	await init();
	try {
		await cmd(...arguments_);
	} catch (error) {
		const userError = error.name === 'UserError';
		winston.error(`[userCmd/${cmd.name}] ${userError ? `${error.message}` : 'Command failed.'}`, userError ? '' : error);
		process.exit(1);
	}

	process.exit();
}

function UserCmdHelpers() {
	async function getAdminUidOrFail() {
		const adminUid = await user.getFirstAdminUid();
		if (!adminUid) {
			const error = new Error('An admin account does not exists to execute the operation.');
			error.name = 'UserError';
			throw error;
		}

		return adminUid;
	}

	async function setupApp() {
		const nconf = require('nconf');
		const Benchpress = require('benchpressjs');

		const meta = require('../meta');
		await meta.configs.init();

		const webserver = require('../webserver');
		const viewsDir = nconf.get('views_dir');

		webserver.app.engine('tpl', (filepath, data, next) => {
			filepath = filepath.replace(/\.tpl$/, '.js');

			Benchpress.__express(filepath, data, next);
		});
		webserver.app.set('view engine', 'tpl');
		webserver.app.set('views', viewsDir);

		const emailer = require('../emailer');
		emailer.registerApp(webserver.app);
	}

	const argumentParsers = {
		intParse(value, variableName) {
			const parsedValue = Number.parseInt(value, 10);
			if (isNaN(parsedValue)) {
				const error = new Error(`"${variableName}" expected to be a number.`);
				error.name = 'UserError';
				throw error;
			}

			return parsedValue;
		},
		intArrayParse: (values, variableName) => values.map(value => argumentParsers.intParse(value, variableName)),
	};

	return {
		argParsers: argumentParsers,
		getAdminUidOrFail,
		setupApp,
	};
}

function UserCommands() {
	const {argParsers, getAdminUidOrFail, setupApp} = UserCmdHelpers();

	async function info({uid, username, userslug}) {
		if (!uid && !username && !userslug) {
			return winston.error('[userCmd/info] At least one option has to be passed (--uid, --username or --userslug).');
		}

		if (uid) {
			uid = argParsers.intParse(uid, 'uid');
		} else if (username) {
			uid = await user.getUidByUsername(username);
		} else {
			uid = await user.getUidByUserslug(userslug);
		}

		const userData = await user.getUserData(uid);
		winston.info('[userCmd/info] User info retrieved:');
		console.log(userData);
	}

	async function create(username, {password, email}) {
		let pwGenerated = false;
		if (password === undefined) {
			password = utils.generateUUID().slice(0, 8);
			pwGenerated = true;
		}

		const userExists = await user.getUidByUsername(username);
		if (userExists) {
			return winston.error(`[userCmd/create] A user with username '${username}' already exists`);
		}

		const uid = await user.create({
			username,
			password,
			email,
		});

		winston.info(`[userCmd/create] User '${username}'${password ? '' : ' without a password'} has been created with uid: ${uid}.\
${pwGenerated ? ` Generated password: ${password}` : ''}`);
	}

	async function reset(uid, {password, sendResetEmail}) {
		uid = argParsers.intParse(uid, 'uid');

		if (password === false && sendResetEmail === false) {
			return winston.error('[userCmd/reset] At least one option has to be passed (--password or --send-reset-email).');
		}

		const userExists = await user.exists(uid);
		if (!userExists) {
			return winston.error('[userCmd/reset] A user with given uid does not exists.');
		}

		let pwGenerated = false;
		if (password === '') {
			password = utils.generateUUID().slice(0, 8);
			pwGenerated = true;
		}

		const adminUid = await getAdminUidOrFail();

		if (password) {
			await user.setUserField(uid, 'password', '');
			await user.changePassword(adminUid, {
				newPassword: password,
				uid,
			});
			winston.info(`[userCmd/reset] ${password ? 'User password changed.' : ''}${pwGenerated ? ` Generated password: ${password}` : ''}`);
		}

		if (sendResetEmail) {
			const userEmail = await user.getUserField(uid, 'email');
			if (!userEmail) {
				return winston.error('User doesn\'t have an email address to send reset email.');
			}

			await setupApp();
			await user.reset.send(userEmail);
			winston.info('[userCmd/reset] Password reset email has been sent.');
		}
	}

	async function deleteUser(uids, {type}) {
		uids = argParsers.intArrayParse(uids, 'uids');

		const userExists = await user.exists(uids);
		if (!userExists || userExists.includes(false)) {
			return winston.error('[userCmd/reset] A user with given uid does not exists.');
		}

		await database.initSessionStore();
		const adminUid = await getAdminUidOrFail();

		switch (type) {
			case 'purge': {
				await Promise.all(uids.map(uid => user.delete(adminUid, uid)));
				winston.info('[userCmd/delete] User(s) with their content has been deleted.');
				break;
			}

			case 'account': {
				await Promise.all(uids.map(uid => user.deleteAccount(uid)));
				winston.info('[userCmd/delete] User(s) has been deleted, their content left intact.');
				break;
			}

			case 'content': {
				await Promise.all(uids.map(uid => user.deleteContent(adminUid, uid)));
				winston.info('[userCmd/delete] User(s)\' content has been deleted.');
				break;
			}
		}
	}

	async function makeAdmin(uids) {
		uids = argParsers.intArrayParse(uids, 'uids');
		await Promise.all(uids.map(uid => groups.join('administrators', uid)));

		winston.info('[userCmd/make/admin] User(s) added as administrators.');
	}

	async function makeGlobalModule(uids) {
		uids = argParsers.intArrayParse(uids, 'uids');
		await Promise.all(uids.map(uid => groups.join('Global Moderators', uid)));

		winston.info('[userCmd/make/globalMod] User(s) added as global moderators.');
	}

	async function makeModule(uids, {cid: cids}) {
		uids = argParsers.intArrayParse(uids, 'uids');
		cids = argParsers.intArrayParse(cids, 'cids');

		const categoryPrivList = await privileges.categories.getPrivilegeList();
		await privHelpers.giveOrRescind(groups.join, categoryPrivList, cids, uids);

		winston.info('[userCmd/make/mod] User(s) added as moderators to given categories.');
	}

	async function makeRegular(uids) {
		uids = argParsers.intArrayParse(uids, 'uids');

		await Promise.all(uids.map(uid => groups.leave(['administrators', 'Global Moderators'], uid)));

		const categoryPrivList = await privileges.categories.getPrivilegeList();
		const cids = await database.getSortedSetRevRange('categories:cid', 0, -1);
		await privHelpers.giveOrRescind(groups.leave, categoryPrivList, cids, uids);

		winston.info('[userCmd/make/regular] User(s) made regular/non-privileged.');
	}

	return {
		info,
		create,
		reset,
		deleteUser,
		makeAdmin,
		makeGlobalMod: makeGlobalModule,
		makeMod: makeModule,
		makeRegular,
	};
}
