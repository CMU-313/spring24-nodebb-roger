'use strict';

const db = require('../../database');
const events = require('../../events');
const pagination = require('../../pagination');

const eventsController = module.exports;

eventsController.get = async function (request, res) {
	const page = Number.parseInt(request.query.page, 10) || 1;
	const itemsPerPage = Number.parseInt(request.query.perPage, 10) || 20;
	const start = (page - 1) * itemsPerPage;
	const stop = start + itemsPerPage - 1;

	// Limit by date
	let from = request.query.start ? new Date(request.query.start) || undefined : undefined;
	let to = request.query.end ? new Date(request.query.end) || undefined : new Date();
	from &&= from.setHours(0, 0, 0, 0); // SetHours returns a unix timestamp (Number, not Date)
	to &&= to.setHours(23, 59, 59, 999); // SetHours returns a unix timestamp (Number, not Date)

	const currentFilter = request.query.type || '';

	const [eventCount, eventData, counts] = await Promise.all([
		db.sortedSetCount(`events:time${currentFilter ? `:${currentFilter}` : ''}`, from || '-inf', to),
		events.getEvents(currentFilter, start, stop, from || '-inf', to),
		db.sortedSetsCard([''].concat(events.types).map(type => `events:time${type ? `:${type}` : ''}`)),
	]);

	const types = [''].concat(events.types).map((type, index) => ({
		value: type,
		name: type || 'all',
		selected: type === currentFilter,
		count: counts[index],
	}));

	const pageCount = Math.max(1, Math.ceil(eventCount / itemsPerPage));

	res.render('admin/advanced/events', {
		events: eventData,
		pagination: pagination.create(page, pageCount, request.query),
		types,
		query: request.query,
	});
};
