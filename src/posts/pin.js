/* All of the below is directly taken and modified from src/posts/bookmarks.js

This needs to be translated to TypeScript, eventually.
*/
'use strict';

const db = require('../database');
const plugins = require('../plugins');

module.exports = function (Posts) {
    Posts.pin = async function (pid, uid) {
        return await togglePin('pin', pid, uid);
    };

    Posts.unpin = async function (pid, uid) {
        return await togglePin('unpin', pid, uid);
    };

    async function togglePin(type, pid, uid) {
        if (parseInt(uid, 10) <= 0) {
            throw new Error('[[error:not-logged-in]]');
        }

        const isPinning = type === 'pin';

        const postData = await Posts.getPostFields(pid, ['pid', 'uid']);

        let hasPinned = await Posts.hasPinned(pid, uid);

        if (isPinning && hasPinned) {
            throw new Error("Already pinned!");
        }

        if (!isPinning && !hasPinned) {
            throw new Error("Already unpinned!");
        }

        // TODO: This line is sketchy.
        let toWrite = isPinning ? 1 : 0;
        await Posts.setPostField(pid, 'pinned', toWrite);

        let pinned = await Posts.hasPinned(pid, uid);

        plugins.hooks.fire(`action:post.${type}`, {
            pid: pid,
            uid: uid,
            owner: postData.uid,
            current: hasPinned ? 'pinned' : 'unpinned',
        });

        return {
            post: postData,
            pinned: isPinning,
        };
    }

    Posts.hasPinned = async function (pid, uid) {
        if (parseInt(uid, 10) <= 0) {
            return Array.isArray(pid) ? pid.map(() => false) : false;
        }

        let postData = await Posts.getPostFields(pid, ['pinned']);
        return Boolean(postData.pinned);
    };
};
