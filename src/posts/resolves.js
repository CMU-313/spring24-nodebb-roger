'use strict';

// Import necessary modules
const db = require('../database');
const plugins = require('../plugins');

// Export the function that sets up additional Posts methods
module.exports = function (Posts) {
    // Define the resolve method
    Posts.resolve = async function (pid, uid) {
        // Assert parameter types
        if (typeof pid !== 'number' || typeof uid !== 'number') {
            throw new Error('Invalid parameter types. Expected parameters: (pid: number, uid: number)');
        }

        return await toggleResolve('resolve', pid, uid);
    };

    // Define the unresolve method
    Posts.unresolve = async function (pid, uid) {
        // Assert parameter types
        if (typeof pid !== 'number' || typeof uid !== 'number') {
            throw new Error('Invalid parameter types. Expected parameters: (pid: number, uid: number)');
        }

        return await toggleResolve('unresolve', pid, uid);
    };

    // Internal function to toggle resolve status
    async function toggleResolve(type, pid, uid) {
        // Assert parameter types
        if (typeof pid !== 'number' || typeof uid !== 'number') {
            throw new Error('Invalid parameter types. Expected parameters: (type: string, pid: number, uid: number)');
        }

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

        // Update database
        if (isResolving) {
            await db.sortedSetAdd(`uid:${uid}:resolves`, Date.now(), pid);
        } else {
            await db.sortedSetRemove(`uid:${uid}:resolves`, pid);
        }
        await db[isResolving ? 'setAdd' : 'setRemove'](`pid:${pid}:users_resolved`, uid);
        postData.resolves = await db.setCount(`pid:${pid}:users_resolved`);
        await Posts.setPostField(pid, 'resolves', postData.resolves);

        // Fire plugins hook
        plugins.hooks.fire(`action:post.${type}`, {
            pid: pid,
            uid: uid,
            owner: postData.uid,
            current: hasResolved ? 'resolved' : 'unresolved',
        });

        // Return result
        return {
            post: postData,
            isResolved: isResolving,
        };
    }

    // Define hasResolved method
    Posts.hasResolved = async function (pid, uid) {
        // Assert parameter types
        if (typeof pid !== 'number' || typeof uid !== 'number') {
            throw new Error('Invalid parameter types. Expected parameters: (pid: number|string|Array<number|string>, uid: number)');
        }

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