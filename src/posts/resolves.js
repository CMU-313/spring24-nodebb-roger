'use strict';

const db = require('../database');
const plugins = require('../plugins');

module.exports = function (Posts) {
    Posts.resolve = async function (pid, uid) {
        return await toggleResolve('resolve', pid, uid);
    };

    Posts.unresolve = async function (pid, uid) {
        return await toggleResolve('unresolve', pid, uid);
    };

    async function toggleResolve(type, pid, uid) {
        if (parseInt(uid, 10) <= 0) {
            throw new Error('[[error:not-logged-in]]');
        }

        let isResolving = type === 'resolve';

        const [postData, hasResolved] = await Promise.all([
            Posts.getPostFields(pid, ['pid', 'uid']),
            Posts.hasResolved(pid, uid),
        ]);

        if (isResolving && hasResolved) {
            isResolving = false;
        }

        if (!isResolving && !hasResolved) {
            throw new Error('[[error:already-unresolved]]');
        }

        if (isResolving) {
            await db.sortedSetAdd(`uid:${uid}:resolves`, Date.now(), pid);
        } else {
            await db.sortedSetRemove(`uid:${uid}:resolves`, pid);
        }
        await db[isResolving ? 'setAdd' : 'setRemove'](`pid:${pid}:users_resolved`, uid);
        postData.resolves = await db.setCount(`pid:${pid}:users_resolved`);
        await Posts.setPostField(pid, 'resolves', postData.resolves);

        plugins.hooks.fire(`action:post.${type}`, {
            pid: pid,
            uid: uid,
            owner: postData.uid,
            current: hasResolved ? 'resolved' : 'unresolved',
        });

        return {
            post: postData,
            isResolved: isResolving,
        };
    }

    Posts.hasResolved = async function (pid, uid) {
        if (parseInt(uid, 10) <= 0) {
            return Array.isArray(pid) ? pid.map(() => false) : false;
        }

        if (Array.isArray(pid)) {
            const sets = pid.map(pid => `pid:${pid}:users_resolved`);
            return await db.isMemberOfSets(sets, uid);
        }
        return await db.isSetMember(`pid:${pid}:users_resolved`, uid);
    };
};