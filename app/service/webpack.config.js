'use strict';
const path = require('path');

module.exports = {
  entry: './src/index.js',
  target: 'node',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    libraryTarget: 'commonjs2'
  },
  optimization: {
    minimize: false  // keep readable for sdb dlog debugging
  },
  resolve: {
    extensions: ['.js']
  }
};