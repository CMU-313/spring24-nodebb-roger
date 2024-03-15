'use strict';

const {merge} = require('webpack-merge');
const common = require('./webpack.common');

module.exports = merge(common, {
	mode: 'development',
	// Devtool: 'inline-source-map',
});
