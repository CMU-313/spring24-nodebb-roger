'use strict';

const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');
const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const async = require('async');
const file = require('../src/file');
const db = require('./mocks/databasemock');

describe('minifier', () => {
	const testPath = path.join(__dirname, '../test/build');
	before(async () => {
		await mkdirp(testPath);
	});

	after(async () => {
		const files = await file.walk(testPath);
		await Promise.all(files.map(async path => fs.promises.rm(path)));
		await fs.promises.rmdir(testPath);
	});

	const minifier = require('../src/meta/minifier');
	const scripts = [
		path.resolve(__dirname, './files/1.js'),
		path.resolve(__dirname, './files/2.js'),
	].map(script => ({
		srcPath: script,
		destPath: path.resolve(__dirname, '../test/build', path.basename(script)),
		filename: path.basename(script),
	}));

	it('.js.bundle() should concat scripts', done => {
		const destinationPath = path.resolve(__dirname, '../test/build/concatenated.js');

		minifier.js.bundle({
			files: scripts,
			destPath: destinationPath,
			filename: 'concatenated.js',
		}, false, false, error => {
			assert.ifError(error);

			assert(file.existsSync(destinationPath));

			assert.strictEqual(
				fs.readFileSync(destinationPath).toString().replaceAll('\r\n', '\n'),
				'(function (window, document) {'
                + '\n    window.doStuff = function () {'
                + '\n        document.body.innerHTML = \'Stuff has been done\';'
                + '\n    };'
                + '\n})(window, document);'
                + '\n'
                + '\n;function foo(name, age) {'
                + '\n    return \'The person known as "\' + name + \'" is \' + age + \' years old\';'
                + '\n}'
                + '\n',
			);
			done();
		});
	});
	it('.js.bundle() should minify scripts', done => {
		const destinationPath = path.resolve(__dirname, '../test/build/minified.js');

		minifier.js.bundle({
			files: scripts,
			destPath: destinationPath,
			filename: 'minified.js',
		}, true, false, error => {
			assert.ifError(error);

			assert(file.existsSync(destinationPath));

			assert.strictEqual(
				fs.readFileSync(destinationPath).toString(),
				'(function(n,o){n.doStuff=function(){o.body.innerHTML="Stuff has been done"}})(window,document);function foo(n,o){return\'The person known as "\'+n+\'" is \'+o+" years old"}'
                + '\n//# sourceMappingURL=minified.js.map',
			);
			done();
		});
	});

	it('.js.minifyBatch() should minify each script', done => {
		minifier.js.minifyBatch(scripts, false, error => {
			assert.ifError(error);

			assert(file.existsSync(scripts[0].destPath));
			assert(file.existsSync(scripts[1].destPath));

			fs.readFile(scripts[0].destPath, (error, buffer) => {
				assert.ifError(error);
				assert.strictEqual(
					buffer.toString(),
					'(function(n,o){n.doStuff=function(){o.body.innerHTML="Stuff has been done"}})(window,document);'
                    + '\n//# sourceMappingURL=1.js.map',
				);
				done();
			});
		});
	});

	const styles = [
		'@import (inline) "./1.css";',
		'@import "./2.less";',
	].join('\n');
	const paths = [
		path.resolve(__dirname, './files'),
	];
	it('.css.bundle() should concat styles', done => {
		minifier.css.bundle(styles, paths, false, false, (error, bundle) => {
			assert.ifError(error);
			assert.strictEqual(bundle.code, '.help { margin: 10px; } .yellow { background: yellow; }\n.help {\n  display: block;\n}\n.help .blue {\n  background: blue;\n}\n');
			done();
		});
	});

	it('.css.bundle() should minify styles', done => {
		minifier.css.bundle(styles, paths, true, false, (error, bundle) => {
			assert.ifError(error);
			assert.strictEqual(bundle.code, '.help{margin:10px}.yellow{background:#ff0}.help{display:block}.help .blue{background:#00f}');
			done();
		});
	});
});

