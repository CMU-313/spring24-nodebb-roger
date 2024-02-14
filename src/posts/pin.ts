/* All of the below is directly taken and modified from src/posts/bookmarks.js

For the TS translation, I referenced azhang49's translation from P1:
https://github.com/CMU-313/NodeBB/pull/73
*/

import plugins = require('../plugins');

type PostData = {
    tid : string;
    uid : string;
    pinned : number;
}

type Post = {
    pin : (pid : string, uid : string) => Promise<unknown>;
    unpin : (pid : string, uid : string) => Promise<unknown>;
    hasPinned : (pid : string, uid : string) => Promise<boolean | boolean[]>;
    getPostFields : (pid : string, fields : string[]) => Promise<PostData>;
    setPostField : (pid : string, field : string, value : number) => Promise<unknown>;
}

function postFunc(Posts : Post) {
    async function togglePin(type : string, pid : string, uid : string) {
        if (parseInt(uid, 10) <= 0) {
            throw new Error('[[error:not-logged-in]]');
        }

        const isPinning = type === 'pin';

        const postData = await Posts.getPostFields(pid, ['pid', 'uid', 'tid']);

        const hasPinned = await Posts.hasPinned(pid, uid);

        if (isPinning && hasPinned) {
            throw new Error('Already pinned!');
        }

        if (!isPinning && !hasPinned) {
            throw new Error('Already unpinned!');
        }

        // TODO: This line is sketchy.
        const toWrite = isPinning ? 1 : 0;
        await Posts.setPostField(pid, 'pinned', toWrite);

        await plugins.hooks.fire(`action:post.${type}`, {
            pid: pid,
            tid: postData.tid,
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

        const postData = await Posts.getPostFields(pid, ['pinned']);
        return Boolean(postData.pinned);
    };


    Posts.pin = async function (pid : string, uid : string) {
        return await togglePin('pin', pid, uid);
    };

    Posts.unpin = async function (pid : string, uid : string) {
        return await togglePin('unpin', pid, uid);
    };
}


export = postFunc;
