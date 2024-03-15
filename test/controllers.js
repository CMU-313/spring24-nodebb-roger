'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const nconf = require('nconf');
const request = require('request');
const requestAsync = require('request-promise-native');
const async = require('async');
const categories = require('../src/categories');
const topics = require('../src/topics');
const posts = require('../src/posts');
const user = require('../src/user');
const groups = require('../src/groups');
const meta = require('../src/meta');
const translator = require('../src/translator');
const privileges = require('../src/privileges');
const plugins = require('../src/plugins');
const utils = require('../src/utils');
const db = require('./mocks/databasemock');
const helpers = require('./helpers');

describe('Controllers', () => {
	let tid;
	let cid;
	let pid;
	let fooUid;
	let adminUid;
	let category;

	before(async () => {
		category = await categories.create({
			name: 'Test Category',
			description: 'Test category created by testing script',
		});
		cid = category.cid;

		fooUid = await user.create({username: 'foo', password: 'barbar', gdpr_consent: true});
		await user.setUserField(fooUid, 'email', 'foo@test.com');
		await user.email.confirmByUid(fooUid);

		adminUid = await user.create({username: 'admin', password: 'barbar', gdpr_consent: true});
		await groups.join('administrators', adminUid);

		const navigation = require('../src/navigation/admin');
		const data = require('../install/data/navigation.json');

		await navigation.save(data);

		const result = await topics.post({
			uid: fooUid, title: 'test topic title', content: 'test topic content', cid,
		});
		tid = result.topicData.tid;
		pid = result.postData.pid;
	});

	it('should load /config with csrf_token', done => {
		request({
			url: `${nconf.get('url')}/api/config`,
			json: true,
		}, (error, response, body) => {
			assert.ifError(error);
			assert.equal(response.statusCode, 200);
			assert(body.csrf_token);
			done();
		});
	});

	it('should load /config with no csrf_token as spider', done => {
		request({
			url: `${nconf.get('url')}/api/config`,
			json: true,
			headers: {
				'user-agent': 'yandex',
			},
		}, (error, response, body) => {
			assert.ifError(error);
			assert.equal(response.statusCode, 200);
			assert.strictEqual(body.csrf_token, false);
			assert.strictEqual(body.uid, -1);
			assert.strictEqual(body.loggedIn, false);
			done();
		});
	});

	describe('homepage', () => {
		function hookMethod(hookData) {
			assert(hookData.req);
			assert(hookData.res);
			assert(hookData.next);

			hookData.res.render('mycustompage', {
				works: true,
			});
		}

		const message = utils.generateUUID();
		const name = 'mycustompage.tpl';
		const tplPath = path.join(nconf.get('views_dir'), name);

		before(async () => {
			plugins.hooks.register('myTestPlugin', {
				hook: 'action:homepage.get:mycustompage',
				method: hookMethod,
			});

			fs.writeFileSync(tplPath, message);
			await meta.templates.compileTemplate(name, message);
		});

		it('should load default', done => {
			request(nconf.get('url'), (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load unread', done => {
			meta.configs.set('homePageRoute', 'unread', error => {
				assert.ifError(error);

				request(nconf.get('url'), (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body);
					done();
				});
			});
		});

		it('should load recent', done => {
			meta.configs.set('homePageRoute', 'recent', error => {
				assert.ifError(error);

				request(nconf.get('url'), (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body);
					done();
				});
			});
		});

		it('should load top', done => {
			meta.configs.set('homePageRoute', 'top', error => {
				assert.ifError(error);

				request(nconf.get('url'), (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body);
					done();
				});
			});
		});

		it('should load popular', done => {
			meta.configs.set('homePageRoute', 'popular', error => {
				assert.ifError(error);

				request(nconf.get('url'), (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body);
					done();
				});
			});
		});

		it('should load category', done => {
			meta.configs.set('homePageRoute', 'category/1/test-category', error => {
				assert.ifError(error);

				request(nconf.get('url'), (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body);
					done();
				});
			});
		});

		it('should not load breadcrumbs on home page route', done => {
			request(`${nconf.get('url')}/api`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				assert(!body.breadcrumbs);
				done();
			});
		});

		it('should redirect to custom', done => {
			meta.configs.set('homePageRoute', 'groups', error => {
				assert.ifError(error);

				request(nconf.get('url'), (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body);
					done();
				});
			});
		});

		it('should 404 if custom does not exist', done => {
			meta.configs.set('homePageRoute', 'this-route-does-not-exist', error => {
				assert.ifError(error);

				request(nconf.get('url'), (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 404);
					assert(body);
					done();
				});
			});
		});

		it('api should work with hook', done => {
			meta.configs.set('homePageRoute', 'mycustompage', error => {
				assert.ifError(error);

				request(`${nconf.get('url')}/api`, {json: true}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert.equal(body.works, true);
					assert.equal(body.template.mycustompage, true);

					done();
				});
			});
		});

		it('should render with hook', done => {
			meta.configs.set('homePageRoute', 'mycustompage', error => {
				assert.ifError(error);

				request(nconf.get('url'), (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert.ok(body);
					assert.ok(body.indexOf('<main id="panel"'));
					assert.ok(body.includes(message));

					done();
				});
			});
		});

		after(() => {
			plugins.hooks.unregister('myTestPlugin', 'action:homepage.get:custom', hookMethod);
			fs.unlinkSync(tplPath);
			fs.unlinkSync(tplPath.replace(/\.tpl$/, '.js'));
		});
	});

	it('should load /reset without code', done => {
		request(`${nconf.get('url')}/reset`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load /reset with invalid code', done => {
		request(`${nconf.get('url')}/reset/123123`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load /login', done => {
		request(`${nconf.get('url')}/login`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load /register', done => {
		request(`${nconf.get('url')}/register`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load /register/complete', done => {
		const data = {
			username: 'interstitial',
			password: '123456',
			'password-confirm': '123456',
			'account-type': 'student',
			email: 'test@me.com',
		};

		const jar = request.jar();
		request({
			url: `${nconf.get('url')}/api/config`,
			json: true,
			jar,
		}, (error, response, body) => {
			assert.ifError(error);

			request.post(`${nconf.get('url')}/register`, {
				form: data,
				json: true,
				jar,
				headers: {
					'x-csrf-token': body.csrf_token,
				},
			}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert.strictEqual(body.next, `${nconf.get('relative_path')}/register/complete`);
				request(`${nconf.get('url')}/api/register/complete`, {
					jar,
					json: true,
				}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body.sections);
					assert(body.errors);
					assert(body.title);
					done();
				});
			});
		});
	});

	describe('registration interstitials', () => {
		describe('email update', () => {
			let jar;
			let token;
			const dummyEmailerHook = async data => {};

			before(async () => {
				// Attach an emailer hook so related requests do not error
				plugins.hooks.register('emailer-test', {
					hook: 'filter:email.send',
					method: dummyEmailerHook,
				});

				jar = await helpers.registerUser({
					username: utils.generateUUID().slice(0, 10),
					password: utils.generateUUID(),
					'account-type': 'student',
				});
				token = await helpers.getCsrfToken(jar);

				meta.config.requireEmailAddress = 1;
			});

			after(() => {
				meta.config.requireEmailAddress = 0;
				plugins.hooks.unregister('emailer-test', 'filter:email.send');
			});

			it('email interstitial should still apply if empty email entered and requireEmailAddress is enabled', async () => {
				let res = await requestAsync(`${nconf.get('url')}/register/complete`, {
					method: 'post',
					jar,
					json: true,
					followRedirect: false,
					simple: false,
					resolveWithFullResponse: true,
					headers: {
						'x-csrf-token': token,
					},
					form: {
						email: '',
					},
				});

				assert.strictEqual(res.headers.location, `${nconf.get('relative_path')}/register/complete`);

				res = await requestAsync(`${nconf.get('url')}/api/register/complete`, {
					jar,
					json: true,
					resolveWithFullResponse: true,
				});
				assert.strictEqual(res.statusCode, 200);
				assert(res.body.errors.length);
				assert(res.body.errors.includes('[[error:invalid-email]]'));
			});

			it('gdpr interstitial should still apply if email requirement is disabled', async () => {
				meta.config.requireEmailAddress = 0;

				const res = await requestAsync(`${nconf.get('url')}/api/register/complete`, {
					jar,
					json: true,
					resolveWithFullResponse: true,
				});

				assert(!res.body.errors.includes('[[error:invalid-email]]'));
				assert(!res.body.errors.includes('[[error:gdpr_consent_denied]]'));
			});

			it('should error if userData is falsy', async () => {
				try {
					await user.interstitials.email({userData: null});
					assert(false);
				} catch (error) {
					assert.strictEqual(error.message, '[[error:invalid-data]]');
				}
			});

			it('should throw error if email is not valid', async () => {
				const uid = await user.create({username: 'interstiuser1'});
				try {
					const result = await user.interstitials.email({
						userData: {uid, updateEmail: true},
						req: {uid},
						interstitials: [],
					});
					assert.strictEqual(result.interstitials[0].template, 'partials/email_update');
					await result.interstitials[0].callback({uid}, {
						email: 'invalidEmail',
					});
					assert(false);
				} catch (error) {
					assert.strictEqual(error.message, '[[error:invalid-email]]');
				}
			});

			it('should set req.session.emailChanged to 1', async () => {
				const uid = await user.create({username: 'interstiuser2'});
				const result = await user.interstitials.email({
					userData: {uid, updateEmail: true},
					req: {uid, session: {}},
					interstitials: [],
				});

				await result.interstitials[0].callback({uid}, {
					email: 'interstiuser2@nodebb.org',
				});
				assert.strictEqual(result.req.session.emailChanged, 1);
			});

			it('should set email if admin is changing it', async () => {
				const uid = await user.create({username: 'interstiuser3'});
				const result = await user.interstitials.email({
					userData: {uid, updateEmail: true},
					req: {uid: adminUid},
					interstitials: [],
				});

				await result.interstitials[0].callback({uid}, {
					email: 'interstiuser3@nodebb.org',
				});
				const userData = await user.getUserData(uid);
				assert.strictEqual(userData.email, 'interstiuser3@nodebb.org');
				assert.strictEqual(userData['email:confirmed'], 1);
			});

			it('should throw error if user tries to edit other users email', async () => {
				const uid = await user.create({username: 'interstiuser4'});
				try {
					const result = await user.interstitials.email({
						userData: {uid, updateEmail: true},
						req: {uid: 1000},
						interstitials: [],
					});

					await result.interstitials[0].callback({uid}, {
						email: 'derp@derp.com',
					});
					assert(false);
				} catch (error) {
					assert.strictEqual(error.message, '[[error:no-privileges]]');
				}
			});

			it('should remove current email', async () => {
				const uid = await user.create({username: 'interstiuser5'});
				await user.setUserField(uid, 'email', 'interstiuser5@nodebb.org');
				await user.email.confirmByUid(uid);

				const result = await user.interstitials.email({
					userData: {uid, updateEmail: true},
					req: {uid, session: {id: 0}},
					interstitials: [],
				});

				await result.interstitials[0].callback({uid}, {
					email: '',
				});
				const userData = await user.getUserData(uid);
				assert.strictEqual(userData.email, '');
				assert.strictEqual(userData['email:confirmed'], 0);
			});

			it('should require a password (if one is set) for email change', async () => {
				try {
					const [username, password] = [utils.generateUUID().slice(0, 10), utils.generateUUID()];
					const uid = await user.create({username, password});
					await user.setUserField(uid, 'email', `${username}@nodebb.org`);
					await user.email.confirmByUid(uid);

					const result = await user.interstitials.email({
						userData: {uid, updateEmail: true},
						req: {uid, session: {id: 0}},
						interstitials: [],
					});

					await result.interstitials[0].callback({uid}, {
						email: `${username}@nodebb.com`,
					});
				} catch (error) {
					assert.strictEqual(error.message, '[[error:invalid-password]]');
				}
			});

			it('should require a password (if one is set) for email clearing', async () => {
				try {
					const [username, password] = [utils.generateUUID().slice(0, 10), utils.generateUUID()];
					const uid = await user.create({username, password});
					await user.setUserField(uid, 'email', `${username}@nodebb.org`);
					await user.email.confirmByUid(uid);

					const result = await user.interstitials.email({
						userData: {uid, updateEmail: true},
						req: {uid, session: {id: 0}},
						interstitials: [],
					});

					await result.interstitials[0].callback({uid}, {
						email: '',
					});
				} catch (error) {
					assert.strictEqual(error.message, '[[error:invalid-password]]');
				}
			});

			it('should successfully issue validation request if the correct password is passed in', async () => {
				const [username, password] = [utils.generateUUID().slice(0, 10), utils.generateUUID()];
				const uid = await user.create({username, password});
				await user.setUserField(uid, 'email', `${username}@nodebb.org`);
				await user.email.confirmByUid(uid);

				const result = await user.interstitials.email({
					userData: {uid, updateEmail: true},
					req: {uid, session: {id: 0}},
					interstitials: [],
				});

				await result.interstitials[0].callback({uid}, {
					email: `${username}@nodebb.com`,
					password,
				});

				const pending = await user.email.isValidationPending(uid, `${username}@nodebb.com`);
				assert.strictEqual(pending, true);
				await user.setUserField(uid, 'email', `${username}@nodebb.com`);
				await user.email.confirmByUid(uid);
				const userData = await user.getUserData(uid);
				assert.strictEqual(userData.email, `${username}@nodebb.com`);
				assert.strictEqual(userData['email:confirmed'], 1);
			});
		});

		describe('gdpr', () => {
			let jar;
			let token;

			before(async () => {
				jar = await helpers.registerUser({
					username: utils.generateUUID().slice(0, 10),
					password: utils.generateUUID(),
					'account-type': 'student',
				});
				token = await helpers.getCsrfToken(jar);
			});

			it('registration should succeed once gdpr prompts are agreed to', async () => {
				const res = await requestAsync(`${nconf.get('url')}/register/complete`, {
					method: 'post',
					jar,
					json: true,
					followRedirect: false,
					simple: false,
					resolveWithFullResponse: true,
					headers: {
						'x-csrf-token': token,
					},
					form: {
						gdpr_agree_data: 'on',
						gdpr_agree_email: 'on',
					},
				});

				assert.strictEqual(res.statusCode, 302);
				assert.strictEqual(res.headers.location, `${nconf.get('relative_path')}/`);
			});
		});
	});

	it('should load /robots.txt', done => {
		request(`${nconf.get('url')}/robots.txt`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load /manifest.webmanifest', done => {
		request(`${nconf.get('url')}/manifest.webmanifest`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load /outgoing?url=<url>', done => {
		request(`${nconf.get('url')}/outgoing?url=http://youtube.com`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should 404 on /outgoing with no url', done => {
		request(`${nconf.get('url')}/outgoing`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 404);
			assert(body);
			done();
		});
	});

	it('should 404 on /outgoing with javascript: protocol', done => {
		request(`${nconf.get('url')}/outgoing?url=javascript:alert(1);`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 404);
			assert(body);
			done();
		});
	});

	it('should 404 on /outgoing with invalid url', done => {
		request(`${nconf.get('url')}/outgoing?url=derp`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 404);
			assert(body);
			done();
		});
	});

	it('should load /tos', done => {
		meta.config.termsOfUse = 'please accept our tos';
		request(`${nconf.get('url')}/tos`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load 404 if meta.config.termsOfUse is empty', done => {
		meta.config.termsOfUse = '';
		request(`${nconf.get('url')}/tos`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 404);
			assert(body);
			done();
		});
	});

	it('should load /sping', done => {
		request(`${nconf.get('url')}/sping`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert.equal(body, 'healthy');
			done();
		});
	});

	it('should load /ping', done => {
		request(`${nconf.get('url')}/ping`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert.equal(body, '200');
			done();
		});
	});

	it('should handle 404', done => {
		request(`${nconf.get('url')}/arouteinthevoid`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 404);
			assert(body);
			done();
		});
	});

	it('should load topic rss feed', done => {
		request(`${nconf.get('url')}/topic/${tid}.rss`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load category rss feed', done => {
		request(`${nconf.get('url')}/category/${cid}.rss`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load topics rss feed', done => {
		request(`${nconf.get('url')}/topics.rss`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load recent rss feed', done => {
		request(`${nconf.get('url')}/recent.rss`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load top rss feed', done => {
		request(`${nconf.get('url')}/top.rss`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load popular rss feed', done => {
		request(`${nconf.get('url')}/popular.rss`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load popular rss feed with term', done => {
		request(`${nconf.get('url')}/popular/day.rss`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load recent posts rss feed', done => {
		request(`${nconf.get('url')}/recentposts.rss`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load category recent posts rss feed', done => {
		request(`${nconf.get('url')}/category/${cid}/recentposts.rss`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load user topics rss feed', done => {
		request(`${nconf.get('url')}/user/foo/topics.rss`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load tag rss feed', done => {
		request(`${nconf.get('url')}/tags/nodebb.rss`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load client.css', done => {
		request(`${nconf.get('url')}/assets/client.css`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load admin.css', done => {
		request(`${nconf.get('url')}/assets/admin.css`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load sitemap.xml', done => {
		request(`${nconf.get('url')}/sitemap.xml`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load sitemap/pages.xml', done => {
		request(`${nconf.get('url')}/sitemap/pages.xml`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load sitemap/categories.xml', done => {
		request(`${nconf.get('url')}/sitemap/categories.xml`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load sitemap/topics/1.xml', done => {
		request(`${nconf.get('url')}/sitemap/topics.1.xml`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load robots.txt', done => {
		request(`${nconf.get('url')}/robots.txt`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load theme screenshot', done => {
		request(`${nconf.get('url')}/css/previews/nodebb-theme-persona`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load users page', done => {
		request(`${nconf.get('url')}/users`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load users page', done => {
		request(`${nconf.get('url')}/users?section=online`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should error if guests do not have search privilege', done => {
		request(`${nconf.get('url')}/api/users?query=bar&section=sort-posts`, {json: true}, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 500);
			assert(body);
			assert.equal(body.error, '[[error:no-privileges]]');
			done();
		});
	});

	it('should load users search page', done => {
		privileges.global.give(['groups:search:users'], 'guests', error => {
			assert.ifError(error);
			request(`${nconf.get('url')}/users?query=bar&section=sort-posts`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				privileges.global.rescind(['groups:search:users'], 'guests', done);
			});
		});
	});

	it('should load groups page', done => {
		request(`${nconf.get('url')}/groups`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should load group details page', done => {
		groups.create({
			name: 'group-details',
			description: 'Foobar!',
			hidden: 0,
		}, error => {
			assert.ifError(error);
			groups.join('group-details', fooUid, error => {
				assert.ifError(error);
				topics.post({
					uid: fooUid,
					title: 'topic title',
					content: 'test topic content',
					cid,
				}, error => {
					assert.ifError(error);
					request(`${nconf.get('url')}/api/groups/group-details`, {json: true}, (error, res, body) => {
						assert.ifError(error);
						assert.equal(res.statusCode, 200);
						assert(body);
						assert.equal(body.posts[0].content, 'test topic content');
						done();
					});
				});
			});
		});
	});

	it('should load group members page', done => {
		request(`${nconf.get('url')}/groups/group-details/members`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should 404 when trying to load group members of hidden group', done => {
		const groups = require('../src/groups');
		groups.create({
			name: 'hidden-group',
			description: 'Foobar!',
			hidden: 1,
		}, error => {
			assert.ifError(error);
			request(`${nconf.get('url')}/groups/hidden-group/members`, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				done();
			});
		});
	});

	it('should get recent posts', done => {
		request(`${nconf.get('url')}/api/recent/posts/month`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should get post data', done => {
		request(`${nconf.get('url')}/api/v3/posts/${pid}`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should get topic data', done => {
		request(`${nconf.get('url')}/api/v3/topics/${tid}`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	it('should get category data', done => {
		request(`${nconf.get('url')}/api/v3/categories/${cid}`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	describe('revoke session', () => {
		let uid;
		let jar;
		let csrf_token;

		before(async () => {
			uid = await user.create({username: 'revokeme', password: 'barbar'});
			const login = await helpers.loginUser('revokeme', 'barbar');
			jar = login.jar;
			csrf_token = login.csrf_token;
		});

		it('should fail to revoke session with missing uuid', done => {
			request.del(`${nconf.get('url')}/api/user/revokeme/session`, {
				jar,
				headers: {
					'x-csrf-token': csrf_token,
				},
			}, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				done();
			});
		});

		it('should fail if user doesn\'t exist', done => {
			request.del(`${nconf.get('url')}/api/v3/users/doesnotexist/sessions/1112233`, {
				jar,
				headers: {
					'x-csrf-token': csrf_token,
				},
			}, (error, res, body) => {
				assert.ifError(error);
				assert.strictEqual(res.statusCode, 404);
				const parsedResponse = JSON.parse(body);
				assert.deepStrictEqual(parsedResponse.response, {});
				assert.deepStrictEqual(parsedResponse.status, {
					code: 'not-found',
					message: 'User does not exist',
				});
				done();
			});
		});

		it('should revoke user session', done => {
			db.getSortedSetRange(`uid:${uid}:sessions`, 0, -1, (error, sids) => {
				assert.ifError(error);
				const sid = sids[0];

				db.sessionStore.get(sid, (error, sessionObject) => {
					assert.ifError(error);
					request.del(`${nconf.get('url')}/api/v3/users/${uid}/sessions/${sessionObject.meta.uuid}`, {
						jar,
						headers: {
							'x-csrf-token': csrf_token,
						},
					}, (error, res, body) => {
						assert.ifError(error);
						assert.strictEqual(res.statusCode, 200);
						assert.deepStrictEqual(JSON.parse(body), {
							status: {
								code: 'ok',
								message: 'OK',
							},
							response: {},
						});
						done();
					});
				});
			});
		});
	});

	describe('widgets', () => {
		const widgets = require('../src/widgets');

		before(done => {
			async.waterfall([
				function (next) {
					widgets.reset(next);
				},
				function (next) {
					const data = {
						template: 'categories.tpl',
						location: 'sidebar',
						widgets: [
							{
								widget: 'html',
								data: {
									html: 'test',
									title: '',
									container: '',
								},
							},
						],
					};

					widgets.setArea(data, next);
				},
			], done);
		});

		it('should return {} if there are no widgets', done => {
			request(`${nconf.get('url')}/api/category/${cid}`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body.widgets);
				assert.equal(Object.keys(body.widgets).length, 0);
				done();
			});
		});

		it('should render templates', done => {
			const url = `${nconf.get('url')}/api/categories`;
			request(url, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body.widgets);
				assert(body.widgets.sidebar);
				assert.equal(body.widgets.sidebar[0].html, 'test');
				done();
			});
		});

		it('should reset templates', done => {
			widgets.resetTemplates(['categories', 'category'], error => {
				assert.ifError(error);
				request(`${nconf.get('url')}/api/categories`, {json: true}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body.widgets);
					assert.equal(Object.keys(body.widgets).length, 0);
					done();
				});
			});
		});
	});

	describe('tags', () => {
		let tid;
		before(done => {
			topics.post({
				uid: fooUid,
				title: 'topic title',
				content: 'test topic content',
				cid,
				tags: ['nodebb', 'bug', 'test'],
			}, (error, result) => {
				assert.ifError(error);
				tid = result.topicData.tid;
				done();
			});
		});

		it('should render tags page', done => {
			request(`${nconf.get('url')}/api/tags`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				assert(Array.isArray(body.tags));
				done();
			});
		});

		it('should render tag page with no topics', done => {
			request(`${nconf.get('url')}/api/tags/notag`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				assert(Array.isArray(body.topics));
				assert.equal(body.topics.length, 0);
				done();
			});
		});

		it('should render tag page with 1 topic', done => {
			request(`${nconf.get('url')}/api/tags/nodebb`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				assert(Array.isArray(body.topics));
				assert.equal(body.topics.length, 1);
				done();
			});
		});
	});

	describe('maintenance mode', () => {
		before(done => {
			meta.config.maintenanceMode = 1;
			done();
		});
		after(done => {
			meta.config.maintenanceMode = 0;
			done();
		});

		it('should return 503 in maintenance mode', done => {
			request(`${nconf.get('url')}/recent`, {json: true}, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 503);
				done();
			});
		});

		it('should return 503 in maintenance mode', done => {
			request(`${nconf.get('url')}/api/recent`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 503);
				assert(body);
				done();
			});
		});

		it('should return 200 in maintenance mode', done => {
			request(`${nconf.get('url')}/api/login`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should return 200 if guests are allowed', done => {
			const oldValue = meta.config.groupsExemptFromMaintenanceMode;
			meta.config.groupsExemptFromMaintenanceMode.push('guests');
			request(`${nconf.get('url')}/api/recent`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.strictEqual(res.statusCode, 200);
				assert(body);
				meta.config.groupsExemptFromMaintenanceMode = oldValue;
				done();
			});
		});
	});

	describe('account pages', () => {
		let jar;
		let csrf_token;

		before(async () => {
			({jar, csrf_token} = await helpers.loginUser('foo', 'barbar'));
		});

		it('should redirect to account page with logged in user', done => {
			request(`${nconf.get('url')}/api/login`, {jar, json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert.equal(res.headers['x-redirect'], '/user/foo');
				assert.equal(body, '/user/foo');
				done();
			});
		});

		it('should 404 if uid is not a number', done => {
			request(`${nconf.get('url')}/api/uid/test`, {json: true}, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				done();
			});
		});

		it('should redirect to userslug', done => {
			request(`${nconf.get('url')}/api/uid/${fooUid}`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert.equal(res.headers['x-redirect'], '/user/foo');
				assert.equal(body, '/user/foo');
				done();
			});
		});

		it('should redirect to userslug and keep query params', done => {
			request(`${nconf.get('url')}/api/uid/${fooUid}/topics?foo=bar`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert.equal(res.headers['x-redirect'], '/user/foo/topics?foo=bar');
				assert.equal(body, '/user/foo/topics?foo=bar');
				done();
			});
		});

		it('should 404 if user does not exist', done => {
			request(`${nconf.get('url')}/api/uid/123123`, {json: true}, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				done();
			});
		});

		describe('/me/*', () => {
			it('should redirect to user profile', done => {
				request(`${nconf.get('url')}/me`, {jar, json: true}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body.includes('"template":{"name":"account/profile","account/profile":true}'));
					assert(body.includes('"username":"foo"'));
					done();
				});
			});
			it('api should redirect to /user/[userslug]/bookmarks', done => {
				request(`${nconf.get('url')}/api/me/bookmarks`, {jar, json: true}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert.equal(res.headers['x-redirect'], '/user/foo/bookmarks');
					assert.equal(body, '/user/foo/bookmarks');
					done();
				});
			});
			it('api should redirect to /user/[userslug]/edit/username', done => {
				request(`${nconf.get('url')}/api/me/edit/username`, {jar, json: true}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert.equal(res.headers['x-redirect'], '/user/foo/edit/username');
					assert.equal(body, '/user/foo/edit/username');
					done();
				});
			});
			it('should redirect to login if user is not logged in', done => {
				request(`${nconf.get('url')}/me/bookmarks`, {json: true}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body.includes('Login to your account'), body.slice(0, 500));
					done();
				});
			});
		});

		it('should 401 if user is not logged in', done => {
			request(`${nconf.get('url')}/api/admin`, {json: true}, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 401);
				done();
			});
		});

		it('should 403 if user is not admin', done => {
			request(`${nconf.get('url')}/api/admin`, {jar, json: true}, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 403);
				done();
			});
		});

		it('should load /user/foo/posts', done => {
			request(`${nconf.get('url')}/api/user/foo/posts`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should 401 if not logged in', done => {
			request(`${nconf.get('url')}/api/user/foo/bookmarks`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 401);
				assert(body);
				done();
			});
		});

		it('should load /user/foo/bookmarks', done => {
			request(`${nconf.get('url')}/api/user/foo/bookmarks`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load /user/foo/upvoted', done => {
			request(`${nconf.get('url')}/api/user/foo/upvoted`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load /user/foo/downvoted', done => {
			request(`${nconf.get('url')}/api/user/foo/downvoted`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load /user/foo/best', done => {
			request(`${nconf.get('url')}/api/user/foo/best`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load /user/foo/controversial', done => {
			request(`${nconf.get('url')}/api/user/foo/controversial`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load /user/foo/watched', done => {
			request(`${nconf.get('url')}/api/user/foo/watched`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load /user/foo/ignored', done => {
			request(`${nconf.get('url')}/api/user/foo/ignored`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load /user/foo/topics', done => {
			request(`${nconf.get('url')}/api/user/foo/topics`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load /user/foo/blocks', done => {
			request(`${nconf.get('url')}/api/user/foo/blocks`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load /user/foo/consent', done => {
			request(`${nconf.get('url')}/api/user/foo/consent`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load /user/foo/sessions', done => {
			request(`${nconf.get('url')}/api/user/foo/sessions`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load /user/foo/categories', done => {
			request(`${nconf.get('url')}/api/user/foo/categories`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load /user/foo/uploads', done => {
			request(`${nconf.get('url')}/api/user/foo/uploads`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should export users posts', done => {
			request(`${nconf.get('url')}/api/user/foo/export/posts`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should export users uploads', done => {
			request(`${nconf.get('url')}/api/user/foo/export/uploads`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should export users profile', done => {
			request(`${nconf.get('url')}/api/user/foo/export/profile`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load notifications page', done => {
			const notifications = require('../src/notifications');
			const notificationData = {
				bodyShort: '[[notifications:user_posted_to, test1, test2]]',
				bodyLong: 'some post content',
				pid: 1,
				path: `/post/${1}`,
				nid: `new_post:tid:${1}:pid:${1}:uid:${fooUid}`,
				tid: 1,
				from: fooUid,
				mergeId: `notifications:user_posted_to|${1}`,
				topicTitle: 'topic title',
			};
			async.waterfall([
				function (next) {
					notifications.create(notificationData, next);
				},
				function (notification, next) {
					notifications.push(notification, fooUid, next);
				},
				function (next) {
					setTimeout(next, 2500);
				},
				function (next) {
					request(`${nconf.get('url')}/api/notifications`, {jar, json: true}, next);
				},
				function (res, body, next) {
					assert.equal(res.statusCode, 200);
					assert(body);
					const notification = body.notifications[0];
					assert.equal(notification.bodyShort, notificationData.bodyShort);
					assert.equal(notification.bodyLong, notificationData.bodyLong);
					assert.equal(notification.pid, notificationData.pid);
					assert.equal(notification.path, nconf.get('relative_path') + notificationData.path);
					assert.equal(notification.nid, notificationData.nid);
					next();
				},
			], done);
		});

		it('should 404 if user does not exist', done => {
			request(`${nconf.get('url')}/api/user/email/doesnotexist`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				assert(body);
				done();
			});
		});

		it('should load user by uid', done => {
			request(`${nconf.get('url')}/api/user/uid/${fooUid}`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should load user by username', done => {
			request(`${nconf.get('url')}/api/user/username/foo`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should NOT load user by email (by default)', async () => {
			const res = await requestAsync(`${nconf.get('url')}/api/user/email/foo@test.com`, {
				resolveWithFullResponse: true,
				simple: false,
			});

			assert.strictEqual(res.statusCode, 404);
		});

		it('should load user by email if user has elected to show their email', async () => {
			await user.setSetting(fooUid, 'showemail', 1);
			const res = await requestAsync(`${nconf.get('url')}/api/user/email/foo@test.com`, {
				resolveWithFullResponse: true,
			});
			assert.strictEqual(res.statusCode, 200);
			assert(res.body);
			await user.setSetting(fooUid, 'showemail', 0);
		});

		it('should return 401 if user does not have view:users privilege', done => {
			privileges.global.rescind(['groups:view:users'], 'guests', error => {
				assert.ifError(error);
				request(`${nconf.get('url')}/api/user/foo`, {json: true}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 401);
					assert.deepEqual(body, {
						response: {},
						status: {
							code: 'not-authorised',
							message: 'A valid login session was not found. Please log in and try again.',
						},
					});
					privileges.global.give(['groups:view:users'], 'guests', done);
				});
			});
		});

		it('should return false if user can not edit user', done => {
			user.create({username: 'regularJoe', password: 'barbar'}, error => {
				assert.ifError(error);
				helpers.loginUser('regularJoe', 'barbar', (error, data) => {
					assert.ifError(error);
					const {jar} = data;
					request(`${nconf.get('url')}/api/user/foo/info`, {jar, json: true}, (error, res) => {
						assert.ifError(error);
						assert.equal(res.statusCode, 403);
						request(`${nconf.get('url')}/api/user/foo/edit`, {jar, json: true}, (error, res) => {
							assert.ifError(error);
							assert.equal(res.statusCode, 403);
							done();
						});
					});
				});
			});
		});

		it('should load correct user', done => {
			request(`${nconf.get('url')}/api/user/FOO`, {jar, json: true}, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				done();
			});
		});

		it('should redirect', done => {
			request(`${nconf.get('url')}/user/FOO`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should 404 if user does not exist', done => {
			request(`${nconf.get('url')}/api/user/doesnotexist`, {jar}, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				done();
			});
		});

		it('should not increase profile view if you visit your own profile', done => {
			request(`${nconf.get('url')}/api/user/foo`, {jar}, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				setTimeout(() => {
					user.getUserField(fooUid, 'profileviews', (error, viewcount) => {
						assert.ifError(error);
						assert(viewcount === 0);
						done();
					});
				}, 500);
			});
		});

		it('should not increase profile view if a guest visits a profile', done => {
			request(`${nconf.get('url')}/api/user/foo`, {}, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				setTimeout(() => {
					user.getUserField(fooUid, 'profileviews', (error, viewcount) => {
						assert.ifError(error);
						assert(viewcount === 0);
						done();
					});
				}, 500);
			});
		});

		it('should increase profile view', done => {
			helpers.loginUser('regularJoe', 'barbar', (error, data) => {
				assert.ifError(error);
				const {jar} = data;
				request(`${nconf.get('url')}/api/user/foo`, {jar}, (error, res) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					setTimeout(() => {
						user.getUserField(fooUid, 'profileviews', (error, viewcount) => {
							assert.ifError(error);
							assert(viewcount > 0);
							done();
						});
					}, 500);
				});
			});
		});

		it('should parse about me', done => {
			user.setUserFields(fooUid, {picture: '/path/to/picture', aboutme: 'hi i am a bot'}, error => {
				assert.ifError(error);
				request(`${nconf.get('url')}/api/user/foo`, {json: true}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert.equal(body.aboutme, 'hi i am a bot');
					assert.equal(body.picture, '/path/to/picture');
					done();
				});
			});
		});

		it('should not return reputation if reputation is disabled', done => {
			meta.config['reputation:disabled'] = 1;
			request(`${nconf.get('url')}/api/user/foo`, {json: true}, (error, res, body) => {
				meta.config['reputation:disabled'] = 0;
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(!body.hasOwnProperty('reputation'));
				done();
			});
		});

		it('should only return posts that are not deleted', done => {
			let topicData;
			let pidToDelete;
			async.waterfall([
				function (next) {
					topics.post({
						uid: fooUid, title: 'visible', content: 'some content', cid,
					}, next);
				},
				function (data, next) {
					topicData = data.topicData;
					topics.reply({uid: fooUid, content: '1st reply', tid: topicData.tid}, next);
				},
				function (postData, next) {
					pidToDelete = postData.pid;
					topics.reply({uid: fooUid, content: '2nd reply', tid: topicData.tid}, next);
				},
				function (postData, next) {
					posts.delete(pidToDelete, fooUid, next);
				},
				function (next) {
					request(`${nconf.get('url')}/api/user/foo`, {json: true}, (error, res, body) => {
						assert.ifError(error);
						assert.equal(res.statusCode, 200);
						const contents = body.posts.map(p => p.content);
						assert(!contents.includes('1st reply'));
						done();
					});
				},
			], done);
		});

		it('should return selected group title', done => {
			groups.create({
				name: 'selectedGroup',
			}, error => {
				assert.ifError(error);
				user.create({username: 'groupie'}, (error, uid) => {
					assert.ifError(error);
					groups.join('selectedGroup', uid, error_ => {
						assert.ifError(error_);
						request(`${nconf.get('url')}/api/user/groupie`, {json: true}, (error, res, body) => {
							assert.ifError(error);
							assert.equal(res.statusCode, 200);
							assert(Array.isArray(body.selectedGroup));
							assert.equal(body.selectedGroup[0].name, 'selectedGroup');
							done();
						});
					});
				});
			});
		});

		it('should 404 if user does not exist', done => {
			groups.join('administrators', fooUid, error => {
				assert.ifError(error);
				request(`${nconf.get('url')}/api/user/doesnotexist/edit`, {jar, json: true}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 404);
					groups.leave('administrators', fooUid, done);
				});
			});
		});

		it('should render edit/password', done => {
			request(`${nconf.get('url')}/api/user/foo/edit/password`, {jar, json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				done();
			});
		});

		it('should render edit/email', async () => {
			const res = await requestAsync(`${nconf.get('url')}/api/user/foo/edit/email`, {
				jar,
				json: true,
				resolveWithFullResponse: true,
			});

			assert.strictEqual(res.statusCode, 200);
			assert.strictEqual(res.body, '/register/complete');

			await requestAsync({
				uri: `${nconf.get('url')}/register/abort?_csrf=${csrf_token}`,
				method: 'post',
				jar,
				simple: false,
			});
		});

		it('should render edit/username', done => {
			request(`${nconf.get('url')}/api/user/foo/edit/username`, {jar, json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				done();
			});
		});
	});

	describe('account follow page', () => {
		const socketUser = require('../src/socket.io/user');
		const apiUser = require('../src/api/users');
		let uid;
		before(async () => {
			uid = await user.create({username: 'follower'});
			await apiUser.follow({uid}, {uid: fooUid});
			const isFollowing = await socketUser.isFollowing({uid}, {uid: fooUid});
			assert(isFollowing);
		});

		it('should get followers page', done => {
			request(`${nconf.get('url')}/api/user/foo/followers`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert.equal(body.users[0].username, 'follower');
				done();
			});
		});

		it('should get following page', done => {
			request(`${nconf.get('url')}/api/user/follower/following`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert.equal(body.users[0].username, 'foo');
				done();
			});
		});

		it('should return empty after unfollow', async () => {
			await apiUser.unfollow({uid}, {uid: fooUid});
			const {res, body} = await helpers.request('get', '/api/user/foo/followers', {json: true});
			assert.equal(res.statusCode, 200);
			assert.equal(body.users.length, 0);
		});
	});

	describe('post redirect', () => {
		let jar;
		before(async () => {
			({jar} = await helpers.loginUser('foo', 'barbar'));
		});

		it('should 404 for invalid pid', done => {
			request(`${nconf.get('url')}/api/post/fail`, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				done();
			});
		});

		it('should 403 if user does not have read privilege', done => {
			privileges.categories.rescind(['groups:topics:read'], category.cid, 'registered-users', error => {
				assert.ifError(error);
				request(`${nconf.get('url')}/api/post/${pid}`, {jar}, (error, res) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 403);
					privileges.categories.give(['groups:topics:read'], category.cid, 'registered-users', done);
				});
			});
		});

		it('should return correct post path', done => {
			request(`${nconf.get('url')}/api/post/${pid}`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert.equal(res.headers['x-redirect'], '/topic/1/test-topic-title/1');
				assert.equal(body, '/topic/1/test-topic-title/1');
				done();
			});
		});
	});

	describe('cookie consent', () => {
		it('should return relevant data in configs API route', done => {
			request(`${nconf.get('url')}/api/config`, (error, res, body) => {
				let parsed;
				assert.ifError(error);
				assert.equal(res.statusCode, 200);

				try {
					parsed = JSON.parse(body);
				} catch (error) {
					assert.ifError(error);
				}

				assert.ok(parsed.cookies);
				assert.equal(translator.escape('[[global:cookies.message]]'), parsed.cookies.message);
				assert.equal(translator.escape('[[global:cookies.accept]]'), parsed.cookies.dismiss);
				assert.equal(translator.escape('[[global:cookies.learn_more]]'), parsed.cookies.link);

				done();
			});
		});

		it('response should be parseable when entries have apostrophes', done => {
			meta.configs.set('cookieConsentMessage', 'Julian\'s Message', error => {
				assert.ifError(error);

				request(`${nconf.get('url')}/api/config`, (error, res, body) => {
					let parsed;
					assert.ifError(error);
					assert.equal(res.statusCode, 200);

					try {
						parsed = JSON.parse(body);
					} catch (error) {
						assert.ifError(error);
					}

					assert.equal('Julian&#x27;s Message', parsed.cookies.message);
					done();
				});
			});
		});
	});

	it('should return osd data', done => {
		request(`${nconf.get('url')}/osd.xml`, (error, res, body) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 200);
			assert(body);
			done();
		});
	});

	describe('handle errors', () => {
		const plugins = require('../src/plugins');
		after(done => {
			plugins.loadedHooks['filter:router.page'] = undefined;
			done();
		});

		it('should handle topic malformed uri', done => {
			request(`${nconf.get('url')}/topic/1/a%AFc`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should handle category malformed uri', done => {
			request(`${nconf.get('url')}/category/1/a%AFc`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should handle malformed uri ', done => {
			request(`${nconf.get('url')}/user/a%AFc`, (error, res, body) => {
				assert.ifError(error);
				assert(body);
				assert.equal(res.statusCode, 400);
				done();
			});
		});

		it('should handle malformed uri in api', done => {
			request(`${nconf.get('url')}/api/user/a%AFc`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 400);
				assert.equal(body.error, '[[global:400.title]]');
				done();
			});
		});

		it('should handle CSRF error', done => {
			plugins.loadedHooks['filter:router.page'] = plugins.loadedHooks['filter:router.page'] || [];
			plugins.loadedHooks['filter:router.page'].push({
				method(request_, res, next) {
					const error = new Error('csrf-error');
					error.code = 'EBADCSRFTOKEN';
					next(error);
				},
			});

			request(`${nconf.get('url')}/users`, {}, (error, res) => {
				plugins.loadedHooks['filter:router.page'] = [];
				assert.ifError(error);
				assert.equal(res.statusCode, 403);
				done();
			});
		});

		it('should handle black-list error', done => {
			plugins.loadedHooks['filter:router.page'] = plugins.loadedHooks['filter:router.page'] || [];
			plugins.loadedHooks['filter:router.page'].push({
				method(request_, res, next) {
					const error = new Error('blacklist error message');
					error.code = 'blacklisted-ip';
					next(error);
				},
			});

			request(`${nconf.get('url')}/users`, {}, (error, res, body) => {
				plugins.loadedHooks['filter:router.page'] = [];
				assert.ifError(error);
				assert.equal(res.statusCode, 403);
				assert.equal(body, 'blacklist error message');
				done();
			});
		});

		it('should handle page redirect through error', done => {
			plugins.loadedHooks['filter:router.page'] = plugins.loadedHooks['filter:router.page'] || [];
			plugins.loadedHooks['filter:router.page'].push({
				method(request_, res, next) {
					const error = new Error('redirect');
					error.status = 302;
					error.path = '/popular';
					plugins.loadedHooks['filter:router.page'] = [];
					next(error);
				},
			});

			request(`${nconf.get('url')}/users`, {}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should handle api page redirect through error', done => {
			plugins.loadedHooks['filter:router.page'] = plugins.loadedHooks['filter:router.page'] || [];
			plugins.loadedHooks['filter:router.page'].push({
				method(request_, res, next) {
					const error = new Error('redirect');
					error.status = 308;
					error.path = '/api/popular';
					plugins.loadedHooks['filter:router.page'] = [];
					next(error);
				},
			});

			request(`${nconf.get('url')}/api/users`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert.equal(res.headers['x-redirect'], '/api/popular');
				assert(body, '/api/popular');
				done();
			});
		});

		it('should handle error page', done => {
			plugins.loadedHooks['filter:router.page'] = plugins.loadedHooks['filter:router.page'] || [];
			plugins.loadedHooks['filter:router.page'].push({
				method(request_, res, next) {
					const error = new Error('regular error');
					next(error);
				},
			});

			request(`${nconf.get('url')}/users`, (error, res, body) => {
				plugins.loadedHooks['filter:router.page'] = [];
				assert.ifError(error);
				assert.equal(res.statusCode, 500);
				assert(body);
				done();
			});
		});
	});

	describe('category', () => {
		let jar;
		before(async () => {
			({jar} = await helpers.loginUser('foo', 'barbar'));
		});

		it('should return 404 if cid is not a number', done => {
			request(`${nconf.get('url')}/api/category/fail`, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				done();
			});
		});

		it('should return 404 if topic index is not a number', done => {
			request(`${nconf.get('url')}/api/category/${category.slug}/invalidtopicindex`, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				done();
			});
		});

		it('should 404 if category does not exist', done => {
			request(`${nconf.get('url')}/api/category/123123`, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				done();
			});
		});

		it('should 404 if category is disabled', done => {
			categories.create({name: 'disabled'}, (error, category) => {
				assert.ifError(error);
				categories.setCategoryField(category.cid, 'disabled', 1, error_ => {
					assert.ifError(error_);
					request(`${nconf.get('url')}/api/category/${category.slug}`, (error, res) => {
						assert.ifError(error);
						assert.equal(res.statusCode, 404);
						done();
					});
				});
			});
		});

		it('should return 401 if not allowed to read', done => {
			categories.create({name: 'hidden'}, (error, category) => {
				assert.ifError(error);
				privileges.categories.rescind(['groups:read'], category.cid, 'guests', error_ => {
					assert.ifError(error_);
					request(`${nconf.get('url')}/api/category/${category.slug}`, (error, res) => {
						assert.ifError(error);
						assert.equal(res.statusCode, 401);
						done();
					});
				});
			});
		});

		it('should redirect if topic index is negative', done => {
			request(`${nconf.get('url')}/api/category/${category.slug}/-10`, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers['x-redirect']);
				done();
			});
		});

		it('should 404 if page is not found', done => {
			user.setSetting(fooUid, 'usePagination', 1, error => {
				assert.ifError(error);
				request(`${nconf.get('url')}/api/category/${category.slug}?page=100`, {jar, json: true}, (error, res) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 404);
					done();
				});
			});
		});

		it('should load page 1 if req.query.page is not sent', done => {
			request(`${nconf.get('url')}/api/category/${category.slug}`, {jar, json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert.equal(body.pagination.currentPage, 1);
				done();
			});
		});

		it('should sort topics by most posts', done => {
			async.waterfall([
				function (next) {
					categories.create({name: 'most-posts-category'}, next);
				},
				function (category, next) {
					async.waterfall([
						function (next) {
							topics.post({
								uid: fooUid, cid: category.cid, title: 'topic 1', content: 'topic 1 OP',
							}, next);
						},
						function (data, next) {
							topics.post({
								uid: fooUid, cid: category.cid, title: 'topic 2', content: 'topic 2 OP',
							}, next);
						},
						function (data, next) {
							topics.reply({uid: fooUid, content: 'topic 2 reply', tid: data.topicData.tid}, next);
						},
						function (postData, next) {
							request(`${nconf.get('url')}/api/category/${category.slug}?sort=most_posts`, {jar, json: true}, (error, res, body) => {
								assert.ifError(error);
								assert.equal(res.statusCode, 200);
								assert.equal(body.topics[0].title, 'topic 2');
								assert.equal(body.topics[0].postcount, 2);
								assert.equal(body.topics[1].postcount, 1);
								next();
							});
						},
					], error => {
						next(error);
					});
				},
			], done);
		});

		it('should load a specific users topics from a category with tags', done => {
			async.waterfall([
				function (next) {
					categories.create({name: 'filtered-category'}, next);
				},
				function (category, next) {
					async.waterfall([
						function (next) {
							topics.post({
								uid: fooUid, cid: category.cid, title: 'topic 1', content: 'topic 1 OP', tags: ['java', 'cpp'],
							}, next);
						},
						function (data, next) {
							topics.post({
								uid: fooUid, cid: category.cid, title: 'topic 2', content: 'topic 2 OP', tags: ['node', 'javascript'],
							}, next);
						},
						function (data, next) {
							topics.post({
								uid: fooUid, cid: category.cid, title: 'topic 3', content: 'topic 3 OP', tags: ['java', 'cpp', 'best'],
							}, next);
						},
						function (data, next) {
							request(`${nconf.get('url')}/api/category/${category.slug}?tag=node&author=foo`, {jar, json: true}, (error, res, body) => {
								assert.ifError(error);
								assert.equal(res.statusCode, 200);
								assert.equal(body.topics[0].title, 'topic 2');
								next();
							});
						},
						function (next) {
							request(`${nconf.get('url')}/api/category/${category.slug}?tag[]=java&tag[]=cpp`, {jar, json: true}, (error, res, body) => {
								assert.ifError(error);
								assert.equal(res.statusCode, 200);
								assert.equal(body.topics[0].title, 'topic 3');
								assert.equal(body.topics[1].title, 'topic 1');
								next();
							});
						},
					], error => {
						next(error);
					});
				},
			], done);
		});

		it('should redirect if category is a link', done => {
			let cid;
			let category;
			async.waterfall([
				function (next) {
					categories.create({name: 'redirect', link: 'https://nodebb.org'}, next);
				},
				function (_category, next) {
					category = _category;
					cid = category.cid;
					request(`${nconf.get('url')}/api/category/${category.slug}`, {jar, json: true}, (error, res, body) => {
						assert.ifError(error);
						assert.equal(res.statusCode, 200);
						assert.equal(res.headers['x-redirect'], 'https://nodebb.org');
						assert.equal(body, 'https://nodebb.org');
						next();
					});
				},
				function (next) {
					categories.setCategoryField(cid, 'link', '/recent', next);
				},
				function (next) {
					request(`${nconf.get('url')}/api/category/${category.slug}`, {jar, json: true}, (error, res, body) => {
						assert.ifError(error);
						assert.equal(res.statusCode, 200);
						assert.equal(res.headers['x-redirect'], '/recent');
						assert.equal(body, '/recent');
						next();
					});
				},
			], done);
		});

		it('should get recent topic replies from children categories', done => {
			let parentCategory;
			let childCategory1;
			let childCategory2;

			async.waterfall([
				function (next) {
					categories.create({name: 'parent category', backgroundImage: 'path/to/some/image'}, next);
				},
				function (category, next) {
					parentCategory = category;
					async.waterfall([
						function (next) {
							categories.create({name: 'child category 1', parentCid: category.cid}, next);
						},
						function (category, next) {
							childCategory1 = category;
							categories.create({name: 'child category 2', parentCid: parentCategory.cid}, next);
						},
						function (category, next) {
							childCategory2 = category;
							topics.post({
								uid: fooUid, cid: childCategory2.cid, title: 'topic 1', content: 'topic 1 OP',
							}, next);
						},
						function (data, next) {
							request(`${nconf.get('url')}/api/category/${parentCategory.slug}`, {jar, json: true}, (error, res, body) => {
								assert.ifError(error);
								assert.equal(res.statusCode, 200);
								assert.equal(body.children[0].posts[0].content, 'topic 1 OP');
								next();
							});
						},
					], error => {
						next(error);
					});
				},
			], done);
		});

		it('should create 2 pages of topics', done => {
			async.waterfall([
				function (next) {
					categories.create({name: 'category with 2 pages'}, next);
				},
				function (category, next) {
					const titles = [];
					for (let i = 0; i < 30; i++) {
						titles.push(`topic title ${i}`);
					}

					async.waterfall([
						function (next) {
							async.eachSeries(titles, (title, next) => {
								topics.post({
									uid: fooUid, cid: category.cid, title, content: 'does not really matter',
								}, next);
							}, next);
						},
						function (next) {
							user.getSettings(fooUid, next);
						},
						function (settings, next) {
							request(`${nconf.get('url')}/api/category/${category.slug}`, {jar, json: true}, (error, res, body) => {
								assert.ifError(error);
								assert.equal(res.statusCode, 200);
								assert.equal(body.topics.length, settings.topicsPerPage);
								assert.equal(body.pagination.pageCount, 2);
								next();
							});
						},
					], error => {
						next(error);
					});
				},
			], done);
		});

		it('should load categories', async () => {
			const helpers = require('../src/controllers/helpers');
			const data = await helpers.getCategories('cid:0:children', 1, 'topics:read', 0);
			assert(data.categories.length > 0);
			assert.strictEqual(data.selectedCategory, null);
			assert.deepStrictEqual(data.selectedCids, []);
		});

		it('should load categories by states', async () => {
			const helpers = require('../src/controllers/helpers');
			const data = await helpers.getCategoriesByStates(1, 1, Object.values(categories.watchStates), 'topics:read');
			assert.deepStrictEqual(data.selectedCategory.cid, 1);
			assert.deepStrictEqual(data.selectedCids, [1]);
		});

		it('should load categories by states', async () => {
			const helpers = require('../src/controllers/helpers');
			const data = await helpers.getCategoriesByStates(1, 0, [categories.watchStates.ignoring], 'topics:read');
			assert(data.categories.length === 0);
			assert.deepStrictEqual(data.selectedCategory, null);
			assert.deepStrictEqual(data.selectedCids, []);
		});
	});

	describe('unread', () => {
		let jar;
		before(async () => {
			({jar} = await helpers.loginUser('foo', 'barbar'));
		});

		it('should load unread page', done => {
			request(`${nconf.get('url')}/api/unread`, {jar}, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				done();
			});
		});

		it('should 404 if filter is invalid', done => {
			request(`${nconf.get('url')}/api/unread/doesnotexist`, {jar}, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				done();
			});
		});

		it('should return total unread count', done => {
			request(`${nconf.get('url')}/api/unread/total?filter=new`, {jar}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert.equal(body, 0);
				done();
			});
		});

		it('should redirect if page is out of bounds', done => {
			request(`${nconf.get('url')}/api/unread?page=-1`, {jar, json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert.equal(res.headers['x-redirect'], '/unread?page=1');
				assert.equal(body, '/unread?page=1');
				done();
			});
		});
	});

	describe('admin middlewares', () => {
		it('should redirect to login', done => {
			request(`${nconf.get('url')}//api/admin/advanced/database`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 401);
				done();
			});
		});

		it('should redirect to login', done => {
			request(`${nconf.get('url')}//admin/advanced/database`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body.includes('Login to your account'));
				done();
			});
		});
	});

	describe('composer', () => {
		let csrf_token;
		let jar;

		before(async () => {
			const login = await helpers.loginUser('foo', 'barbar');
			jar = login.jar;
			csrf_token = login.csrf_token;
		});

		it('should load the composer route', done => {
			request(`${nconf.get('url')}/api/compose?cid=1`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body.title);
				assert(body.template);
				assert.equal(body.url, `${nconf.get('relative_path')}/compose`);
				done();
			});
		});

		it('should load the composer route if disabled by plugin', done => {
			function hookMethod(hookData, callback) {
				hookData.templateData.disabled = true;
				callback(null, hookData);
			}

			plugins.hooks.register('myTestPlugin', {
				hook: 'filter:composer.build',
				method: hookMethod,
			});

			request(`${nconf.get('url')}/api/compose?cid=1`, {json: true}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body.title);
				assert.strictEqual(body.template.name, '');
				assert.strictEqual(body.url, `${nconf.get('relative_path')}/compose`);

				plugins.hooks.unregister('myTestPlugin', 'filter:composer.build', hookMethod);
				done();
			});
		});

		it('should error with invalid data', done => {
			request.post(`${nconf.get('url')}/compose`, {
				form: {
					content: 'a new reply',
				},
				jar,
				headers: {
					'x-csrf-token': csrf_token,
				},
			}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 400);
				request.post(`${nconf.get('url')}/compose`, {
					form: {
						tid,
					},
					jar,
					headers: {
						'x-csrf-token': csrf_token,
					},
				}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 400);
					done();
				});
			});
		});

		it('should create a new topic and reply by composer route', done => {
			const data = {
				cid,
				title: 'no js is good',
				content: 'a topic with noscript',
			};
			request.post(`${nconf.get('url')}/compose`, {
				form: data,
				jar,
				headers: {
					'x-csrf-token': csrf_token,
				},
			}, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 302);
				request.post(`${nconf.get('url')}/compose`, {
					form: {
						tid,
						content: 'a new reply',
					},
					jar,
					headers: {
						'x-csrf-token': csrf_token,
					},
				}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 302);
					done();
				});
			});
		});
	});

	describe('test routes', () => {
		if (process.env.NODE_ENV === 'development') {
			it('should load debug route', done => {
				request(`${nconf.get('url')}/debug/test`, {}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 404);
					assert(body);
					done();
				});
			});

			it('should load redoc read route', done => {
				request(`${nconf.get('url')}/debug/spec/read`, {}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body);
					done();
				});
			});

			it('should load redoc write route', done => {
				request(`${nconf.get('url')}/debug/spec/write`, {}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body);
					done();
				});
			});

			it('should load 404 for invalid type', done => {
				request(`${nconf.get('url')}/debug/spec/doesnotexist`, {}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 404);
					assert(body);
					done();
				});
			});
		}
	});

	after(done => {
		const analytics = require('../src/analytics');
		analytics.writeData(done);
	});
});
