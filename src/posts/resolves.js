'use strict';
//used the bookmarks.js file as a reference
// const db = require('../database');
const plugins = require('../plugins');

module.exports = function (Posts) {
    Posts.resolve = async function (pid, uid) {
        return await toggleResolve('resolve', pid, uid);
    };

    // Posts.unresolve = async function (pid, uid) {
    //     return await toggleResolve('unresolve', pid, uid);
    // };

    async function toggleResolve(type, pid, uid) {
        if (parseInt(uid, 10) <= 0) {
            throw new Error('[[error:not-logged-in]]');
        }

        const isResolving = true;

        const [postData] = await Promise.all([
            Posts.getPostFields(pid, ['pid', 'uid']),
        ]);

        await Posts.setPostField(pid, 'resolved', 1);

        plugins.hooks.fire(`action:post.resolve`, {
            pid: pid,
            uid: uid,
            owner: postData.uid,
            current: 'resolved',
        });


        return {
            post: postData,
            isResolved: isResolving,
        };
    }
};