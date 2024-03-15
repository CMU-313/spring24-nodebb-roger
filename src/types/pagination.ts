export type PaginationObject = {
	pagination: Pagination;
};

export type Pagination = {
	prev: ActivePage;
	next: ActivePage;
	first: ActivePage;
	last: ActivePage;
	rel: Relation[];
	pages: Page[];
	currentPage: number;
	pageCount: number;
};

type ActivePage = {
	page: number;
	active: boolean;
};

type Relation = {
	rel: string;
	href: string;
};

type Page = {
	page: number;
	active: boolean;
	qs: string;
};
