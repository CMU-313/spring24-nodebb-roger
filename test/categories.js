'use strict';

const assert = require('node:assert');
const async = require('async');
const nconf = require('nconf');
const request = require('request');
const Categories = require('../src/categories');
const Topics = require('../src/topics');
const User = require('../src/user');
const groups = require('../src/groups');
const privileges = require('../src/privileges');
const db = require('./mocks/databasemock');

describe('Categories', () => {
	let categoryObject;
	let posterUid;
	let adminUid;

	before(done => {
		async.series({
			posterUid(next) {
				User.create({username: 'poster'}, next);
			},
			adminUid(next) {
				User.create({username: 'admin'}, next);
			},
		}, (error, results) => {
			assert.ifError(error);
			posterUid = results.posterUid;
			adminUid = results.adminUid;
			groups.join('administrators', adminUid, done);
		});
	});

	it('should create a new category', done => {
		Categories.create({
			name: 'Test Category & NodeBB',
			description: 'Test category created by testing script',
			icon: 'fa-check',
			blockclass: 'category-blue',
			order: '5',
		}, (error, category) => {
			assert.ifError(error);

			categoryObject = category;
			done();
		});
	});

	it('should retrieve a newly created category by its ID', done => {
		Categories.getCategoryById({
			cid: categoryObject.cid,
			start: 0,
			stop: -1,
			uid: 0,
		}, (error, categoryData) => {
			assert.ifError(error);

			assert(categoryData);
			assert.equal('Test Category &amp; NodeBB', categoryData.name);
			assert.equal(categoryObject.description, categoryData.description);
			assert.strictEqual(categoryObject.disabled, 0);
			done();
		});
	});

	it('should return null if category does not exist', done => {
		Categories.getCategoryById({
			cid: 123_123_123,
			start: 0,
			stop: -1,
		}, (error, categoryData) => {
			assert.ifError(error);
			assert.strictEqual(categoryData, null);
			done();
		});
	});

	it('should get all categories', done => {
		Categories.getAllCategories(1, (error, data) => {
			assert.ifError(error);
			assert(Array.isArray(data));
			assert.equal(data[0].cid, categoryObject.cid);
			done();
		});
	});

	it('should load a category route', done => {
		request(`${nconf.get('url')}/api/category/${categoryObject.cid}/test-category`, {json: true}, (error, response, body) => {
			assert.ifError(error);
			assert.equal(response.statusCode, 200);
			assert.equal(body.name, 'Test Category &amp; NodeBB');
			assert(body);
			done();
		});
	});

	describe('Categories.getRecentTopicReplies', () => {
		it('should not throw', done => {
			Categories.getCategoryById({
				cid: categoryObject.cid,
				set: `cid:${categoryObject.cid}:tids`,
				reverse: true,
				start: 0,
				stop: -1,
				uid: 0,
			}, (error, categoryData) => {
				assert.ifError(error);
				Categories.getRecentTopicReplies(categoryData, 0, {}, error_ => {
					assert.ifError(error_);
					done();
				});
			});
		});
	});

	describe('.getCategoryTopics', () => {
		it('should return a list of topics', done => {
			Categories.getCategoryTopics({
				cid: categoryObject.cid,
				start: 0,
				stop: 10,
				uid: 0,
				sort: 'oldest_to_newest',
			}, (error, result) => {
				assert.equal(error, null);

				assert(Array.isArray(result.topics));
				assert(result.topics.every(topic => topic instanceof Object));

				done();
			});
		});

		it('should return a list of topics by a specific user', done => {
			Categories.getCategoryTopics({
				cid: categoryObject.cid,
				start: 0,
				stop: 10,
				uid: 0,
				targetUid: 1,
				sort: 'oldest_to_newest',
			}, (error, result) => {
				assert.equal(error, null);
				assert(Array.isArray(result.topics));
				assert(result.topics.every(topic => topic instanceof Object && topic.uid === '1'));

				done();
			});
		});
	});

	describe('Categories.moveRecentReplies', () => {
		let moveCid;
		let moveTid;
		before(done => {
			async.parallel({
				category(next) {
					Categories.create({
						name: 'Test Category 2',
						description: 'Test category created by testing script',
					}, next);
				},
				topic(next) {
					Topics.post({
						uid: posterUid,
						cid: categoryObject.cid,
						title: 'Test Topic Title',
						content: 'The content of test topic',
					}, next);
				},
			}, (error, results) => {
				if (error) {
					return done(error);
				}

				moveCid = results.category.cid;
				moveTid = results.topic.topicData.tid;
				Topics.reply({uid: posterUid, content: 'test post', tid: moveTid}, error_ => {
					done(error_);
				});
			});
		});

		it('should move posts from one category to another', done => {
			Categories.moveRecentReplies(moveTid, categoryObject.cid, moveCid, error => {
				assert.ifError(error);
				db.getSortedSetRange(`cid:${categoryObject.cid}:pids`, 0, -1, (error, pids) => {
					assert.ifError(error);
					assert.equal(pids.length, 0);
					db.getSortedSetRange(`cid:${moveCid}:pids`, 0, -1, (error, pids) => {
						assert.ifError(error);
						assert.equal(pids.length, 2);
						done();
					});
				});
			});
		});
	});

	describe('api/socket methods', () => {
		const socketCategories = require('../src/socket.io/categories');
		const apiCategories = require('../src/api/categories');
		before(async () => {
			await Topics.post({
				uid: posterUid,
				cid: categoryObject.cid,
				title: 'Test Topic Title',
				content: 'The content of test topic',
				tags: ['nodebb'],
			});
			const data = await Topics.post({
				uid: posterUid,
				cid: categoryObject.cid,
				title: 'will delete',
				content: 'The content of deleted topic',
			});
			const newData = await Topics.post({
				uid: posterUid,
				cid: categoryObject.cid,
				title: 'will private',
				content: 'The content of private topic',
			});
			await Topics.delete(data.topicData.tid, adminUid);
			await Topics.private(newData.topicData.tid, adminUid);
		});

		it('should get recent replies in category', done => {
			socketCategories.getRecentReplies({uid: posterUid}, categoryObject.cid, (error, data) => {
				assert.ifError(error);
				assert(Array.isArray(data));
				done();
			});
		});

		it('should get categories', done => {
			socketCategories.get({uid: posterUid}, {}, (error, data) => {
				assert.ifError(error);
				assert(Array.isArray(data));
				done();
			});
		});

		it('should get watched categories', done => {
			socketCategories.getWatchedCategories({uid: posterUid}, {}, (error, data) => {
				assert.ifError(error);
				assert(Array.isArray(data));
				done();
			});
		});

		it('should load more topics', done => {
			socketCategories.loadMore({uid: posterUid}, {
				cid: categoryObject.cid,
				after: 0,
				query: {
					author: 'poster',
					tag: 'nodebb',
				},
			}, (error, data) => {
				assert.ifError(error);
				assert(Array.isArray(data.topics));
				assert.equal(data.topics[0].user.username, 'poster');
				assert.equal(data.topics[0].tags[0].value, 'nodebb');
				assert.equal(data.topics[0].category.cid, categoryObject.cid);
				done();
			});
		});

		it('should not show deleted topic titles', async () => {
			const data = await socketCategories.loadMore({uid: 0}, {
				cid: categoryObject.cid,
				after: 0,
			});

			assert.deepStrictEqual(
				data.topics.map(t => t.title),
				['[[topic:topic_is_private]]', '[[topic:topic_is_deleted]]', 'Test Topic Title', 'Test Topic Title'],
			);
		});

		it('should not show privated topic titles', async () => {
			const data = await socketCategories.loadMore({uid: 0}, {
				cid: categoryObject.cid,
				after: 0,
			});

			assert.deepStrictEqual(
				data.topics.map(t => t.title),
				['[[topic:topic_is_private]]', '[[topic:topic_is_deleted]]', 'Test Topic Title', 'Test Topic Title'],
			);
		});

		it('should show privated topic titles', async () => {
			const data = await socketCategories.loadMore({uid: posterUid}, {
				cid: categoryObject.cid,
				after: 0,
			});

			assert.deepStrictEqual(
				data.topics.map(t => t.title),
				['will private', 'will delete', 'Test Topic Title', 'Test Topic Title'],
			);
		});

		it('should load topic count', done => {
			socketCategories.getTopicCount({uid: posterUid}, categoryObject.cid, (error, topicCount) => {
				assert.ifError(error);
				assert.strictEqual(topicCount, 4);
				done();
			});
		});

		it('should load category by privilege', done => {
			socketCategories.getCategoriesByPrivilege({uid: posterUid}, 'find', (error, data) => {
				assert.ifError(error);
				assert(Array.isArray(data));
				done();
			});
		});

		it('should get move categories', done => {
			socketCategories.getMoveCategories({uid: posterUid}, {}, (error, data) => {
				assert.ifError(error);
				assert(Array.isArray(data));
				done();
			});
		});

		it('should ignore category', done => {
			socketCategories.ignore({uid: posterUid}, {cid: categoryObject.cid}, error => {
				assert.ifError(error);
				Categories.isIgnored([categoryObject.cid], posterUid, (error, isIgnored) => {
					assert.ifError(error);
					assert.equal(isIgnored[0], true);
					Categories.getIgnorers(categoryObject.cid, 0, -1, (error, ignorers) => {
						assert.ifError(error);
						assert.deepEqual(ignorers, [posterUid]);
						done();
					});
				});
			});
		});

		it('should watch category', done => {
			socketCategories.watch({uid: posterUid}, {cid: categoryObject.cid}, error => {
				assert.ifError(error);
				Categories.isIgnored([categoryObject.cid], posterUid, (error, isIgnored) => {
					assert.ifError(error);
					assert.equal(isIgnored[0], false);
					done();
				});
			});
		});

		it('should error if watch state does not exist', done => {
			socketCategories.setWatchState({uid: posterUid}, {cid: categoryObject.cid, state: 'invalid-state'}, error => {
				assert.equal(error.message, '[[error:invalid-watch-state]]');
				done();
			});
		});

		it('should check if user is moderator', done => {
			socketCategories.isModerator({uid: posterUid}, {}, (error, isModerator) => {
				assert.ifError(error);
				assert(!isModerator);
				done();
			});
		});

		it('should get category data', async () => {
			const data = await apiCategories.get({uid: posterUid}, {cid: categoryObject.cid});
			assert.equal(categoryObject.cid, data.cid);
		});
	});

	describe('admin api/socket methods', () => {
		const socketCategories = require('../src/socket.io/admin/categories');
		const apiCategories = require('../src/api/categories');
		let cid;
		before(async () => {
			const category = await apiCategories.create({uid: adminUid}, {
				name: 'update name',
				description: 'update description',
				parentCid: categoryObject.cid,
				icon: 'fa-check',
				order: '5',
			});
			cid = category.cid;
		});

		it('should return error with invalid data', async () => {
			let error;
			try {
				await apiCategories.update({uid: adminUid}, null);
			} catch (error_) {
				error = error_;
			}

			assert.strictEqual(error.message, '[[error:invalid-data]]');
		});

		it('should error if you try to set parent as self', async () => {
			const updateData = {};
			updateData[cid] = {
				parentCid: cid,
			};
			let error;
			try {
				await apiCategories.update({uid: adminUid}, updateData);
			} catch (error_) {
				error = error_;
			}

			assert.strictEqual(error.message, '[[error:cant-set-self-as-parent]]');
		});

		it('should error if you try to set child as parent', async () => {
			const parentCategory = await Categories.create({name: 'parent 1', description: 'poor parent'});
			const parentCid = parentCategory.cid;
			const childCategory = await Categories.create({name: 'child1', description: 'wanna be parent', parentCid});
			const child1Cid = childCategory.cid;
			const updateData = {};
			updateData[parentCid] = {
				parentCid: child1Cid,
			};
			let error;
			try {
				await apiCategories.update({uid: adminUid}, updateData);
			} catch (error_) {
				error = error_;
			}

			assert.strictEqual(error.message, '[[error:cant-set-child-as-parent]]');
		});

		it('should update category data', async () => {
			const updateData = {};
			updateData[cid] = {
				name: 'new name',
				description: 'new description',
				parentCid: 0,
				order: 3,
				icon: 'fa-hammer',
			};
			await apiCategories.update({uid: adminUid}, updateData);

			const data = await Categories.getCategoryData(cid);
			assert.equal(data.name, updateData[cid].name);
			assert.equal(data.description, updateData[cid].description);
			assert.equal(data.parentCid, updateData[cid].parentCid);
			assert.equal(data.order, updateData[cid].order);
			assert.equal(data.icon, updateData[cid].icon);
		});

		it('should properly order categories', async () => {
			const p1 = await Categories.create({
				name: 'p1', description: 'd', parentCid: 0, order: 1,
			});
			const c1 = await Categories.create({
				name: 'c1', description: 'd1', parentCid: p1.cid, order: 1,
			});
			const c2 = await Categories.create({
				name: 'c2', description: 'd2', parentCid: p1.cid, order: 2,
			});
			const c3 = await Categories.create({
				name: 'c3', description: 'd3', parentCid: p1.cid, order: 3,
			});
			// Move c1 to second place
			await apiCategories.update({uid: adminUid}, {[c1.cid]: {order: 2}});
			let cids = await db.getSortedSetRange(`cid:${p1.cid}:children`, 0, -1);
			assert.deepStrictEqual(cids.map(Number), [c2.cid, c1.cid, c3.cid]);

			// Move c3 to front
			await apiCategories.update({uid: adminUid}, {[c3.cid]: {order: 1}});
			cids = await db.getSortedSetRange(`cid:${p1.cid}:children`, 0, -1);
			assert.deepStrictEqual(cids.map(Number), [c3.cid, c2.cid, c1.cid]);
		});

		it('should not remove category from parent if parent is set again to same category', async () => {
			const parentCat = await Categories.create({name: 'parent', description: 'poor parent'});
			const updateData = {};
			updateData[cid] = {
				parentCid: parentCat.cid,
			};
			await Categories.update(updateData);
			let data = await Categories.getCategoryData(cid);
			assert.equal(data.parentCid, updateData[cid].parentCid);
			let childrenCids = await db.getSortedSetRange(`cid:${parentCat.cid}:children`, 0, -1);
			assert(childrenCids.includes(String(cid)));

			// Update again to same parent
			await Categories.update(updateData);
			data = await Categories.getCategoryData(cid);
			assert.equal(data.parentCid, updateData[cid].parentCid);
			childrenCids = await db.getSortedSetRange(`cid:${parentCat.cid}:children`, 0, -1);
			assert(childrenCids.includes(String(cid)));
		});

		it('should purge category', async () => {
			const category = await Categories.create({
				name: 'purge me',
				description: 'update description',
			});
			await Topics.post({
				uid: posterUid,
				cid: category.cid,
				title: 'Test Topic Title',
				content: 'The content of test topic',
			});
			await apiCategories.delete({uid: adminUid}, {cid: category.cid});
			const data = await Categories.getCategoryById(category.cid);
			assert.strictEqual(data, null);
		});

		it('should get all category names', done => {
			socketCategories.getNames({uid: adminUid}, {}, (error, data) => {
				assert.ifError(error);
				assert(Array.isArray(data));
				done();
			});
		});

		it('should give privilege', async () => {
			await apiCategories.setPrivilege({uid: adminUid}, {
				cid: categoryObject.cid, privilege: ['groups:topics:delete'], set: true, member: 'registered-users',
			});
			const canDeleteTopics = await privileges.categories.can('topics:delete', categoryObject.cid, posterUid);
			assert(canDeleteTopics);
		});

		it('should remove privilege', async () => {
			await apiCategories.setPrivilege({uid: adminUid}, {
				cid: categoryObject.cid, privilege: 'groups:topics:delete', set: false, member: 'registered-users',
			});
			const canDeleteTopics = await privileges.categories.can('topics:delete', categoryObject.cid, posterUid);
			assert(!canDeleteTopics);
		});

		it('should get privilege settings', async () => {
			const data = await apiCategories.getPrivileges({uid: adminUid}, categoryObject.cid);
			assert(data.labels);
			assert(data.labels.users);
			assert(data.labels.groups);
			assert(data.keys.users);
			assert(data.keys.groups);
			assert(data.users);
			assert(data.groups);
		});

		it('should copy privileges to children', async () => {
			const parentCategory = await Categories.create({name: 'parent'});
			const parentCid = parentCategory.cid;
			const child1 = await Categories.create({name: 'child1', parentCid});
			const child2 = await Categories.create({name: 'child2', parentCid: child1.cid});
			await apiCategories.setPrivilege({uid: adminUid}, {
				cid: parentCid,
				privilege: 'groups:topics:delete',
				set: true,
				member: 'registered-users',
			});
			await socketCategories.copyPrivilegesToChildren({uid: adminUid}, {cid: parentCid, group: ''});
			const canDelete = await privileges.categories.can('topics:delete', child2.cid, posterUid);
			assert(canDelete);
		});

		it('should create category with settings from', done => {
			let child1Cid;
			let parentCid;
			async.waterfall([
				function (next) {
					Categories.create({name: 'copy from', description: 'copy me'}, next);
				},
				function (category, next) {
					parentCid = category.cid;
					Categories.create({name: 'child1', description: 'will be gone', cloneFromCid: parentCid}, next);
				},
				function (category, next) {
					child1Cid = category.cid;
					assert.equal(category.description, 'copy me');
					next();
				},
			], done);
		});

		it('should copy settings from', done => {
			let child1Cid;
			let parentCid;
			async.waterfall([
				function (next) {
					Categories.create({name: 'parent', description: 'copy me'}, next);
				},
				function (category, next) {
					parentCid = category.cid;
					Categories.create({name: 'child1'}, next);
				},
				function (category, next) {
					child1Cid = category.cid;
					socketCategories.copySettingsFrom(
						{uid: adminUid},
						{fromCid: parentCid, toCid: child1Cid, copyParent: true},
						next,
					);
				},
				function (destinationCategory, next) {
					Categories.getCategoryField(child1Cid, 'description', next);
				},
				function (description, next) {
					assert.equal(description, 'copy me');
					next();
				},
			], done);
		});

		it('should copy privileges from another category', async () => {
			const parent = await Categories.create({name: 'parent', description: 'copy me'});
			const parentCid = parent.cid;
			const child1 = await Categories.create({name: 'child1'});
			await apiCategories.setPrivilege({uid: adminUid}, {
				cid: parentCid,
				privilege: 'groups:topics:delete',
				set: true,
				member: 'registered-users',
			});
			await socketCategories.copyPrivilegesFrom({uid: adminUid}, {fromCid: parentCid, toCid: child1.cid});
			const canDelete = await privileges.categories.can('topics:delete', child1.cid, posterUid);
			assert(canDelete);
		});

		it('should copy privileges from another category for a single group', async () => {
			const parent = await Categories.create({name: 'parent', description: 'copy me'});
			const parentCid = parent.cid;
			const child1 = await Categories.create({name: 'child1'});
			await apiCategories.setPrivilege({uid: adminUid}, {
				cid: parentCid,
				privilege: 'groups:topics:delete',
				set: true,
				member: 'registered-users',
			});
			await socketCategories.copyPrivilegesFrom({uid: adminUid}, {fromCid: parentCid, toCid: child1.cid, group: 'registered-users'});
			const canDelete = await privileges.categories.can('topics:delete', child1.cid, 0);
			assert(!canDelete);
		});
	});

	it('should get active users', done => {
		Categories.create({
			name: 'test',
		}, (error, category) => {
			assert.ifError(error);
			Topics.post({
				uid: posterUid,
				cid: category.cid,
				title: 'Test Topic Title',
				content: 'The content of test topic',
			}, error_ => {
				assert.ifError(error_);
				Categories.getActiveUsers(category.cid, (error, uids) => {
					assert.ifError(error);
					assert.equal(uids[0], posterUid);
					done();
				});
			});
		});
	});

	describe('tag whitelist', () => {
		let cid;
		const socketTopics = require('../src/socket.io/topics');
		before(done => {
			Categories.create({
				name: 'test',
			}, (error, category) => {
				assert.ifError(error);
				cid = category.cid;
				done();
			});
		});

		it('should error if data is invalid', done => {
			socketTopics.isTagAllowed({uid: posterUid}, null, error => {
				assert.equal(error.message, '[[error:invalid-data]]');
				done();
			});
		});

		it('should return true if category whitelist is empty', done => {
			socketTopics.isTagAllowed({uid: posterUid}, {tag: 'notallowed', cid}, (error, allowed) => {
				assert.ifError(error);
				assert(allowed);
				done();
			});
		});

		it('should add tags to category whitelist', done => {
			const data = {};
			data[cid] = {
				tagWhitelist: 'nodebb,jquery,javascript',
			};
			Categories.update(data, error => {
				assert.ifError(error);
				db.getSortedSetRange(`cid:${cid}:tag:whitelist`, 0, -1, (error, tagInclude) => {
					assert.ifError(error);
					assert.deepEqual(['nodebb', 'jquery', 'javascript'], tagInclude);
					done();
				});
			});
		});

		it('should return false if category whitelist does not have tag', done => {
			socketTopics.isTagAllowed({uid: posterUid}, {tag: 'notallowed', cid}, (error, allowed) => {
				assert.ifError(error);
				assert(!allowed);
				done();
			});
		});

		it('should return true if category whitelist has tag', done => {
			socketTopics.isTagAllowed({uid: posterUid}, {tag: 'nodebb', cid}, (error, allowed) => {
				assert.ifError(error);
				assert(allowed);
				done();
			});
		});

		it('should post a topic with only allowed tags', done => {
			Topics.post({
				uid: posterUid,
				cid,
				title: 'Test Topic Title',
				content: 'The content of test topic',
				tags: ['nodebb', 'jquery', 'notallowed'],
			}, (error, data) => {
				assert.ifError(error);
				assert.equal(data.topicData.tags.length, 2);
				done();
			});
		});
	});

	describe('privileges', () => {
		const privileges = require('../src/privileges');

		it('should return empty array if uids is empty array', done => {
			privileges.categories.filterUids('find', categoryObject.cid, [], (error, uids) => {
				assert.ifError(error);
				assert.equal(uids.length, 0);
				done();
			});
		});

		it('should filter uids by privilege', done => {
			privileges.categories.filterUids('find', categoryObject.cid, [1, 2, 3, 4], (error, uids) => {
				assert.ifError(error);
				assert.deepEqual(uids, [1, 2]);
				done();
			});
		});

		it('should load category user privileges', done => {
			privileges.categories.userPrivileges(categoryObject.cid, 1, (error, data) => {
				assert.ifError(error);
				assert.deepEqual(data, {
					find: false,
					'posts:delete': false,
					read: false,
					'topics:reply': false,
					'topics:read': false,
					'topics:create': false,
					'topics:tag': false,
					'topics:delete': false,
					'topics:schedule': false,
					'posts:edit': false,
					'posts:history': false,
					'posts:upvote': false,
					'posts:downvote': false,
					purge: false,
					'posts:view_deleted': false,
					moderate: false,
				});

				done();
			});
		});

		it('should load global user privileges', done => {
			privileges.global.userPrivileges(1, (error, data) => {
				assert.ifError(error);
				assert.deepEqual(data, {
					ban: false,
					mute: false,
					invite: false,
					chat: false,
					'search:content': false,
					'search:users': false,
					'search:tags': false,
					'view:users:info': false,
					'upload:post:image': false,
					'upload:post:file': false,
					signature: false,
					'local:login': false,
					'group:create': false,
					'view:users': false,
					'view:tags': false,
					'view:groups': false,
				});

				done();
			});
		});

		it('should load category group privileges', done => {
			privileges.categories.groupPrivileges(categoryObject.cid, 'registered-users', (error, data) => {
				assert.ifError(error);
				assert.deepEqual(data, {
					'groups:find': true,
					'groups:posts:edit': true,
					'groups:posts:history': true,
					'groups:posts:upvote': true,
					'groups:posts:downvote': true,
					'groups:topics:delete': false,
					'groups:topics:create': true,
					'groups:topics:reply': true,
					'groups:topics:tag': true,
					'groups:topics:schedule': false,
					'groups:posts:delete': true,
					'groups:read': true,
					'groups:topics:read': true,
					'groups:purge': false,
					'groups:posts:view_deleted': false,
					'groups:moderate': false,
				});

				done();
			});
		});

		it('should load global group privileges', done => {
			privileges.global.groupPrivileges('registered-users', (error, data) => {
				assert.ifError(error);
				assert.deepEqual(data, {
					'groups:ban': false,
					'groups:mute': false,
					'groups:invite': false,
					'groups:chat': true,
					'groups:search:content': true,
					'groups:search:users': true,
					'groups:search:tags': true,
					'groups:view:users': true,
					'groups:view:users:info': false,
					'groups:view:tags': true,
					'groups:view:groups': true,
					'groups:upload:post:image': true,
					'groups:upload:post:file': false,
					'groups:signature': true,
					'groups:local:login': true,
					'groups:group:create': false,
				});

				done();
			});
		});

		it('should return false if cid is falsy', done => {
			privileges.categories.isUserAllowedTo('find', null, adminUid, (error, isAllowed) => {
				assert.ifError(error);
				assert.equal(isAllowed, false);
				done();
			});
		});

		describe('Categories.getModeratorUids', () => {
			before(done => {
				async.series([
					async.apply(groups.create, {name: 'testGroup'}),
					async.apply(groups.join, 'cid:1:privileges:groups:moderate', 'testGroup'),
					async.apply(groups.join, 'testGroup', 1),
				], done);
			});

			it('should retrieve all users with moderator bit in category privilege', done => {
				Categories.getModeratorUids([1, 2], (error, uids) => {
					assert.ifError(error);
					assert.strictEqual(uids.length, 2);
					assert(uids[0].includes('1'));
					assert.strictEqual(uids[1].length, 0);
					done();
				});
			});

			it('should not fail when there are multiple groups', done => {
				async.series([
					async.apply(groups.create, {name: 'testGroup2'}),
					async.apply(groups.join, 'cid:1:privileges:groups:moderate', 'testGroup2'),
					async.apply(groups.join, 'testGroup2', 1),
					function (next) {
						Categories.getModeratorUids([1, 2], (error, uids) => {
							assert.ifError(error);
							assert(uids[0].includes('1'));
							next();
						});
					},
				], done);
			});

			after(done => {
				async.series([
					async.apply(groups.leave, 'cid:1:privileges:groups:moderate', 'testGroup'),
					async.apply(groups.leave, 'cid:1:privileges:groups:moderate', 'testGroup2'),
					async.apply(groups.destroy, 'testGroup'),
					async.apply(groups.destroy, 'testGroup2'),
				], done);
			});
		});
	});

	describe('getTopicIds', () => {
		const plugins = require('../src/plugins');
		it('should get topic ids with filter', done => {
			function method(data, callback) {
				data.tids = [1, 2, 3];
				callback(null, data);
			}

			plugins.hooks.register('my-test-plugin', {
				hook: 'filter:categories.getTopicIds',
				method,
			});

			Categories.getTopicIds({
				cid: categoryObject.cid,
				start: 0,
				stop: 19,
			}, (error, tids) => {
				assert.ifError(error);
				assert.deepEqual(tids, [1, 2, 3]);
				plugins.hooks.unregister('my-test-plugin', 'filter:categories.getTopicIds', method);
				done();
			});
		});
	});

	it('should return nested children categories', async () => {
		const rootCategory = await Categories.create({name: 'root'});
		const child1 = await Categories.create({name: 'child1', parentCid: rootCategory.cid});
		const child2 = await Categories.create({name: 'child2', parentCid: child1.cid});
		const data = await Categories.getCategoryById({
			uid: 1,
			cid: rootCategory.cid,
			start: 0,
			stop: 19,
		});
		assert.strictEqual(child1.cid, data.children[0].cid);
		assert.strictEqual(child2.cid, data.children[0].children[0].cid);
	});
});
