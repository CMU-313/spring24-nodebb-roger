'use strict';

const meta = require('./meta');
const pubsub = require('./pubsub');

function expandObjectBy(object1, object2) {
	let changed = false;
	if (!object1 || !object2) {
		return changed;
	}

	for (const [key, value2] of Object.entries(object2)) {
		const value1 = object1[key];
		const xorIsArray = Array.isArray(value1) !== Array.isArray(value2);
		if (xorIsArray || !object1.hasOwnProperty(key) || typeof value2 !== typeof value1) {
			object1[key] = value2;
			changed = true;
		} else if (typeof value2 === 'object' && !Array.isArray(value2) && expandObjectBy(value1, value2)) {
			changed = true;
		}
	}

	return changed;
}

function trim(object1, object2) {
	for (const [key, value1] of Object.entries(object1)) {
		if (!object2.hasOwnProperty(key)) {
			delete object1[key];
		} else if (typeof value1 === 'object' && !Array.isArray(value1)) {
			trim(value1, object2[key]);
		}
	}
}

function mergeSettings(cfg, defCfg) {
	if (typeof defCfg !== 'object') {
		return;
	}

	if (typeof cfg._ === 'object') {
		expandObjectBy(cfg._, defCfg);
		trim(cfg._, defCfg);
	} else {
		cfg._ = defCfg;
	}
}

/**
 A class to manage Objects saved in {@link meta.settings} within property "_".
 Constructor, synchronizes the settings and repairs them if version differs.
 @param hash The hash to use for {@link meta.settings}.
 @param version The version of the settings, used to determine whether the saved settings may be corrupt.
 @param defCfg The default settings.
 @param callback Gets called once the Settings-object is ready.
 @param forceUpdate Whether to trigger structure-update even if the version doesn't differ from saved one.
 Should be true while plugin-development to ensure structure-changes within settings persist.
 @param reset Whether to reset the settings.
 */
function Settings(hash, version, defCfg, callback, forceUpdate, reset) {
	this.hash = hash;
	this.version = version || this.version;
	this.defCfg = defCfg;
	const self = this;

	if (reset) {
		this.reset(callback);
	} else {
		this.sync(function () {
			this.checkStructure(callback, forceUpdate);
		});
	}

	pubsub.on(`action:settings.set.${hash}`, data => {
		try {
			self.cfg._ = JSON.parse(data._);
		} catch {}
	});
}

Settings.prototype.hash = '';
Settings.prototype.defCfg = {};
Settings.prototype.cfg = {};
Settings.prototype.version = '0.0.0';

/**
 Synchronizes the local object with the saved object (reverts changes).
 @param callback Gets called when done.
 */
Settings.prototype.sync = function (callback) {
	const _this = this;
	meta.settings.get(this.hash, (error, settings) => {
		try {
			settings._ &&= JSON.parse(settings._);
		} catch {}

		_this.cfg = settings;
		if (typeof _this.cfg._ !== 'object') {
			_this.cfg._ = _this.defCfg;
			_this.persist(callback);
		} else if (expandObjectBy(_this.cfg._, _this.defCfg)) {
			_this.persist(callback);
		} else if (typeof callback === 'function') {
			callback.apply(_this, error);
		}
	});
};

/**
 Persists the local object.
 @param callback Gets called when done.
 */
Settings.prototype.persist = function (callback) {
	let config = this.cfg._;
	const _this = this;
	if (typeof config === 'object') {
		config = JSON.stringify(config);
	}

	meta.settings.set(this.hash, this.createWrapper(this.cfg.v, config), (...arguments_) => {
		if (typeof callback === 'function') {
			callback.apply(_this, arguments_ || []);
		}
	});
	return this;
};

/**
 Returns the setting of given key or default value if not set.
 @param key The key of the setting to return.
 @param def The default value, if not set global default value gets used.
 @returns Object The setting to be used.
 */
Settings.prototype.get = function (key, def) {
	let object = this.cfg._;
	const parts = (key || '').split('.');
	let part;
	for (const part_ of parts) {
		part = part_;
		if (part && object != null) {
			object = object[part];
		}
	}

	if (object === undefined) {
		if (def === undefined) {
			def = this.defCfg;
			for (const part_ of parts) {
				part = part_;
				if (part && def != null) {
					def = def[part];
				}
			}
		}

		return def;
	}

	return object;
};

/**
 Returns the settings-wrapper object.
 @returns Object The settings-wrapper.
 */
Settings.prototype.getWrapper = function () {
	return this.cfg;
};

/**
 Creates a new wrapper for the given settings with the given version.
 @returns Object The new settings-wrapper.
 */
Settings.prototype.createWrapper = function (version, settings) {
	return {
		v: version,
		_: settings,
	};
};

/**
 Creates a new wrapper for the default settings.
 @returns Object The new settings-wrapper.
 */
Settings.prototype.createDefaultWrapper = function () {
	return this.createWrapper(this.version, this.defCfg);
};

/**
 Sets the setting of given key to given value.
 @param key The key of the setting to set.
 @param val The value to set.
 */
Settings.prototype.set = function (key, value) {
	let part;
	let object;
	let parts;
	this.cfg.v = this.version;
	if (value == null || !key) {
		this.cfg._ = value || key;
	} else {
		object = this.cfg._;
		parts = key.split('.');
		for (let i = 0, _length = parts.length - 1; i < _length; i += 1) {
			part = parts[i];
			if (part) {
				if (!object.hasOwnProperty(part)) {
					object[part] = {};
				}

				object = object[part];
			}
		}

		object[parts.at(-1)] = value;
	}

	return this;
};

/**
 Resets the saved settings to default settings.
 @param callback Gets called when done.
 */
Settings.prototype.reset = function (callback) {
	this.set(this.defCfg).persist(callback);
	return this;
};

/**
 If the version differs the settings get updated and persisted.
 @param callback Gets called when done.
 @param force Whether to update and persist the settings even if the versions ara equal.
 */
Settings.prototype.checkStructure = function (callback, force) {
	if (!force && this.cfg.v === this.version) {
		if (typeof callback === 'function') {
			callback();
		}
	} else {
		mergeSettings(this.cfg, this.defCfg);
		this.cfg.v = this.version;
		this.persist(callback);
	}

	return this;
};

module.exports = Settings;
