import {type CategoryObject} from './category';
import {type TopicObject} from './topic';
import {type UserObjectSlim} from './user';

export type PostObject = {
	pid: number;
	tid: number;
	content: string;
	uid: number;
	timestamp: number;
	deleted: boolean;
	upvotes: number;
	downvotes: number;
	votes: number;
	timestampISO: string;
	user: UserObjectSlim;
	topic: TopicObject;
	category: CategoryObject;
	isMainPost: boolean;
	replies: number;
	resolved: boolean;
};
