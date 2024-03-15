'use strict';

const qs = require('node:querystring');
const _ = require('lodash');

const pagination = module.exports;

pagination.create = function (currentPage, pageCount, queryObject) {
	if (pageCount <= 1) {
		return {
			prev: {page: 1, active: currentPage > 1},
			next: {page: 1, active: currentPage < pageCount},
			first: {page: 1, active: currentPage === 1},
			last: {page: 1, active: currentPage === pageCount},
			rel: [],
			pages: [],
			currentPage: 1,
			pageCount: 1,
		};
	}

	pageCount = Number.parseInt(pageCount, 10);
	let pagesToShow = [1, 2, pageCount - 1, pageCount];

	currentPage = Number.parseInt(currentPage, 10) || 1;
	const previous = Math.max(1, currentPage - 1);
	const next = Math.min(pageCount, currentPage + 1);

	let startPage = Math.max(1, currentPage - 2);
	if (startPage > pageCount - 5) {
		startPage -= 2 - (pageCount - currentPage);
	}

	let i;
	for (i = 0; i < 5; i += 1) {
		pagesToShow.push(startPage + i);
	}

	pagesToShow = _.uniq(pagesToShow).filter(page => page > 0 && page <= pageCount).sort((a, b) => a - b);

	queryObject = {...queryObject};

	delete queryObject._;

	const pages = pagesToShow.map(page => {
		queryObject.page = page;
		return {page, active: page === currentPage, qs: qs.stringify(queryObject)};
	});

	for (i = pages.length - 1; i > 0; i -= 1) {
		if (pages[i].page - 2 === pages[i - 1].page) {
			pages.splice(i, 0, {page: pages[i].page - 1, active: false, qs: qs.stringify(queryObject)});
		} else if (pages[i].page - 1 !== pages[i - 1].page) {
			pages.splice(i, 0, {separator: true});
		}
	}

	const data = {
		rel: [], pages, currentPage, pageCount,
	};
	queryObject.page = previous;
	data.prev = {page: previous, active: currentPage > 1, qs: qs.stringify(queryObject)};
	queryObject.page = next;
	data.next = {page: next, active: currentPage < pageCount, qs: qs.stringify(queryObject)};

	queryObject.page = 1;
	data.first = {page: 1, active: currentPage === 1, qs: qs.stringify(queryObject)};
	queryObject.page = pageCount;
	data.last = {page: pageCount, active: currentPage === pageCount, qs: qs.stringify(queryObject)};

	if (currentPage < pageCount) {
		data.rel.push({
			rel: 'next',
			href: `?${qs.stringify({...queryObject, page: next})}`,
		});
	}

	if (currentPage > 1) {
		data.rel.push({
			rel: 'prev',
			href: `?${qs.stringify({...queryObject, page: previous})}`,
		});
	}

	return data;
};
