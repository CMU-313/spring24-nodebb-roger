'use strict';

const assert = require('node:assert');
const async = require('async');
const nconf = require('nconf');
const meta = require('../src/meta');
const user = require('../src/user');
const topics = require('../src/topics');
const categories = require('../src/categories');
const groups = require('../src/groups');
const notifications = require('../src/notifications');
const socketNotifications = require('../src/socket.io/notifications');
const db = require('./mocks/databasemock');

describe('Notifications', () => {
	let uid;
	let notification;

	before(done => {
		user.create({username: 'poster'}, (error, _uid) => {
			if (error) {
				return done(error);
			}

			uid = _uid;
			done();
		});
	});

	it('should fail to create notification without a nid', done => {
		notifications.create({}, error => {
			assert.equal(error.message, '[[error:no-notification-id]]');
			done();
		});
	});

	it('should create a notification', done => {
		notifications.create({
			bodyShort: 'bodyShort',
			nid: 'notification_id',
			path: '/notification/path',
			pid: 1,
		}, (error, _notification) => {
			notification = _notification;
			assert.ifError(error);
			assert(notification);
			db.exists(`notifications:${notification.nid}`, (error, exists) => {
				assert.ifError(error);
				assert(exists);
				db.isSortedSetMember('notifications', notification.nid, (error, isMember) => {
					assert.ifError(error);
					assert(isMember);
					done();
				});
			});
		});
	});

	it('should return null if pid is same and importance is lower', done => {
		notifications.create({
			bodyShort: 'bodyShort',
			nid: 'notification_id',
			path: '/notification/path',
			pid: 1,
			importance: 1,
		}, (error, notification) => {
			assert.ifError(error);
			assert.strictEqual(notification, null);
			done();
		});
	});

	it('should get empty array', done => {
		notifications.getMultiple(null, (error, data) => {
			assert.ifError(error);
			assert(Array.isArray(data));
			assert.equal(data.length, 0);
			done();
		});
	});

	it('should get notifications', done => {
		notifications.getMultiple([notification.nid], (error, notificationsData) => {
			assert.ifError(error);
			assert(Array.isArray(notificationsData));
			assert(notificationsData[0]);
			assert.equal(notification.nid, notificationsData[0].nid);
			done();
		});
	});

	it('should do nothing', done => {
		notifications.push(null, [], error => {
			assert.ifError(error);
			notifications.push({nid: null}, [], error => {
				assert.ifError(error);
				notifications.push(notification, [], error => {
					assert.ifError(error);
					done();
				});
			});
		});
	});

	it('should push a notification to uid', done => {
		notifications.push(notification, [uid], error => {
			assert.ifError(error);
			setTimeout(() => {
				db.isSortedSetMember(`uid:${uid}:notifications:unread`, notification.nid, (error, isMember) => {
					assert.ifError(error);
					assert(isMember);
					done();
				});
			}, 2000);
		});
	});

	it('should push a notification to a group', done => {
		notifications.pushGroup(notification, 'registered-users', error => {
			assert.ifError(error);
			setTimeout(() => {
				db.isSortedSetMember(`uid:${uid}:notifications:unread`, notification.nid, (error, isMember) => {
					assert.ifError(error);
					assert(isMember);
					done();
				});
			}, 2000);
		});
	});

	it('should push a notification to groups', done => {
		notifications.pushGroups(notification, ['registered-users', 'administrators'], error => {
			assert.ifError(error);
			setTimeout(() => {
				db.isSortedSetMember(`uid:${uid}:notifications:unread`, notification.nid, (error, isMember) => {
					assert.ifError(error);
					assert(isMember);
					done();
				});
			}, 2000);
		});
	});

	it('should not mark anything with invalid uid or nid', done => {
		socketNotifications.markRead({uid: null}, null, error => {
			assert.ifError(error);
			socketNotifications.markRead({uid}, null, error => {
				assert.ifError(error);
				done();
			});
		});
	});

	it('should mark a notification read', done => {
		socketNotifications.markRead({uid}, notification.nid, error => {
			assert.ifError(error);
			db.isSortedSetMember(`uid:${uid}:notifications:unread`, notification.nid, (error, isMember) => {
				assert.ifError(error);
				assert.equal(isMember, false);
				db.isSortedSetMember(`uid:${uid}:notifications:read`, notification.nid, (error, isMember) => {
					assert.ifError(error);
					assert.equal(isMember, true);
					done();
				});
			});
		});
	});

	it('should not mark anything with invalid uid or nid', done => {
		socketNotifications.markUnread({uid: null}, null, error => {
			assert.ifError(error);
			socketNotifications.markUnread({uid}, null, error => {
				assert.ifError(error);
				done();
			});
		});
	});

	it('should error if notification does not exist', done => {
		socketNotifications.markUnread({uid}, 123_123, error => {
			assert.equal(error.message, '[[error:no-notification]]');
			done();
		});
	});

	it('should mark a notification unread', done => {
		socketNotifications.markUnread({uid}, notification.nid, error => {
			assert.ifError(error);
			db.isSortedSetMember(`uid:${uid}:notifications:unread`, notification.nid, (error, isMember) => {
				assert.ifError(error);
				assert.equal(isMember, true);
				db.isSortedSetMember(`uid:${uid}:notifications:read`, notification.nid, (error, isMember) => {
					assert.ifError(error);
					assert.equal(isMember, false);
					socketNotifications.getCount({uid}, null, (error, count) => {
						assert.ifError(error);
						assert.equal(count, 1);
						done();
					});
				});
			});
		});
	});

	it('should mark all notifications read', done => {
		socketNotifications.markAllRead({uid}, null, error => {
			assert.ifError(error);
			db.isSortedSetMember(`uid:${uid}:notifications:unread`, notification.nid, (error, isMember) => {
				assert.ifError(error);
				assert.equal(isMember, false);
				db.isSortedSetMember(`uid:${uid}:notifications:read`, notification.nid, (error, isMember) => {
					assert.ifError(error);
					assert.equal(isMember, true);
					done();
				});
			});
		});
	});

	it('should not do anything', done => {
		socketNotifications.markAllRead({uid: 1000}, null, error => {
			assert.ifError(error);
			done();
		});
	});

	it('should link to the first unread post in a watched topic', done => {
		const categories = require('../src/categories');
		const topics = require('../src/topics');
		let watcherUid;
		let cid;
		let tid;
		let pid;

		async.waterfall([
			function (next) {
				user.create({username: 'watcher'}, next);
			},
			function (_watcherUid, next) {
				watcherUid = _watcherUid;

				categories.create({
					name: 'Test Category',
					description: 'Test category created by testing script',
				}, next);
			},
			function (category, next) {
				cid = category.cid;

				topics.post({
					uid: watcherUid,
					cid,
					title: 'Test Topic Title',
					content: 'The content of test topic',
				}, next);
			},
			function (topic, next) {
				tid = topic.topicData.tid;

				topics.follow(tid, watcherUid, next);
			},
			function (next) {
				topics.reply({
					uid,
					content: 'This is the first reply.',
					tid,
				}, next);
			},
			function (post, next) {
				pid = post.pid;

				topics.reply({
					uid,
					content: 'This is the second reply.',
					tid,
				}, next);
			},
			function (post, next) {
				// Notifications are sent asynchronously with a 1 second delay.
				setTimeout(next, 3000);
			},
			function (next) {
				user.notifications.get(watcherUid, next);
			},
			function (notifications, next) {
				assert.equal(notifications.unread.length, 1, 'there should be 1 unread notification');
				assert.equal(`${nconf.get('relative_path')}/post/${pid}`, notifications.unread[0].path, 'the notification should link to the first unread post');
				next();
			},
		], error => {
			assert.ifError(error);
			done();
		});
	});

	it('should get notification by nid', done => {
		socketNotifications.get({uid}, {nids: [notification.nid]}, (error, data) => {
			assert.ifError(error);
			assert.equal(data[0].bodyShort, 'bodyShort');
			assert.equal(data[0].nid, 'notification_id');
			assert.equal(data[0].path, `${nconf.get('relative_path')}/notification/path`);
			done();
		});
	});

	it('should get user\'s notifications', done => {
		socketNotifications.get({uid}, {}, (error, data) => {
			assert.ifError(error);
			assert.equal(data.unread.length, 0);
			assert.equal(data.read[0].nid, 'notification_id');
			done();
		});
	});

	it('should error if not logged in', done => {
		socketNotifications.deleteAll({uid: 0}, null, error => {
			assert.equal(error.message, '[[error:no-privileges]]');
			done();
		});
	});

	it('should delete all user notifications', done => {
		socketNotifications.deleteAll({uid}, null, error => {
			assert.ifError(error);
			socketNotifications.get({uid}, {}, (error, data) => {
				assert.ifError(error);
				assert.equal(data.unread.length, 0);
				assert.equal(data.read.length, 0);
				done();
			});
		});
	});

	it('should return empty with falsy uid', done => {
		user.notifications.get(0, (error, data) => {
			assert.ifError(error);
			assert.equal(data.read.length, 0);
			assert.equal(data.unread.length, 0);
			done();
		});
	});

	it('should get all notifications and filter', done => {
		const nid = 'willbefiltered';
		notifications.create({
			bodyShort: 'bodyShort',
			nid,
			path: '/notification/path',
			type: 'post',
		}, (error, notification) => {
			assert.ifError(error);
			notifications.push(notification, [uid], error_ => {
				assert.ifError(error_);
				setTimeout(() => {
					user.notifications.getAll(uid, 'post', (error, nids) => {
						assert.ifError(error);
						assert(nids.includes(nid));
						done();
					});
				}, 3000);
			});
		});
	});

	it('should not get anything if notifications does not exist', done => {
		user.notifications.getNotifications(['doesnotexistnid1', 'doesnotexistnid2'], uid, (error, data) => {
			assert.ifError(error);
			assert.deepEqual(data, []);
			done();
		});
	});

	it('should get daily notifications', done => {
		user.notifications.getDailyUnread(uid, (error, data) => {
			assert.ifError(error);
			assert.equal(data[0].nid, 'willbefiltered');
			done();
		});
	});

	it('should return empty array for invalid interval', done => {
		user.notifications.getUnreadInterval(uid, '2 aeons', (error, data) => {
			assert.ifError(error);
			assert.deepEqual(data, []);
			done();
		});
	});

	it('should return 0 for falsy uid', done => {
		user.notifications.getUnreadCount(0, (error, count) => {
			assert.ifError(error);
			assert.equal(count, 0);
			done();
		});
	});

	it('should not do anything if uid is falsy', done => {
		user.notifications.deleteAll(0, error => {
			assert.ifError(error);
			done();
		});
	});

	it('should send notification to followers of user when he posts', done => {
		let followerUid;
		async.waterfall([
			function (next) {
				user.create({username: 'follower'}, next);
			},
			function (_followerUid, next) {
				followerUid = _followerUid;
				user.follow(followerUid, uid, next);
			},
			function (next) {
				categories.create({
					name: 'Test Category',
					description: 'Test category created by testing script',
				}, next);
			},
			function (category, next) {
				topics.post({
					uid,
					cid: category.cid,
					title: 'Test Topic Title',
					content: 'The content of test topic',
				}, next);
			},
			function (data, next) {
				setTimeout(next, 1100);
			},
			function (next) {
				user.notifications.getAll(followerUid, '', next);
			},
		], (error, data) => {
			assert.ifError(error);
			assert(data);
			done();
		});
	});

	it('should send welcome notification', done => {
		meta.config.welcomeNotification = 'welcome to the forums';
		user.notifications.sendWelcomeNotification(uid, error => {
			assert.ifError(error);
			user.notifications.sendWelcomeNotification(uid, error => {
				assert.ifError(error);
				setTimeout(() => {
					user.notifications.getAll(uid, '', (error, data) => {
						meta.config.welcomeNotification = '';
						assert.ifError(error);
						assert(data.includes(`welcome_${uid}`), data);
						done();
					});
				}, 2000);
			});
		});
	});

	it('should prune notifications', done => {
		notifications.create({
			bodyShort: 'bodyShort',
			nid: 'tobedeleted',
			path: '/notification/path',
		}, (error, notification) => {
			assert.ifError(error);
			notifications.prune(error_ => {
				assert.ifError(error_);
				const month = 2_592_000_000;
				db.sortedSetAdd('notifications', Date.now() - (2 * month), notification.nid, error_ => {
					assert.ifError(error_);
					notifications.prune(error_ => {
						assert.ifError(error_);
						notifications.get(notification.nid, (error, data) => {
							assert.ifError(error);
							assert(!data);
							done();
						});
					});
				});
			});
		});
	});
});
