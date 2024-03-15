'use strict';

define('settings/object', () => {
	let helper = null;

	/**
     Creates a new child-element of given property with given data and calls given callback with elements to add.
     @param field Any wrapper that contains all properties of the object.
     @param key The key of the object.
     @param attributes The attributes to call {@link Settings.helper.createElementOfType} with or to add as
     element-attributes.
     @param value The value to call {@link Settings.helper.fillField} with.
     @param separator The separator to use.
     @param insertCb The callback to insert the elements.
     */
	function addObjectPropertyElement(field, key, attributes, property, value, separator, insertCallback) {
		const prepend = attributes['data-prepend'];
		const append = attributes['data-append'];
		delete attributes['data-prepend'];
		delete attributes['data-append'];
		attributes = helper.deepClone(attributes);
		const type = attributes['data-type'] || attributes.type || 'text';
		const element = $(helper.createElementOfType(type, attributes.tagName, attributes));
		element.attr('data-parent', '_' + key);
		element.attr('data-prop', property);
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

		if (prepend) {
			insertCallback(prepend);
		}

		insertCallback(element);
		if (append) {
			insertCallback(append);
		}
	}

	const SettingsObject = {
		types: ['object'],
		use() {
			helper = this.helper;
		},
		create(ignored, tagName) {
			return helper.createElement(tagName || 'div');
		},
		set(element, value) {
			const properties = element.data('attributes') || element.data('properties');
			const key = element.data('key') || element.data('parent');
			let separator = element.data('split') || ', ';
			let propertyIndex;
			let propertyName;
			let attributes;
			separator = (function () {
				try {
					return $(separator);
				} catch {
					return $(document.createTextNode(separator));
				}
			})();
			element.empty();
			if (typeof value !== 'object') {
				value = {};
			}

			if (Array.isArray(properties)) {
				for (propertyIndex in properties) {
					if (properties.hasOwnProperty(propertyIndex)) {
						attributes = properties[propertyIndex];
						if (typeof attributes !== 'object') {
							attributes = {};
						}

						propertyName = attributes['data-prop'] || attributes['data-property'] || propertyIndex;
						if (value[propertyName] === undefined && attributes['data-new'] !== undefined) {
							value[propertyName] = attributes['data-new'];
						}

						addObjectPropertyElement(
							element,
							key,
							attributes,
							propertyName,
							value[propertyName],
							separator.clone(),
							element_ => {
								element.append(element_);
							},
						);
					}
				}
			}
		},
		get(element, trim, empty) {
			const key = element.data('key') || element.data('parent');
			const properties = $('[data-parent="_' + key + '"]', element);
			const value = {};
			properties.each((i, property) => {
				property = $(property);
				const value_ = helper.readValue(property);
				const property_ = property.data('prop');
				const empty = helper.isTrue(property.data('empty'));
				if (empty || (value_ !== undefined && (value_ == null || value_.length > 0))) {
					value[property_] = value_;
					return value_;
				}
			});
			if (empty || Object.keys(value).length > 0) {
				return value;
			}
		},
	};

	return SettingsObject;
});