describe('Build', () => {
	const build = require('../src/meta/build');

	before(done => {
		async.parallel([
			async.apply(rimraf, path.join(__dirname, '../build/public')),
			async.apply(db.sortedSetAdd, 'plugins:active', Date.now(), 'nodebb-plugin-markdown'),
		], done);
	});

	it('should build plugin static dirs', done => {
		build.build(['plugin static dirs'], error => {
			assert.ifError(error);
			done();
		});
	});

	it('should build requirejs modules', done => {
		build.build(['requirejs modules'], error => {
			assert.ifError(error);
			const filename = path.join(__dirname, '../build/public/src/modules/alerts.js');
			assert(file.existsSync(filename));
			done();
		});
	});

	it('should build client js bundle', done => {
		build.build(['client js bundle'], error => {
			assert.ifError(error);
			const filename = path.join(__dirname, '../build/public/scripts-client.js');
			assert(file.existsSync(filename));
			assert(fs.readFileSync(filename).length > 1000);
			done();
		});
	});

	it('should build admin js bundle', done => {
		build.build(['admin js bundle'], error => {
			assert.ifError(error);
			const filename = path.join(__dirname, '../build/public/scripts-admin.js');
			assert(file.existsSync(filename));
			assert(fs.readFileSync(filename).length > 1000);
			done();
		});
	});

	it('should build client side styles', done => {
		build.build(['client side styles'], error => {
			assert.ifError(error);
			const filename = path.join(__dirname, '../build/public/client.css');
			assert(file.existsSync(filename));
			assert(fs.readFileSync(filename).toString().startsWith('/*! normalize.css'));
			done();
		});
	});

	it('should build admin control panel styles', done => {
		build.build(['admin control panel styles'], error => {
			assert.ifError(error);
			const filename = path.join(__dirname, '../build/public/admin.css');
			assert(file.existsSync(filename));
			const adminCSS = fs.readFileSync(filename).toString();
			if (global.env === 'production') {
				assert(adminCSS.startsWith('@charset "UTF-8";') || adminCSS.startsWith('@import url'));
			} else {
				assert(adminCSS.startsWith('.recent-replies'));
			}

			done();
		});
	});

	/* Disabled, doesn't work on gh actions in prod mode
    it('should build bundle files', function (done) {
        this.timeout(0);
        build.buildAll(async (err) => {
            assert.ifError(err);
            assert(file.existsSync(path.join(__dirname, '../build/webpack/nodebb.min.js')));
            assert(file.existsSync(path.join(__dirname, '../build/webpack/admin.min.js')));
            let { res, body } = await helpers.request('GET', `/assets/nodebb.min.js`, {});
            assert(res.statusCode, 200);
            assert(body);
            ({ res, body } = await helpers.request('GET', `/assets/admin.min.js`, {}));
            assert(res.statusCode, 200);
            assert(body);
            done();
        });
    });
    */

	it('should build templates', function (done) {
		this.timeout(0);
		build.build(['templates'], error => {
			assert.ifError(error);
			const filename = path.join(__dirname, '../build/public/templates/admin/header.tpl');
			assert(file.existsSync(filename));
			assert(fs.readFileSync(filename).toString().startsWith('<!DOCTYPE html>'));
			done();
		});
	});

	it('should build languages', done => {
		build.build(['languages'], error => {
			assert.ifError(error);

			const globalFile = path.join(__dirname, '../build/public/language/en-GB/global.json');
			assert(file.existsSync(globalFile), 'global.json exists');
			const global = fs.readFileSync(globalFile).toString();
			assert.strictEqual(JSON.parse(global).home, 'Home', 'global.json contains correct translations');

			const mdFile = path.join(__dirname, '../build/public/language/en-GB/markdown.json');
			assert(file.existsSync(mdFile), 'markdown.json exists');
			const md = fs.readFileSync(mdFile).toString();
			assert.strictEqual(JSON.parse(md).bold, 'bolded text', 'markdown.json contains correct translations');

			done();
		});
	});
});
