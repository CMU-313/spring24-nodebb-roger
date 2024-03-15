'use strict';

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const util = require('node:util');
const request = require('request-promise-native');
const nconf = require('nconf');
const jwt = require('jsonwebtoken');
const SwaggerParser = require('@apidevtools/swagger-parser');
const _ = require('lodash');

const wait = util.promisify(setTimeout);

const meta = require('../src/meta');
const user = require('../src/user');
const groups = require('../src/groups');
const categories = require('../src/categories');
const topics = require('../src/topics');
const posts = require('../src/posts');
const plugins = require('../src/plugins');
const flags = require('../src/flags');
const messaging = require('../src/messaging');
const utils = require('../src/utils');
const helpers = require('./helpers');
const db = require('./mocks/databasemock');

describe('API', async () => {
	let readApi = false;
	let writeApi = false;
	const readApiPath = path.resolve(__dirname, '../public/openapi/read.yaml');
	const writeApiPath = path.resolve(__dirname, '../public/openapi/write.yaml');
	let jar;
	let csrfToken;
	let setup = false;
	const unauthenticatedRoutes = new Set(['/api/login', '/api/register']); // Everything else will be called with the admin user

	const mocks = {
		head: {},
		get: {
			'/api/email/unsubscribe/{token}': [
				{
					in: 'path',
					name: 'token',
					example: (() => jwt.sign({
						template: 'digest',
						uid: 1,
					}, nconf.get('secret')))(),
				},
			],
		},
		post: {},
		put: {},
		delete: {
			'/users/{uid}/tokens/{token}': [
				{
					in: 'path',
					name: 'uid',
					example: 1,
				},
				{
					in: 'path',
					name: 'token',
					example: utils.generateUUID(),
				},
			],
			'/users/{uid}/sessions/{uuid}': [
				{
					in: 'path',
					name: 'uid',
					example: 1,
				},
				{
					in: 'path',
					name: 'uuid',
					example: '', // To be defined below...
				},
			],
			'/posts/{pid}/diffs/{timestamp}': [
				{
					in: 'path',
					name: 'pid',
					example: '', // To be defined below...
				},
				{
					in: 'path',
					name: 'timestamp',
					example: '', // To be defined below...
				},
			],
		},
	};

	async function dummySearchHook(data) {
		return [1];
	}

	async function dummyEmailerHook(data) {
		// Pretend to handle sending emails
	}

	after(async () => {
		plugins.hooks.unregister('core', 'filter:search.query', dummySearchHook);
		plugins.hooks.unregister('emailer-test', 'filter:email.send');
	});

	async function setupData() {
		if (setup) {
			return;
		}

		// Create sample users
		const adminUid = await user.create({username: 'admin', password: '123456', email: 'test@example.org'});
		const unprivUid = await user.create({username: 'unpriv', password: '123456', email: 'unpriv@example.org'});
		await user.setUserField(adminUid, 'email', 'test@example.org');
		await user.setUserField(unprivUid, 'email', 'unpriv@example.org');
		await user.email.confirmByUid(adminUid);
		await user.email.confirmByUid(unprivUid);

		for (let x = 0; x < 4; x++) {
			// eslint-disable-next-line no-await-in-loop
			await user.create({username: 'deleteme', password: '123456'}); // For testing of DELETE /users (uids 5, 6) and DELETE /user/:uid/account (uid 7)
		}

		await groups.join('administrators', adminUid);

		// Create sample group
		await groups.create({
			name: 'Test Group',
		});

		await meta.settings.set('core.api', {
			tokens: [{
				token: mocks.delete['/users/{uid}/tokens/{token}'][1].example,
				uid: 1,
				description: 'for testing of token deletion route',
				timestamp: Date.now(),
			}],
		});
		meta.config.allowTopicsThumbnail = 1;
		meta.config.termsOfUse = 'I, for one, welcome our new test-driven overlords';
		meta.config.chatMessageDelay = 0;

		// Create a category
		const testCategory = await categories.create({name: 'test'});

		// Post a new topic
		await topics.post({
			uid: adminUid,
			cid: testCategory.cid,
			title: 'Test Topic',
			content: 'Test topic content',
		});
		const unprivTopic = await topics.post({
			uid: unprivUid,
			cid: testCategory.cid,
			title: 'Test Topic 2',
			content: 'Test topic 2 content',
		});
		await topics.post({
			uid: unprivUid,
			cid: testCategory.cid,
			title: 'Test Topic 3',
			content: 'Test topic 3 content',
		});

		// Create a post diff
		await posts.edit({
			uid: adminUid,
			pid: unprivTopic.postData.pid,
			content: 'Test topic 2 edited content',
			req: {},
		});
		mocks.delete['/posts/{pid}/diffs/{timestamp}'][0].example = unprivTopic.postData.pid;
		mocks.delete['/posts/{pid}/diffs/{timestamp}'][1].example = (await posts.diffs.list(unprivTopic.postData.pid))[0];

		// Create a sample flag
		const {flagId} = await flags.create('post', 1, unprivUid, 'sample reasons', Date.now()); // Deleted in DELETE /api/v3/flags/1
		await flags.appendNote(flagId, 1, 'test note', 1_626_446_956_652);
		await flags.create('post', 2, unprivUid, 'sample reasons', Date.now()); // For testing flag notes (since flag 1 deleted)

		// Create a new chat room
		await messaging.newRoom(1, [2]);

		// Create an empty file to test DELETE /files and thumb deletion
		fs.closeSync(fs.openSync(path.resolve(nconf.get('upload_path'), 'files/test.txt'), 'w'));
		fs.closeSync(fs.openSync(path.resolve(nconf.get('upload_path'), 'files/test.png'), 'w'));

		// Associate thumb with topic to test thumb reordering
		await topics.thumbs.associate({
			id: 2,
			path: 'files/test.png',
		});

		const socketUser = require('../src/socket.io/user');
		const socketAdmin = require('../src/socket.io/admin');
		// Export data for admin user
		await socketUser.exportProfile({uid: adminUid}, {uid: adminUid});
		await wait(2000);
		await socketUser.exportPosts({uid: adminUid}, {uid: adminUid});
		await wait(2000);
		await socketUser.exportUploads({uid: adminUid}, {uid: adminUid});
		await wait(2000);
		await socketAdmin.user.exportUsersCSV({uid: adminUid}, {});
		// Wait for export child process to complete
		await wait(5000);

		// Attach a search hook so /api/search is enabled
		plugins.hooks.register('core', {
			hook: 'filter:search.query',
			method: dummySearchHook,
		});
		// Attach an emailer hook so related requests do not error
		plugins.hooks.register('emailer-test', {
			hook: 'filter:email.send',
			method: dummyEmailerHook,
		});

		// All tests run as admin user
		({jar} = await helpers.loginUser('admin', '123456'));

		// Retrieve CSRF token using cookie, to test Write API
		const config = await request({
			url: `${nconf.get('url')}/api/config`,
			json: true,
			jar,
		});
		csrfToken = config.csrf_token;

		setup = true;
	}

	it('should pass OpenAPI v3 validation', async () => {
		try {
			await SwaggerParser.validate(readApiPath);
			await SwaggerParser.validate(writeApiPath);
		} catch (error) {
			assert.ifError(error);
		}
	});

	readApi = await SwaggerParser.dereference(readApiPath);
	writeApi = await SwaggerParser.dereference(writeApiPath);

	it('should grab all mounted routes and ensure a schema exists', async () => {
		const webserver = require('../src/webserver');
		const buildPaths = function (stack, prefix) {
			const paths = stack.map(dispatch => {
				if (dispatch.route && dispatch.route.path && typeof dispatch.route.path === 'string') {
					if (!prefix && !dispatch.route.path.startsWith('/api/')) {
						return null;
					}

					if (prefix === nconf.get('relative_path')) {
						prefix = '';
					}

					return {
						method: Object.keys(dispatch.route.methods)[0],
						path: (prefix || '') + dispatch.route.path,
					};
				}

				if (dispatch.name === 'router') {
					const prefix = dispatch.regexp.toString().replace('/^', '').replace('\\/?(?=\\/|$)/i', '').replaceAll('\\/', '/');
					return buildPaths(dispatch.handle.stack, prefix);
				}

				// Drop any that aren't actual routes (middlewares, error handlers, etc.)
				return null;
			});

			return paths.flat();
		};

		let paths = buildPaths(webserver.app._router.stack).filter(Boolean).map(pathObject => {
			pathObject.path = pathObject.path.replaceAll(/\/:([^\\/]+)/g, '/{$1}');
			return pathObject;
		});
		const exclusionPrefixes = [
			'/api/admin/plugins',
			'/api/compose',
			'/debug',
			'/api/user/{userslug}/theme', // From persona
		];
		paths = paths.filter(path => path.method !== '_all' && !exclusionPrefixes.some(prefix => path.path.startsWith(prefix)));

		// For each express path, query for existence in read and write api schemas
		for (const pathObject of paths) {
			describe(`${pathObject.method.toUpperCase()} ${pathObject.path}`, () => {
				it('should be defined in schema docs', () => {
					let schema = readApi;
					if (pathObject.path.startsWith('/api/v3')) {
						schema = writeApi;
						pathObject.path = pathObject.path.replace('/api/v3', '');
					}

					// Don't check non-GET routes in Read API
					if (schema === readApi && pathObject.method !== 'get') {
						return;
					}

					const normalizedPath = pathObject.path.replaceAll(/\/:([^\\/]+)/g, '/{$1}').replaceAll('?', '');
					assert(schema.paths.hasOwnProperty(normalizedPath), `${pathObject.path} is not defined in schema docs`);
					assert(schema.paths[normalizedPath].hasOwnProperty(pathObject.method), `${pathObject.path} was found in schema docs, but ${pathObject.method.toUpperCase()} method is not defined`);
				});
			});
		}
	});

	// GenerateTests(readApi, Object.keys(readApi.paths));
	generateTests(writeApi, Object.keys(writeApi.paths), writeApi.servers[0].url);

	function generateTests(api, paths, prefix) {
		// Iterate through all documented paths, make a call to it,
		// and compare the result body with what is defined in the spec
		const pathLibrary = path; // For calling path module from inside this forEach
		for (const path of paths) {
			const context = api.paths[path];
			let schema;
			let response;
			let url;
			let method;
			const headers = {};
			const qs = {};

			for (const _method of Object.keys(context)) {
				// Only test GET routes in the Read API
				if (api.info.title === 'NodeBB Read API' && _method !== 'get') {
					continue;
				}

				it(`${_method.toUpperCase()} ${path}: should have each path parameter defined in its context`, () => {
					method = _method;
					if (!context[method].parameters) {
						return;
					}

					const pathParameters = (path.match(/{[\w\-_*]+}?/g) || []).map(match => match.slice(1, -1));
					const schemaParameters = new Set(context[method].parameters.map(parameter => (parameter.in === 'path' ? parameter.name : null)).filter(Boolean));
					assert(pathParameters.every(parameter => schemaParameters.has(parameter)), `${method.toUpperCase()} ${path} has path parameters specified but not defined`);
				});

				it(`${_method.toUpperCase()} ${path}: should have examples when parameters are present`, () => {
					let {parameters} = context[method];
					let testPath = path;

					if (parameters) {
						// Use mock data if provided
						parameters = mocks[method][path] || parameters;

						for (const parameter of parameters) {
							assert(parameter.example !== null && parameter.example !== undefined, `${method.toUpperCase()} ${path} has parameters without examples`);

							switch (parameter.in) {
								case 'path': {
									testPath = testPath.replace(`{${parameter.name}}`, parameter.example);
									break;
								}

								case 'header': {
									headers[parameter.name] = parameter.example;
									break;
								}

								case 'query': {
									qs[parameter.name] = parameter.example;
									break;
								}
							}
						}
					}

					url = nconf.get('url') + (prefix || '') + testPath;
				});

				it(`${_method.toUpperCase()} ${path}: should contain a valid request body (if present) with application/json or multipart/form-data type if POST/PUT/DELETE`, () => {
					if (['post', 'put', 'delete'].includes(method) && context[method].hasOwnProperty('requestBody')) {
						const failMessage = `${method.toUpperCase()} ${path} has a malformed request body`;
						assert(context[method].requestBody, failMessage);
						assert(context[method].requestBody.content, failMessage);

						if (context[method].requestBody.content.hasOwnProperty('application/json')) {
							assert(context[method].requestBody.content['application/json'], failMessage);
							assert(context[method].requestBody.content['application/json'].schema, failMessage);
							assert(context[method].requestBody.content['application/json'].schema.properties, failMessage);
						} else if (context[method].requestBody.content.hasOwnProperty('multipart/form-data')) {
							assert(context[method].requestBody.content['multipart/form-data'], failMessage);
							assert(context[method].requestBody.content['multipart/form-data'].schema, failMessage);
							assert(context[method].requestBody.content['multipart/form-data'].schema.properties, failMessage);
						}
					}
				});

				it(`${_method.toUpperCase()} ${path}: should not error out when called`, async () => {
					await setupData();

					if (csrfToken) {
						headers['x-csrf-token'] = csrfToken;
					}

					let body = {};
					let type = 'json';
					if (context[method].hasOwnProperty('requestBody') && context[method].requestBody.content['application/json']) {
						body = buildBody(context[method].requestBody.content['application/json'].schema.properties);
					} else if (context[method].hasOwnProperty('requestBody') && context[method].requestBody.content['multipart/form-data']) {
						type = 'form';
					}

					try {
						if (type === 'json') {
							response = await request(url, {
								method,
								jar: unauthenticatedRoutes.has(path) ? undefined : jar,
								json: true,
								followRedirect: false, // All responses are significant (e.g. 302)
								simple: false, // Don't throw on non-200 (e.g. 302)
								resolveWithFullResponse: true, // Send full request back (to check statusCode)
								headers,
								qs,
								body,
							});
						} else if (type === 'form') {
							response = await new Promise((resolve, reject) => {
								helpers.uploadFile(url, pathLibrary.join(__dirname, './files/test.png'), {}, jar, csrfToken, (error, res) => {
									if (error) {
										return reject(error);
									}

									resolve(res);
								});
							});
						}
					} catch (error) {
						assert(!error, `${method.toUpperCase()} ${path} errored with: ${error.message}`);
					}
				});

				it(`${_method.toUpperCase()} ${path}: response status code should match one of the schema defined responses`, () => {
					// HACK: allow HTTP 418 I am a teapot, for now   👇
					assert(context[method].responses.hasOwnProperty('418') || Object.keys(context[method].responses).includes(String(response.statusCode)), `${method.toUpperCase()} ${path} sent back unexpected HTTP status code: ${response.statusCode} ${JSON.stringify(response.body)}`);
				});

				// Recursively iterate through schema properties, comparing type
				it(`${_method.toUpperCase()} ${path}: response body should match schema definition`, async () => {
					const http302 = context[method].responses['302'];
					if (http302 && response.statusCode === 302) {
						// Compare headers instead
						const expectedHeaders = Object.keys(http302.headers).reduce((memo, name) => {
							const value = http302.headers[name].schema.example;
							memo[name] = value.startsWith(nconf.get('relative_path')) ? value : nconf.get('relative_path') + value;
							return memo;
						}, {});

						for (const header of Object.keys(expectedHeaders)) {
							assert(response.headers[header.toLowerCase()]);
							assert.strictEqual(response.headers[header.toLowerCase()], expectedHeaders[header]);
						}

						return;
					}

					const http200 = context[method].responses['200'];
					if (!http200) {
						return;
					}

					assert.strictEqual(response.statusCode, 200, `HTTP 200 expected (path: ${method} ${path}`);

					const hasJSON = http200.content && http200.content['application/json'];
					if (hasJSON) {
						schema = context[method].responses['200'].content['application/json'].schema;
						compare(schema, response.body, method.toUpperCase(), path, 'root');
					}

					// TODO someday: text/csv, binary file type checking?
				});

				it(`${_method.toUpperCase()} ${path}: should successfully re-login if needed`, async () => {
					const reloginPaths = ['PUT /users/{uid}/password', 'DELETE /users/{uid}/sessions/{uuid}'];
					if (reloginPaths.includes(`${method.toUpperCase()} ${path}`)) {
						({jar} = await helpers.loginUser('admin', '123456'));
						const sessionUUIDs = await db.getObject('uid:1:sessionUUID:sessionId');
						mocks.delete['/users/{uid}/sessions/{uuid}'][1].example = Object.keys(sessionUUIDs).pop();

						// Retrieve CSRF token using cookie, to test Write API
						const config = await request({
							url: `${nconf.get('url')}/api/config`,
							json: true,
							jar,
						});
						csrfToken = config.csrf_token;
					}
				});

				it(`${_method.toUpperCase()} ${path}: should back out of a registration interstitial if needed`, async () => {
					const affectedPaths = ['GET /api/user/{userslug}/edit/email'];
					if (affectedPaths.includes(`${method.toUpperCase()} ${path}`)) {
						await request({
							uri: `${nconf.get('url')}/register/abort?_csrf=${csrfToken}`,
							method: 'POST',
							jar,
							simple: false,
						});
					}
				});
			}
		}
	}

	function buildBody(schema) {
		return Object.keys(schema).reduce((memo, current) => {
			memo[current] = schema[current].example;
			return memo;
		}, {});
	}

	function compare(schema, response, method, path, context) {
		let required = [];
		const additionalProperties = schema.hasOwnProperty('additionalProperties');

		function flattenAllOf(object) {
			return object.reduce((memo, object) => {
				if (object.allOf) {
					object = {properties: flattenAllOf(object.allOf)};
				} else {
					try {
						required = required.concat(object.required ? object.required : Object.keys(object.properties));
					} catch {
						assert.fail(`Syntax error re: allOf, perhaps you allOf'd an array? (path: ${method} ${path}, context: ${context})`);
					}
				}

				return {...memo, ...object.properties};
			}, {});
		}

		if (schema.allOf) {
			schema = flattenAllOf(schema.allOf);
		} else if (schema.properties) {
			required = schema.required || Object.keys(schema.properties);
			schema = schema.properties;
		} else {
			// If schema contains no properties, check passes
			return;
		}

		// Compare the schema to the response
		for (const property of required) {
			if (schema.hasOwnProperty(property)) {
				assert(response.hasOwnProperty(property), `"${property}" is a required property (path: ${method} ${path}, context: ${context})`);

				// Don't proceed with type-check if the value could possibly be unset (nullable: true, in spec)
				if (response[property] === null && schema[property].nullable === true) {
					continue;
				}

				// Therefore, if the value is actually null, that's a problem (nullable is probably missing)
				assert(response[property] !== null, `"${property}" was null, but schema does not specify it to be a nullable property (path: ${method} ${path}, context: ${context})`);

				switch (schema[property].type) {
					case 'string': {
						assert.strictEqual(typeof response[property], 'string', `"${property}" was expected to be a string, but was ${typeof response[property]} instead (path: ${method} ${path}, context: ${context})`);
						break;
					}

					case 'boolean': {
						assert.strictEqual(typeof response[property], 'boolean', `"${property}" was expected to be a boolean, but was ${typeof response[property]} instead (path: ${method} ${path}, context: ${context})`);
						break;
					}

					case 'object': {
						assert.strictEqual(typeof response[property], 'object', `"${property}" was expected to be an object, but was ${typeof response[property]} instead (path: ${method} ${path}, context: ${context})`);
						compare(schema[property], response[property], method, path, context ? [context, property].join('.') : property);
						break;
					}

					case 'array': {
						assert.strictEqual(Array.isArray(response[property]), true, `"${property}" was expected to be an array, but was ${typeof response[property]} instead (path: ${method} ${path}, context: ${context})`);

						if (schema[property].items) {
							// Ensure the array items have a schema defined
							assert(schema[property].items.type || schema[property].items.allOf, `"${property}" is defined to be an array, but its items have no schema defined (path: ${method} ${path}, context: ${context})`);

							// Compare types
							if (schema[property].items.type === 'object' || Array.isArray(schema[property].items.allOf)) {
								for (const res of response[property]) {
									compare(schema[property].items, res, method, path, context ? [context, property].join('.') : property);
								}
							} else if (response[property].length > 0) { // For now
								for (const item of response[property]) {
									assert.strictEqual(typeof item, schema[property].items.type, `"${property}" should have ${schema[property].items.type} items, but found ${typeof items} instead (path: ${method} ${path}, context: ${context})`);
								}
							}
						}

						break;
					}
				}
			}
		}

		// Compare the response to the schema
		for (const property of Object.keys(response)) {
			if (additionalProperties) { // All bets are off
				continue;
			}

			assert(schema[property], `"${property}" was found in response, but is not defined in schema (path: ${method} ${path}, context: ${context})`);
		}
	}
});
