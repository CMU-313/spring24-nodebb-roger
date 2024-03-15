import {type UserObjectSlim} from './user';

export type GroupDataObject = {
	name: string;
	slug: string;
	createtime: number;
	userTitle: number;
	userTitleEscaped: number;
	userTitleEnabled: number;
	description: string;
	memberCount: number;
	hidden: number;
	system: number;
	private: number;
	disableJoinRequests: number;
	disableLeave: number;
	'cover:url': string;
	'cover:thumb:url': string;
	'cover:position': string;
	nameEncoded: string;
	displayName: string;
	labelColor: string;
	textColor: string;
	icon: string;
	createtimeISO: string;
	memberPostCids: string;
	memberPostCidsArray: number[];
};

export type GroupFullObject = GroupDataObject & GroupFullObjectProperties;

export type GroupFullObjectProperties = {
	descriptionParsed: string;
	members: UserObjectSlim[];
	membersNextStart: number;

	pending: any[];

	invited: any[];
	isMember: boolean;
	isPending: boolean;
	isInvited: boolean;
	isOwner: boolean;
};
