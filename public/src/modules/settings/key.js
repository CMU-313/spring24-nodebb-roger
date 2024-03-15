'use strict';

define('settings/key', () => {
	let helper = null;
	let lastKey = null;
	let oldKey = null;
	const keyMap = Object.freeze({
		0: '',
		8: 'Backspace',
		9: 'Tab',
		13: 'Enter',
		27: 'Escape',
		32: 'Space',
		37: 'Left',
		38: 'Up',
		39: 'Right',
		40: 'Down',
		45: 'Insert',
		46: 'Delete',
		187: '=',
		189: '-',
		190: '.',
		191: '/',
		219: '[',
		220: '\\',
		221: ']',
	});

	function Key() {
		this.c = false;
		this.a = false;
		this.s = false;
		this.m = false;
		this.code = 0;
		this.char = '';
	}

	/**
     Returns either a Key-Object representing the given event or null if only modification-keys got released.
     @param event The event to inspect.
     @returns Key | null The Key-Object the focused element should be set to.
     */
	function getKey(event) {
		const anyModuleChange = (
			event.ctrlKey !== lastKey.c
            || event.altKey !== lastKey.a
            || event.shiftKey !== lastKey.s
            || event.metaKey !== lastKey.m
		);
		const moduleChange = (
			event.ctrlKey
            + event.altKey
            + event.shiftKey
            + event.metaKey
            - lastKey.c
            - lastKey.a
            - lastKey.s
            - lastKey.m
		);
		const key = new Key();
		key.c = event.ctrlKey;
		key.a = event.altKey;
		key.s = event.shiftKey;
		key.m = event.metaKey;
		lastKey = key;
		if (anyModuleChange) {
			if (moduleChange < 0) {
				return null;
			}

			key.code = oldKey.code;
			key.char = oldKey.char;
		} else {
			key.code = event.which;
			key.char = convertKeyCodeToChar(key.code);
		}

		oldKey = key;
		return key;
	}

	/**
     Returns the string that represents the given key-code.
     @param code The key-code.
     @returns String Representation of the given key-code.
     */
	function convertKeyCodeToChar(code) {
		code = Number(code);
		if (code === 0) {
			return '';
		}

		if (code >= 48 && code <= 90) {
			return String.fromCharCode(code).toUpperCase();
		}

		if (code >= 112 && code <= 123) {
			return 'F' + (code - 111);
		}

		return keyMap[code] || ('#' + code);
	}

	/**
     Returns a string to identify a Key-Object.
     @param key The Key-Object that should get identified.
     @param human Whether to show 'Enter a key' when key-char is empty.
     @param short Whether to shorten modification-names to first character.
     @param separator The separator between modification-names and key-char.
     @returns String The string to identify the given key-object the given way.
     */
	function getKeyString(key, human, short, separator) {
		let string_ = '';
		if (!(key instanceof Key)) {
			return string_;
		}

		if (!key.char) {
			if (human) {
				return 'Enter a key';
			}

			return '';
		}

		if (!separator || /CtrlAShifMea#/.test(separator)) {
			separator = human ? ' + ' : '+';
		}

		if (key.c) {
			string_ += (short ? 'C' : 'Ctrl') + separator;
		}

		if (key.a) {
			string_ += (short ? 'A' : 'Alt') + separator;
		}

		if (key.s) {
			string_ += (short ? 'S' : 'Shift') + separator;
		}

		if (key.m) {
			string_ += (short ? 'M' : 'Meta') + separator;
		}

		let out;
		if (human) {
			out = key.char;
		} else if (key.code) {
			out = '#' + key.code || '';
		}

		return string_ + out;
	}

	/**
     Parses the given string into a Key-Object.
     @param str The string to parse.
     @returns Key The Key-Object that got identified by the given string.
     */
	function getKeyFromString(string_) {
		if (string_ instanceof Key) {
			return string_;
		}

		const key = new Key();
		const separator = /([^CtrlAShifMea#\d]+)[#\d]/.exec(string_);
		const parts = separator == null ? [string_] : string_.split(separator[1]);
		for (const part of parts) {
			switch (part) {
				case 'C':
				case 'Ctrl': {
					key.c = true;
					break;
				}

				case 'A':
				case 'Alt': {
					key.a = true;
					break;
				}

				case 'S':
				case 'Shift': {
					key.s = true;
					break;
				}

				case 'M':
				case 'Meta': {
					key.m = true;
					break;
				}

				default: {
					const number_ = /\d+/.exec(part);
					if (number_ != null) {
						key.code = number_[0];
					}

					key.char = convertKeyCodeToChar(key.code);
				}
			}
		}

		return key;
	}

	const SettingsKey = {
		types: ['key'],
		use() {
			helper = this.helper;
		},
		init(element) {
			element.focus(() => {
				oldKey = element.data('keyData') || new Key();
				lastKey = new Key();
			}).keydown(event => {
				event.preventDefault();
				handleEvent(element, event);
			}).keyup(event => {
				handleEvent(element, event);
			});
			return element;
		},
		set(element, value) {
			const key = getKeyFromString(value || '');
			element.data('keyData', key);
			if (key.code) {
				element.removeClass('alert-danger');
			} else {
				element.addClass('alert-danger');
			}

			element.val(getKeyString(key, true, false, ' + '));
		},
		get(element, trim, empty) {
			const key = element.data('keyData');
			const separator = element.data('split') || element.data('separator') || '+';
			const short = !helper.isFalse(element.data('short'));
			if (trim) {
				if (empty || (key != null && key.char)) {
					return getKeyString(key, false, short, separator);
				}
			} else if (empty || (key != null && key.code)) {
				return key;
			}
		},
	};

	function handleEvent(element, event) {
		event ||= window.event;
		event.which = event.which || event.keyCode || event.key;
		const key = getKey(event);
		if (key != null) {
			SettingsKey.set(element, key);
		}
	}

	return SettingsKey;
});
