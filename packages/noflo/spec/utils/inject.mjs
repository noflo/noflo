/* eslint-disable */
if (typeof global !== 'undefined') {
  // Node.js injections for Mocha tests
  global.chai = require('chai');
  global.path = require('path');
  global.noflo = require('../../src/lib/NoFlo');
  global.flowtrace = require('flowtrace');
  global.baseDir = process.cwd();
} else {
  // Browser injections for Mocha tests
  window.noflo = require('noflo');
  window.baseDir = 'browser';
  window.flowtrace = require('flowtrace');
}
