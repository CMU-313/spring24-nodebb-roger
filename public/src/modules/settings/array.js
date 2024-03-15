'use strict';

define('settings/array', () => {
	let helper = null;

	/**
     Creates a new button that removes itself and the given elements on click.
     Calls {@link Settings.helper.destructElement} for each given field.
     @param elements The elements to remove on click.
     @returns JQuery The created remove-button.
     */
	function createRemoveButton(elements) {
		const rm = $(helper.createElement('button', {
			class: 'btn btn-xs btn-primary remove',
			title: 'Remove Item',
		}, '-'));
		rm.click(event => {
			event.preventDefault();
			elements.remove();
			rm.remove();
			elements.each((i, element) => {
				element = $(element);
				if (element.is('[data-key]')) {
					helper.destructElement(element);
				}
			});
		});
		return rm;
	}

	/**
     Creates a new child-element of given field with given data and calls given callback with elements to add.
     @param field Any wrapper that contains all fields of the array.
     @param key The key of the array.
     @param attributes The attributes to call {@link Settings.helper.createElementOfType} with or to add as
     element-attributes.
     @param value The value to call {@link Settings.helper.fillField} with.
     @param separator The separator to use.
     @param insertCb The callback to insert the elements.
     */
	function addArrayChildElement(field, key, attributes, value, separator, insertCallback) {
		attributes = helper.deepClone(attributes);
		const type = attributes['data-type'] || attributes.type || 'text';
		const element = $(helper.createElementOfType(type, attributes.tagName, attributes));
		element.attr('data-parent', '_' + key);
		delete attributes['data-type'];
		delete attributes.tagName;
		for (const name in attributes) {
			if (attributes.hasOwnProperty(name)) {
				const value_ = attributes[name];
				if (name.search('data-') === 0) {
					element.data(name.slice(5), value_);
				} else if (name.search('prop-') === 0) {
					element.prop(name.slice(5), value_);
				} else {
					element.attr(name, value_);
				}
			}
		}

		helper.fillField(element, value);
		if ($('[data-parent="_' + key + '"]', field).length > 0) {
			insertCallback(separator);
		}

		insertCallback(element);
		insertCallback(createRemoveButton(element.add(separator)));
	}

	/**
     Adds a new button that adds a new child-element to given element on click.
     @param element The element to insert the button.
     @param key The key to forward to {@link addArrayChildElement}.
     @param attributes The attributes to forward to {@link addArrayChildElement}.
     @param separator The separator to forward to {@link addArrayChildElement}.
     */
	function addAddButton(element, key, attributes, separator) {
		const addSpace = $(document.createTextNode(' '));
		const newValue = element.data('new') || '';
		const add = $(helper.createElement('button', {
			class: 'btn btn-sm btn-primary add',
			title: 'Expand Array',
		}, '+'));
		add.click(event => {
			event.preventDefault();
			addArrayChildElement(element, key, attributes, newValue, separator.clone(), element_ => {
				addSpace.before(element_);
			});
		});
		element.append(addSpace);
		element.append(add);
	}

	const SettingsArray = {
		types: ['array', 'div'],
		use() {
			helper = this.helper;
		},
		create(ignored, tagName) {
			return helper.createElement(tagName || 'div');
		},
		set(element, value) {
			let attributes = element.data('attributes');
			const key = element.data('key') || element.data('parent');
			let separator = element.data('split') || ', ';
			separator = (function () {
				try {
					return $(separator);
				} catch {
					return $(document.createTextNode(separator));
				}
			})();
			if (typeof attributes !== 'object') {
				attributes = {};
			}

			element.empty();
			if (!(Array.isArray(value))) {
				value = [];
			}

			for (const element_ of value) {
				addArrayChildElement(element, key, attributes, element_, separator.clone(), element__ => {
					element.append(element__);
				});
			}

			addAddButton(element, key, attributes, separator);
		},
		get(element, trim, empty) {
			const key = element.data('key') || element.data('parent');
			const children = $('[data-parent="_' + key + '"]', element);
			const values = [];
			children.each((i, child) => {
				child = $(child);
				const value = helper.readValue(child);
				const empty = helper.isTrue(child.data('empty'));
				if (empty || (value !== undefined && (value == null || value.length > 0))) {
					return values.push(value);
				}
			});
			if (empty || values.length > 0) {
				return values;
			}
		},
	};

	return SettingsArray;
});
