'use strict';

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const nconf = require('nconf');
const request = require('request');
const plugins = require('../src/plugins');
const db = require('./mocks/databasemock');

describe('Plugins', () => {
	it('should load plugin data', done => {
		const pluginId = 'nodebb-plugin-markdown';
		plugins.loadPlugin(path.join(nconf.get('base_dir'), `node_modules/${pluginId}`), error => {
			assert.ifError(error);
			assert(plugins.libraries[pluginId]);
			assert(plugins.loadedHooks['static:app.load']);

			done();
		});
	});

	it('should return true if hook has listeners', done => {
		assert(plugins.hooks.hasListeners('filter:parse.post'));
		done();
	});

	it('should register and fire a filter hook', done => {
		function filterMethod1(data, callback) {
			data.foo += 1;
			callback(null, data);
		}

		function filterMethod2(data, callback) {
			data.foo += 5;
			callback(null, data);
		}

		plugins.hooks.register('test-plugin', {hook: 'filter:test.hook', method: filterMethod1});
		plugins.hooks.register('test-plugin', {hook: 'filter:test.hook', method: filterMethod2});

		plugins.hooks.fire('filter:test.hook', {foo: 1}, (error, data) => {
			assert.ifError(error);
			assert.equal(data.foo, 7);
			done();
		});
	});

	it('should register and fire a filter hook having 3 methods', async () => {
		function method1(data, callback) {
			data.foo += 1;
			callback(null, data);
		}

		async function method2(data) {
			return new Promise(resolve => {
				data.foo += 5;
				resolve(data);
			});
		}

		function method3(data) {
			data.foo += 1;
			return data;
		}

		plugins.hooks.register('test-plugin', {hook: 'filter:test.hook2', method: method1});
		plugins.hooks.register('test-plugin', {hook: 'filter:test.hook2', method: method2});
		plugins.hooks.register('test-plugin', {hook: 'filter:test.hook2', method: method3});

		const data = await plugins.hooks.fire('filter:test.hook2', {foo: 1});
		assert.strictEqual(data.foo, 8);
	});

	it('should not error with invalid hooks', async () => {
		function method1(data, callback) {
			data.foo += 1;
			return data;
		}

		function method2(data, callback) {
			data.foo += 2;
			// This is invalid
			callback(null, data);
			return data;
		}

		plugins.hooks.register('test-plugin', {hook: 'filter:test.hook3', method: method1});
		plugins.hooks.register('test-plugin', {hook: 'filter:test.hook3', method: method2});

		const data = await plugins.hooks.fire('filter:test.hook3', {foo: 1});
		assert.strictEqual(data.foo, 4);
	});

	it('should register and fire a filter hook that returns a promise that gets rejected', done => {
		async function method(data) {
			return new Promise((resolve, reject) => {
				data.foo += 5;
				reject(new Error('nope'));
			});
		}

		plugins.hooks.register('test-plugin', {hook: 'filter:test.hook4', method});
		plugins.hooks.fire('filter:test.hook4', {foo: 1}, error => {
			assert(error);
			done();
		});
	});

	it('should register and fire an action hook', done => {
		function actionMethod(data) {
			assert.equal(data.bar, 'test');
			done();
		}

		plugins.hooks.register('test-plugin', {hook: 'action:test.hook', method: actionMethod});
		plugins.hooks.fire('action:test.hook', {bar: 'test'});
	});

	it('should register and fire a static hook', done => {
		function actionMethod(data, callback) {
			assert.equal(data.bar, 'test');
			callback();
		}

		plugins.hooks.register('test-plugin', {hook: 'static:test.hook', method: actionMethod});
		plugins.hooks.fire('static:test.hook', {bar: 'test'}, error => {
			assert.ifError(error);
			done();
		});
	});

	it('should register and fire a static hook returning a promise', done => {
		async function method(data) {
			assert.equal(data.bar, 'test');
			return new Promise(resolve => {
				resolve();
			});
		}

		plugins.hooks.register('test-plugin', {hook: 'static:test.hook', method});
		plugins.hooks.fire('static:test.hook', {bar: 'test'}, error => {
			assert.ifError(error);
			done();
		});
	});

	it('should register and fire a static hook returning a promise that gets rejected with a error', done => {
		async function method(data) {
			assert.equal(data.bar, 'test');
			return new Promise((resolve, reject) => {
				reject(new Error('just because'));
			});
		}

		plugins.hooks.register('test-plugin', {hook: 'static:test.hook', method});
		plugins.hooks.fire('static:test.hook', {bar: 'test'}, error => {
			assert.strictEqual(error.message, 'just because');
			plugins.hooks.unregister('test-plugin', 'static:test.hook', method);
			done();
		});
	});

	it('should register and timeout a static hook returning a promise but takes too long', done => {
		async function method(data) {
			assert.equal(data.bar, 'test');
			return new Promise(resolve => {
				setTimeout(resolve, 6000);
			});
		}

		plugins.hooks.register('test-plugin', {hook: 'static:test.hook', method});
		plugins.hooks.fire('static:test.hook', {bar: 'test'}, error => {
			assert.ifError(error);
			plugins.hooks.unregister('test-plugin', 'static:test.hook', method);
			done();
		});
	});

	it('should get plugin data from nbbpm', done => {
		plugins.get('nodebb-plugin-markdown', (error, data) => {
			assert.ifError(error);
			const keys = ['id', 'name', 'url', 'description', 'latest', 'installed', 'active', 'latest'];
			assert.equal(data.name, 'nodebb-plugin-markdown');
			assert.equal(data.id, 'nodebb-plugin-markdown');
			for (const key of keys) {
				assert(data.hasOwnProperty(key));
			}

			done();
		});
	});

	it('should get a list of plugins', done => {
		plugins.list((error, data) => {
			assert.ifError(error);
			const keys = ['id', 'name', 'url', 'description', 'latest', 'installed', 'active', 'latest'];
			assert(Array.isArray(data));
			for (const key of keys) {
				assert(data[0].hasOwnProperty(key));
			}

			done();
		});
	});

	it('should show installed plugins', done => {
		const {nodeModulesPath} = plugins;
		plugins.nodeModulesPath = path.join(__dirname, './mocks/plugin_modules');

		plugins.showInstalled((error, pluginsData) => {
			assert.ifError(error);
			const paths = new Set(pluginsData.map(plugin => path.relative(plugins.nodeModulesPath, plugin.path).replaceAll('\\', '/')));
			assert(paths.has('nodebb-plugin-xyz'));
			assert(paths.has('@nodebb/nodebb-plugin-abc'));

			plugins.nodeModulesPath = nodeModulesPath;
			done();
		});
	});

	it('should submit usage info', done => {
		plugins.submitUsageData(error => {
			assert.ifError(error);
			done();
		});
	});

	describe('install/activate/uninstall', () => {
		let latest;
		const pluginName = 'nodebb-plugin-imgur';
		const oldValue = process.env.NODE_ENV;
		before(done => {
			process.env.NODE_ENV = 'development';
			done();
		});
		after(done => {
			process.env.NODE_ENV = oldValue;
			done();
		});

		it('should install a plugin', function (done) {
			this.timeout(0);
			plugins.toggleInstall(pluginName, '1.0.16', (error, pluginData) => {
				assert.ifError(error);
				latest = pluginData.latest;

				assert.equal(pluginData.name, pluginName);
				assert.equal(pluginData.id, pluginName);
				assert.equal(pluginData.url, 'https://github.com/barisusakli/nodebb-plugin-imgur#readme');
				assert.equal(pluginData.description, 'A Plugin that uploads images to imgur');
				assert.equal(pluginData.active, false);
				assert.equal(pluginData.installed, true);

				const packageFile = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
				assert(packageFile.dependencies[pluginName]);

				done();
			});
		});

		it('should activate plugin', done => {
			plugins.toggleActive(pluginName, error => {
				assert.ifError(error);
				plugins.isActive(pluginName, (error, isActive) => {
					assert.ifError(error);
					assert(isActive);
					done();
				});
			});
		});

		it('should upgrade plugin', function (done) {
			this.timeout(0);
			plugins.upgrade(pluginName, 'latest', (error, isActive) => {
				assert.ifError(error);
				assert(isActive);
				plugins.loadPluginInfo(path.join(nconf.get('base_dir'), 'node_modules', pluginName), (error, pluginInfo) => {
					assert.ifError(error);
					assert.equal(pluginInfo.version, latest);
					done();
				});
			});
		});

		it('should uninstall a plugin', function (done) {
			this.timeout(0);
			plugins.toggleInstall(pluginName, 'latest', (error, pluginData) => {
				assert.ifError(error);
				assert.equal(pluginData.installed, false);
				assert.equal(pluginData.active, false);

				const packageFile = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
				assert(!packageFile.dependencies[pluginName]);

				done();
			});
		});
	});

	describe('static assets', () => {
		it('should 404 if resource does not exist', done => {
			request.get(`${nconf.get('url')}/plugins/doesnotexist/should404.tpl`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				assert(body);
				done();
			});
		});

		it('should 404 if resource does not exist', done => {
			const url = `${nconf.get('url')}/plugins/nodebb-plugin-dbsearch/dbsearch/templates/admin/plugins/should404.tpl`;
			request.get(url, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				assert(body);
				done();
			});
		});

		it('should get resource', done => {
			const url = `${nconf.get('url')}/assets/templates/admin/plugins/dbsearch.tpl`;
			request.get(url, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});
	});

	describe('plugin state set in configuration', () => {
		const activePlugins = [
			'nodebb-plugin-markdown',
			'nodebb-plugin-mentions',
		];
		const inactivePlugin = 'nodebb-plugin-emoji';
		beforeEach(done => {
			nconf.set('plugins:active', activePlugins);
			done();
		});
		afterEach(done => {
			nconf.set('plugins:active', undefined);
			done();
		});

		it('should return active plugin state from configuration', done => {
			plugins.isActive(activePlugins[0], (error, isActive) => {
				assert.ifError(error);
				assert(isActive);
				done();
			});
		});

		it('should return inactive plugin state if not in configuration', done => {
			plugins.isActive(inactivePlugin, (error, isActive) => {
				assert.ifError(error);
				assert(!isActive);
				done();
			});
		});

		it('should get a list of plugins from configuration', done => {
			plugins.list((error, data) => {
				assert.ifError(error);
				const keys = ['id', 'name', 'url', 'description', 'latest', 'installed', 'active', 'latest'];
				assert(Array.isArray(data));
				for (const key of keys) {
					assert(data[0].hasOwnProperty(key));
				}

				for (const pluginData of data) {
					assert.equal(pluginData.active, activePlugins.includes(pluginData.id));
				}

				done();
			});
		});

		it('should return a list of only active plugins from configuration', done => {
			plugins.getActive((error, data) => {
				assert.ifError(error);
				assert(Array.isArray(data));
				for (const pluginData of data) {
					console.log(pluginData);
					assert(activePlugins.includes(pluginData));
				}

				done();
			});
		});

		it('should not deactivate a plugin if active plugins are set in configuration', done => {
			assert.rejects(plugins.toggleActive(activePlugins[0]), Error).then(() => {
				plugins.isActive(activePlugins[0], (error, isActive) => {
					assert.ifError(error);
					assert(isActive);
					done();
				});
			});
		});

		it('should not activate a plugin if active plugins are set in configuration', done => {
			assert.rejects(plugins.toggleActive(inactivePlugin), Error).then(() => {
				plugins.isActive(inactivePlugin, (error, isActive) => {
					assert.ifError(error);
					assert(!isActive);
					done();
				});
			});
		});
	});
});

