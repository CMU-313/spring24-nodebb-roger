'use strict';

define('settings', ['hooks', 'alerts'], (hooks, alerts) => {
	// eslint-disable-next-line prefer-const
	let Settings;
	let onReady = [];
	let waitingJobs = 0;

	let helper;

	/**
     Returns the hook of given name that matches the given type or element.
     @param type The type of the element to get the matching hook for, or the element itself.
     @param name The name of the hook.
     */
	function getHook(type, name) {
		if (typeof type !== 'string') {
			type = $(type);
			type = type.data('type') || type.attr('type') || type.prop('tagName');
		}

		const plugin = Settings.plugins[type.toLowerCase()];
		if (plugin == null) {
			return;
		}

		const hook = plugin[name];
		if (typeof hook === 'function') {
			return hook;
		}

		return null;
	}

	// eslint-disable-next-line prefer-const
	helper = {
		/**
         @returns Object A deep clone of the given object.
         */
		deepClone(object) {
			if (typeof object === 'object') {
				return JSON.parse(JSON.stringify(object));
			}

			return object;
		},
		/**
         Creates a new Element with given data.
         @param tagName The tag-name of the element to create.
         @param data The attributes to set.
         @param text The text to add into the element.
         @returns HTMLElement The created element.
         */
		createElement(tagName, data, text) {
			const element = document.createElement(tagName);
			for (const k in data) {
				if (data.hasOwnProperty(k)) {
					element.setAttribute(k, data[k]);
				}
			}

			if (text) {
				element.append(document.createTextNode(text));
			}

			return element;
		},
		/**
         Calls the init-hook of the given element.
         @param element The element to initialize.
         */
		initElement(element) {
			const hook = getHook(element, 'init');
			if (hook != null) {
				hook.call(Settings, $(element));
			}
		},
		/**
         Calls the destruct-hook of the given element.
         @param element The element to destruct.
         */
		destructElement(element) {
			const hook = getHook(element, 'destruct');
			if (hook != null) {
				hook.call(Settings, $(element));
			}
		},
		/**
         Creates and initializes a new element.
         @param type The type of the new element.
         @param tagName The tag-name of the new element.
         @param data The data to forward to create-hook or use as attributes.
         @returns JQuery The created element.
         */
		createElementOfType(type, tagName, data) {
			let element;
			const hook = getHook(type, 'create');
			if (hook == null) {
				data ??= {};

				if (type != null) {
					data.type = type;
				}

				element = $(helper.createElement(tagName || 'input', data));
			} else {
				element = $(hook.call(Settings, type, tagName, data));
			}

			element.data('type', type);
			helper.initElement(element);
			return element;
		},
		/**
         Creates a new Array that contains values of given Array depending on trim and empty.
         @param array The array to clean.
         @param trim Whether to trim each value if it has a trim-function.
         @param empty Whether empty values should get added.
         @returns Array The filtered and/or modified Array.
         */
		cleanArray(array, trim, empty) {
			const cleaned = [];
			if (!trim && empty) {
				return array;
			}

			for (let value of array) {
				if (trim) {
					if (value === Boolean(value)) {
						value = Number(value);
					} else if (value && typeof value.trim === 'function') {
						value = value.trim();
					}
				}

				if (empty || (value != null && value.length > 0)) {
					cleaned.push(value);
				}
			}

			return cleaned;
		},
		isTrue(value) {
			return value === 'true' || Number(value) === 1;
		},
		isFalse(value) {
			return value === 'false' || Number(value) === 0;
		},
		/**
         Calls the get-hook of the given element and returns its result.
         If no hook is specified it gets treated as input-field.
         @param element The element of that the value should get read.
         @returns Object The value of the element.
         */
		readValue(element) {
			let empty = !helper.isFalse(element.data('empty'));
			const trim = !helper.isFalse(element.data('trim'));
			const split = element.data('split');
			const hook = getHook(element, 'get');
			let value;
			if (hook != null) {
				return hook.call(Settings, element, trim, empty);
			}

			if (split != null) {
				empty = helper.isTrue(element.data('empty')); // Default empty-value is false for arrays
				value = element.val();
				const array = (value != null && value.split(split || ',')) || [];
				return helper.cleanArray(array, trim, empty);
			}

			value = element.val();
			if (trim && value != null && typeof value.trim === 'function') {
				value = value.trim();
			}

			if (empty || (value !== undefined && (value == null || value.length > 0))) {
				return value;
			}
		},
		/**
         Calls the set-hook of the given element.
         If no hook is specified it gets treated as input-field.
         @param element The JQuery-Object of the element to fill.
         @param value The value to set.
         */
		fillField(element, value) {
			const hook = getHook(element, 'set');
			let trim = element.data('trim');
			trim = trim !== 'false' && Number(trim) !== 0;
			if (hook != null) {
				return hook.call(Settings, element, value, trim);
			}

			if (Array.isArray(value)) {
				value = value.join(element.data('split') || (trim ? ', ' : ','));
			}

			if (trim && value && typeof value.trim === 'function') {
				value = value.trim();
				if (typeof value.toString === 'function') {
					value = value.toString();
				}
			} else if (value == null) {
				value = '';
			} else {
				if (typeof value.toString === 'function') {
					value = value.toString();
				}

				if (trim) {
					value = value.trim();
				}
			}

			if (value !== undefined) {
				element.val(value);
			}
		},
		/**
         Calls the init-hook and {@link helper.fillField} on each field within wrapper-object.
         @param wrapper The wrapper-element to set settings within.
         */
		initFields(wrapper) {
			$('[data-key]', wrapper).each((ignored, field) => {
				field = $(field);
				const hook = getHook(field, 'init');
				const keyParts = field.data('key').split('.');
				let value = Settings.get();
				if (hook != null) {
					hook.call(Settings, field);
				}

				for (const part of keyParts) {
					if (part && value != null) {
						value = value[part];
					}
				}

				helper.fillField(field, value);
			});
		},
		/**
         Increases the amount of jobs before settings are ready by given amount.
         @param amount The amount of jobs to register.
         */
		registerReadyJobs(amount) {
			waitingJobs += amount;
			return waitingJobs;
		},
		/**
         Decreases the amount of jobs before settings are ready by given amount or 1.
         If the amount is less or equal 0 all callbacks registered by {@link helper.whenReady} get called.
         @param amount The amount of jobs that finished.
         */
		beforeReadyJobsDecreased(amount) {
			amount ??= 1;

			if (waitingJobs > 0) {
				waitingJobs -= amount;
				if (waitingJobs <= 0) {
					for (const element of onReady) {
						element();
					}

					onReady = [];
				}
			}
		},
		/**
         Calls the given callback when the settings are ready.
         @param callback The callback.
         */
		whenReady(callback) {
			if (waitingJobs <= 0) {
				callback();
			} else {
				onReady.push(callback);
			}
		},
		serializeForm(formElement) {
			const values = formElement.serializeObject();

			// "Fix" checkbox values, so that unchecked options are not omitted
			formElement.find('input[type="checkbox"]').each((index, inputElement) => {
				inputElement = $(inputElement);
				if (!inputElement.is(':checked')) {
					values[inputElement.attr('name')] = 'off';
				}
			});

			// Save multiple selects as json arrays
			formElement.find('select[multiple]').each((index, selectElement) => {
				selectElement = $(selectElement);
				values[selectElement.attr('name')] = JSON.stringify(selectElement.val());
			});

			return values;
		},
		/**
         Persists the given settings with given hash.
         @param hash The hash to use as settings-id.
         @param settings The settings-object to persist.
         @param notify Whether to send notification when settings got saved.
         @param callback The callback to call when done.
         */
		persistSettings(hash, settings, notify, callback) {
			if (settings != null && settings._ != null && typeof settings._ !== 'string') {
				settings = helper.deepClone(settings);
				settings._ = JSON.stringify(settings._);
			}

			socket.emit('admin.settings.set', {
				hash,
				values: settings,
			}, error => {
				if (notify) {
					if (error) {
						alerts.alert({
							title: '[[admin/admin:changes-not-saved]]',
							type: 'danger',
							message: `[[admin/admin/changes-not-saved-message, ${error.message}]]`,
							timeout: 5000,
						});
					} else {
						alerts.alert({
							title: '[[admin/admin:changes-saved]]',
							type: 'success',
							message: '[[admin/admin:changes-saved-message]]',
							timeout: 2500,
						});
					}
				}

				if (typeof callback === 'function') {
					callback(error);
				}
			});
		},
		/**
         Sets the settings to use to given settings.
         @param settings The settings to use.
         */
		use(settings) {
			try {
				settings._ = JSON.parse(settings._);
			} catch {}

			Settings.cfg = settings;
		},
	};

	Settings = {
		helper,
		plugins: {},
		cfg: {},

		/**
         Returns the saved settings.
         @returns Object The settings.
         */
		get() {
			if (Settings.cfg != null && Settings.cfg._ !== undefined) {
				return Settings.cfg._;
			}

			return Settings.cfg;
		},
		/**
         Registers a new plugin and calls its use-hook.
         @param service The plugin to register.
         @param types The types to bind the plugin to.
         */
		registerPlugin(service, types) {
			if (types == null) {
				types = service.types;
			} else {
				service.types = types;
			}

			if (typeof service.use === 'function') {
				service.use.call(Settings);
			}

			for (const type_ of types) {
				const type = type_.toLowerCase();
				if (Settings.plugins[type] == null) {
					Settings.plugins[type] = service;
				}
			}
		},
		/**
         Sets the settings to given ones, resets the fields within given wrapper and saves the settings server-side.
         @param hash The hash to use as settings-id.
         @param settings The settings to set.
         @param wrapper The wrapper-element to find settings within.
         @param callback The callback to call when done.
         @param notify Whether to send notification when settings got saved.
         */
		set(hash, settings, wrapper, callback, notify) {
			notify ??= true;

			helper.whenReady(() => {
				helper.use(settings);
				helper.initFields(wrapper || 'form');
				helper.persistSettings(hash, settings, notify, callback);
			});
		},
		/**
         Fetches the settings from server and calls {@link Settings.helper.initFields} once the settings are ready.
         @param hash The hash to use as settings-id.
         @param wrapper The wrapper-element to set settings within.
         @param callback The callback to call when done.
         */
		sync(hash, wrapper, callback) {
			socket.emit('admin.settings.get', {
				hash,
			}, (error, values) => {
				if (error) {
					if (typeof callback === 'function') {
						callback(error);
					}
				} else {
					helper.whenReady(() => {
						helper.use(values);
						helper.initFields(wrapper || 'form');
						if (typeof callback === 'function') {
							callback();
						}
					});
				}
			});
		},
		/**
         Reads the settings from fields and saves them server-side.
         @param hash The hash to use as settings-id.
         @param wrapper The wrapper-element to find settings within.
         @param callback The callback to call when done.
         @param notify Whether to send notification when settings got saved.
         */
		persist(hash, wrapper, callback, notify) {
			const notSaved = [];
			const fields = $('[data-key]', wrapper || 'form').toArray();
			notify ??= true;

			for (const field_ of fields) {
				const field = $(field_);
				const value = helper.readValue(field);
				let parentCfg = Settings.get();
				const keyParts = field.data('key').split('.');
				const lastKey = keyParts.at(-1);
				if (keyParts.length > 1) {
					for (let index = 0; index < keyParts.length - 1; index += 1) {
						const part = keyParts[index];
						if (part && parentCfg != null) {
							parentCfg = parentCfg[part];
						}
					}
				}

				if (parentCfg == null) {
					notSaved.push(field.data('key'));
				} else if (value == null) {
					delete parentCfg[lastKey];
				} else {
					parentCfg[lastKey] = value;
				}
			}

			if (notSaved.length > 0) {
				alerts.alert({
					title: 'Attributes Not Saved',
					message: '\'' + (notSaved.join(', ')) + '\' could not be saved. Please contact the plugin-author!',
					type: 'danger',
					timeout: 5000,
				});
			}

			helper.persistSettings(hash, Settings.cfg, notify, callback);
		},
		load(hash, formElement, callback) {
			callback ||= function () {};
			const call = formElement.attr('data-socket-get');

			socket.emit(call || 'admin.settings.get', {
				hash,
			}, (error, values) => {
				if (error) {
					return callback(error);
				}

				// Multipe selects are saved as json arrays, parse them here
				$(formElement).find('select[multiple]').each((index, selectElement) => {
					const key = $(selectElement).attr('name');
					if (key && values.hasOwnProperty(key)) {
						try {
							values[key] = JSON.parse(values[key]);
						} catch {
							// Leave the value as is
						}
					}
				});

				// Save loaded settings into ajaxify.data for use client-side
				ajaxify.data[call ? hash : 'settings'] = values;

				helper.whenReady(() => {
					$(formElement).find('[data-sorted-list]').each((index, element) => {
						getHook(element, 'get').call(Settings, $(element), hash);
					});
				});

				$(formElement).deserialize(values);
				$(formElement).find('input[type="checkbox"]').each(function () {
					$(this).parents('.mdl-switch').toggleClass('is-checked', $(this).is(':checked'));
				});
				hooks.fire('action:admin.settingsLoaded');

				// Handle unsaved changes
				$(formElement).on('change', 'input, select, textarea', () => {
					app.flags = app.flags || {};
					app.flags._unsaved = true;
				});

				const saveElement = document.querySelector('#save');
				if (saveElement) {
					require(['mousetrap'], mousetrap => {
						mousetrap.bind('ctrl+s', event => {
							saveElement.click();
							event.preventDefault();
						});
					});
				}

				callback(null, values);
			});
		},
		save(hash, formElement, callback) {
			formElement = $(formElement);

			const controls = formElement.get(0).elements;
			const ok = Settings.check(controls);
			if (!ok) {
				return;
			}

			if (formElement.length > 0) {
				const values = helper.serializeForm(formElement);

				helper.whenReady(() => {
					const list = formElement.find('[data-sorted-list]');
					if (list.length > 0) {
						list.each((index, item) => {
							getHook(item, 'set').call(Settings, $(item), values);
						});
					}
				});

				const call = formElement.attr('data-socket-set');
				socket.emit(call || 'admin.settings.set', {
					hash,
					values,
				}, error => {
					// Remove unsaved flag to re-enable ajaxify
					app.flags._unsaved = false;

					// Also save to local ajaxify.data
					ajaxify.data[call ? hash : 'settings'] = values;

					if (typeof callback === 'function') {
						callback(error);
					} else if (error) {
						alerts.alert({
							title: '[[admin/admin:changes-not-saved]]',
							message: `[[admin/admin:changes-not-saved-message, ${error.message}]]`,
							type: 'error',
							timeout: 2500,
						});
					} else {
						alerts.alert({
							title: '[[admin/admin:changes-saved]]',
							type: 'success',
							timeout: 2500,
						});
					}
				});
			}
		},
		check(controls) {
			const onTrigger = e => {
				const wrapper = e.target.closest('.form-group');
				if (wrapper) {
					wrapper.classList.add('has-error');
				}

				e.target.removeEventListener('invalid', onTrigger);
			};

			return Array.prototype.map.call(controls, controlElement => {
				const wrapper = controlElement.closest('.form-group');
				if (wrapper) {
					wrapper.classList.remove('has-error');
				}

				controlElement.addEventListener('invalid', onTrigger);
				return controlElement.reportValidity();
			}).every(Boolean);
		},
	};

	helper.registerReadyJobs(1);
	require([
		'settings/checkbox',
		'settings/number',
		'settings/textarea',
		'settings/select',
		'settings/array',
		'settings/key',
		'settings/object',
		'settings/sorted-list',
	], function () {
		for (const argument of arguments) {
			Settings.registerPlugin(argument);
		}

		helper.beforeReadyJobsDecreased();
	});

	return Settings;
});
