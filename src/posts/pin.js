"use strict";
/* All of the below is directly taken and modified from src/posts/bookmarks.js

For the TS translation, I referenced azhang49's translation from P1:
https://github.com/CMU-313/NodeBB/pull/73
*/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const plugins = require("../plugins");
function postFunc(Posts) {
    function togglePin(type, pid, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            if (parseInt(uid, 10) <= 0) {
                throw new Error('[[error:not-logged-in]]');
            }
            const isPinning = type === 'pin';
            const postData = yield Posts.getPostFields(pid, ['pid', 'uid', 'tid']);
            const hasPinned = yield Posts.hasPinned(pid, uid);
            if (isPinning && hasPinned) {
                throw new Error('Already pinned!');
            }
            if (!isPinning && !hasPinned) {
                throw new Error('Already unpinned!');
            }
            // TODO: This line is sketchy.
            const toWrite = isPinning ? 1 : 0;
            yield Posts.setPostField(pid, 'pinned', toWrite);
            yield plugins.hooks.fire(`action:post.${type}`, {
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
        });
    }
    Posts.hasPinned = function (pid, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            if (parseInt(uid, 10) <= 0) {
                return Array.isArray(pid) ? pid.map(() => false) : false;
            }
            const postData = yield Posts.getPostFields(pid, ['pinned']);
            return Boolean(postData.pinned);
        });
    };
    Posts.pin = function (pid, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield togglePin('pin', pid, uid);
        });
    };
    Posts.unpin = function (pid, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield togglePin('unpin', pid, uid);
        });
    };
}
module.exports = postFunc;
