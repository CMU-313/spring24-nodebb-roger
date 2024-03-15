'use strict';

const assert = require('node:assert');
const async = require('async');
const request = require('request');
const nconf = require('nconf');
const topics = require('../src/topics');
const categories = require('../src/categories');
const groups = require('../src/groups');
const user = require('../src/user');
const meta = require('../src/meta');
const privileges = require('../src/privileges');
const db = require('./mocks/databasemock');
const helpers = require('./helpers');

describe('feeds', () => {
	let tid;
	let pid;
	let fooUid;
	let cid;
	before(done => {
		meta.config['feeds:disableRSS'] = 1;
		async.series({
			category(next) {
				categories.create({
					name: 'Test Category',
					description: 'Test category created by testing script',
				}, next);
			},
			user(next) {
				user.create({username: 'foo', password: 'barbar', email: 'foo@test.com'}, next);
			},
		}, (error, results) => {
			if (error) {
				return done(error);
			}

			cid = results.category.cid;
			fooUid = results.user;

			topics.post({
				uid: results.user, title: 'test topic title', content: 'test topic content', cid: results.category.cid,
			}, (error, result) => {
				tid = result.topicData.tid;
				pid = result.postData.pid;
				done(error);
			});
		});
	});

	it('should 404', done => {
		const feedUrls = [
			`${nconf.get('url')}/topic/${tid}.rss`,
			`${nconf.get('url')}/category/${cid}.rss`,
			`${nconf.get('url')}/topics.rss`,
			`${nconf.get('url')}/recent.rss`,
			`${nconf.get('url')}/top.rss`,
			`${nconf.get('url')}/popular.rss`,
			`${nconf.get('url')}/popular/day.rss`,
			`${nconf.get('url')}/recentposts.rss`,
			`${nconf.get('url')}/category/${cid}/recentposts.rss`,
			`${nconf.get('url')}/user/foo/topics.rss`,
			`${nconf.get('url')}/tags/nodebb.rss`,
		];
		async.eachSeries(feedUrls, (url, next) => {
			request(url, (error, res) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 404);
				next();
			});
		}, error => {
			assert.ifError(error);
			meta.config['feeds:disableRSS'] = 0;
			done();
		});
	});

	it('should 404 if topic does not exist', done => {
		request(`${nconf.get('url')}/topic/${1000}.rss`, (error, res) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 404);
			done();
		});
	});

	it('should 404 if category id is not a number', done => {
		request(`${nconf.get('url')}/category/invalid.rss`, (error, res) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 404);
			done();
		});
	});

	it('should redirect if we do not have read privilege', done => {
		privileges.categories.rescind(['groups:topics:read'], cid, 'guests', error => {
			assert.ifError(error);
			request(`${nconf.get('url')}/topic/${tid}.rss`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				assert(body.includes('Login to your account'));
				privileges.categories.give(['groups:topics:read'], cid, 'guests', done);
			});
		});
	});

	it('should 404 if user is not found', done => {
		request(`${nconf.get('url')}/user/doesnotexist/topics.rss`, (error, res) => {
			assert.ifError(error);
			assert.equal(res.statusCode, 404);
			done();
		});
	});

	it('should redirect if we do not have read privilege', done => {
		privileges.categories.rescind(['groups:read'], cid, 'guests', error => {
			assert.ifError(error);
			request(`${nconf.get('url')}/category/${cid}.rss`, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				assert(body.includes('Login to your account'));
				privileges.categories.give(['groups:read'], cid, 'guests', done);
			});
		});
	});

	describe('private feeds and tokens', () => {
		let jar;
		let rssToken;
		before(async () => {
			({jar} = await helpers.loginUser('foo', 'barbar'));
		});

		it('should load feed if its not private', done => {
			request(`${nconf.get('url')}/category/${cid}.rss`, {}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body);
				done();
			});
		});

		it('should not allow access if uid or token is missing', done => {
			privileges.categories.rescind(['groups:read'], cid, 'guests', error => {
				assert.ifError(error);
				async.parallel({
					test1(next) {
						request(`${nconf.get('url')}/category/${cid}.rss?uid=${fooUid}`, {}, next);
					},
					test2(next) {
						request(`${nconf.get('url')}/category/${cid}.rss?token=sometoken`, {}, next);
					},
				}, (error, results) => {
					assert.ifError(error);
					assert.equal(results.test1[0].statusCode, 200);
					assert.equal(results.test2[0].statusCode, 200);
					assert(results.test1[0].body.includes('Login to your account'));
					assert(results.test2[0].body.includes('Login to your account'));
					done();
				});
			});
		});

		it('should not allow access if token is wrong', done => {
			request(`${nconf.get('url')}/category/${cid}.rss?uid=${fooUid}&token=sometoken`, {}, (error, res, body) => {
				assert.ifError(error);
				assert.equal(res.statusCode, 200);
				assert(body.includes('Login to your account'));
				done();
			});
		});

		it('should allow access if token is correct', done => {
			request(`${nconf.get('url')}/api/category/${cid}`, {jar, json: true}, (error, res, body) => {
				assert.ifError(error);
				rssToken = body.rssFeedUrl.split('token')[1].slice(1);
				request(`${nconf.get('url')}/category/${cid}.rss?uid=${fooUid}&token=${rssToken}`, {}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body.startsWith('<?xml version="1.0"'));
					done();
				});
			});
		});

		it('should not allow access if token is correct but has no privilege', done => {
			privileges.categories.rescind(['groups:read'], cid, 'registered-users', error => {
				assert.ifError(error);
				request(`${nconf.get('url')}/category/${cid}.rss?uid=${fooUid}&token=${rssToken}`, {}, (error, res, body) => {
					assert.ifError(error);
					assert.equal(res.statusCode, 200);
					assert(body.includes('Login to your account'));
					done();
				});
			});
		});
	});
});
