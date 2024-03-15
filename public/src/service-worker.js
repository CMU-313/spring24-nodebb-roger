'use strict';

self.addEventListener('fetch', event => {
	// This is the code that ignores post requests
	// https://github.com/NodeBB/NodeBB/issues/9151
	// https://github.com/w3c/ServiceWorker/issues/1141
	// https://stackoverflow.com/questions/54448367/ajax-xmlhttprequest-progress-monitoring-doesnt-work-with-service-workers
	if (event.request.method === 'POST') {
		return;
	}

	event.respondWith(caches.match(event.request).then(response => {
		if (!response) {
			return fetch(event.request);
		}

		return response;
	}));
});
