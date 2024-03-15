import {type TagObject} from './tag';

export type CommonProps = {
	loggedIn: boolean;
	relative_path: string;
	template: Template;
	url: string;
	bodyClass: string;
	_header: Header;
	widgets: Widget[];
};

export type Template = {
	name: string;
};

export type Header = {
	tags: TagObject[];
	link: Link[];
};

export type Link = {
	rel: string;
	type: string;
	href: string;
	title: string;
	sizes: string;
	as: string;
};

export type Widget = {
	html: string;
};
