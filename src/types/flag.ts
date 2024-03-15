import {type UserObjectSlim} from './user';

export type FlagHistoryObject = {
	history: History[];
};

type History = {
	uid: number;

	fields: any;
	meta: Meta[];
	datetime: number;
	datetimeISO: string;
	user: UserObjectSlim;
};

type Meta = {
	key: string;
	value: string;
	labelClass: string;
};

export type FlagNotesObject = {
	notes: Note[];
};

export type Note = {
	uid: number;
	content: string;
	datetime: number;
	datetimeISO: string;
	user: UserObjectSlim;
};

export type FlagObject = {
	state: string;
	flagId: number;
	type: string;
	targetId: number;
	targetUid: number;
	datetime: number;
	datetimeISO: string;
	target_readable: string;
	target: Record<string, unknown>;
	assignee: number;
	reports: Reports;
} & FlagHistoryObject & FlagNotesObject;

export type Reports = {
	value: string;
	timestamp: number;
	timestampISO: string;
	reporter: UserObjectSlim;
};
