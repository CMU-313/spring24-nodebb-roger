'use strict';

module.exports = function (Topics) {
    Topics.private = async function (tid, uid) {
        await Topics.setTopicFields(tid, {
            private: 1,
            privater: uid,
            privatedTimestamp: Date.now(),
        });
    };

    Topics.public = async function (tid) {
        await Topics.deleteTopicFields(tid, ['privater', 'privatedTimestamp']);
        await Topics.setTopicField(tid, 'private', 0);
    };
};
