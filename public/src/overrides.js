'use strict';

const translator = require('./modules/translator');

window.overrides = window.overrides || {};

function translate(elements, type, string_) {
	return elements.each(function () {
		const element = $(this);
		translator.translate(string_, translated => {
			element[type](translated);
		});
	});
}

if (typeof window !== 'undefined') {
	(function ($) {
		$.fn.getCursorPosition = function () {
			const element = $(this).get(0);
			let pos = 0;
			if ('selectionStart' in element) {
				pos = element.selectionStart;
			} else if ('selection' in document) {
				element.focus();
				const Sel = document.selection.createRange();
				const SelLength = document.selection.createRange().text.length;
				Sel.moveStart('character', -element.value.length);
				pos = Sel.text.length - SelLength;
			}

			return pos;
		};

		$.fn.selectRange = function (start, end) {
			end ||= start;

			return this.each(function () {
				if (this.setSelectionRange) {
					this.focus();
					this.setSelectionRange(start, end);
				} else if (this.createTextRange) {
					const range = this.createTextRange();
					range.collapse(true);
					range.moveEnd('character', end);
					range.moveStart('character', start);
					range.select();
				}
			});
		};

		// http://stackoverflow.com/questions/511088/use-javascript-to-place-cursor-at-end-of-text-in-text-input-element
		$.fn.putCursorAtEnd = function () {
			return this.each(function () {
				$(this).focus();

				if (this.setSelectionRange) {
					const length = $(this).val().length * 2;
					this.setSelectionRange(length, length);
				} else {
					$(this).val($(this).val());
				}

				this.scrollTop = 999_999;
			});
		};

		$.fn.translateHtml = function (string_) {
			return translate(this, 'html', string_);
		};

		$.fn.translateText = function (string_) {
			return translate(this, 'text', string_);
		};

		$.fn.translateVal = function (string_) {
			return translate(this, 'val', string_);
		};

		$.fn.translateAttr = function (attribute, string_) {
			return this.each(function () {
				const element = $(this);
				translator.translate(string_, translated => {
					element.attr(attribute, translated);
				});
			});
		};
	})(jQuery || {fn: {}});

	(function () {
		// FIX FOR #1245 - https://github.com/NodeBB/NodeBB/issues/1245
		// from http://stackoverflow.com/questions/15931962/bootstrap-dropdown-disappear-with-right-click-on-firefox
		// obtain a reference to the original handler
		let _clearMenus = $._data(document, 'events').click.filter(element => element.namespace === 'bs.data-api.dropdown' && element.selector === undefined);

		if (_clearMenus.length > 0) {
			_clearMenus = _clearMenus[0].handler;
		}

		// Disable the old listener
		$(document)
			.off('click.data-api.dropdown', _clearMenus)
			.on('click.data-api.dropdown', e => {
				// Call the handler only when not right-click
				if (e.button !== 2) {
					_clearMenus();
				}
			});
	})();

	let timeagoFunction;
	overrides.overrideTimeagoCutoff = function () {
		const cutoff = Number.parseInt(ajaxify.data.timeagoCutoff || config.timeagoCutoff, 10);
		if (cutoff === 0) {
			$.timeago.settings.cutoff = 1;
		} else if (cutoff > 0) {
			$.timeago.settings.cutoff = 1000 * 60 * 60 * 24 * cutoff;
		}
	};

	overrides.overrideTimeago = function () {
		timeagoFunction ||= $.fn.timeago;

		overrides.overrideTimeagoCutoff();

		$.timeago.settings.allowFuture = true;
		const userLang = config.userLang.replace('_', '-');
		const options = {
			year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric',
		};
		let formatFunction = function (date) {
			return date.toLocaleString(userLang, options);
		};

		try {
			if (typeof Intl !== 'undefined') {
				const dtFormat = new Intl.DateTimeFormat(userLang, options);
				formatFunction = dtFormat.format;
			}
		} catch (error) {
			console.error(error);
		}

		let iso;
		let date;
		$.fn.timeago = function () {
			const els = $(this);
			// Convert "old" format to new format (#5108)
			els.each(function () {
				iso = this.getAttribute('title');
				if (!iso) {
					return;
				}

				this.setAttribute('datetime', iso);
				date = new Date(iso);
				if (!isNaN(date)) {
					this.textContent = formatFunction(date);
				}
			});

			Reflect.apply(timeagoFunction, this, arguments);
		};
	};
}
