'use strict';

const factory = require('./helpers.common');

define('helpers', ['utils', 'benchpressjs'], (utils, Benchpressjs) => factory(utils, Benchpressjs, config.relative_path));
