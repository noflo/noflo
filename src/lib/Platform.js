/* eslint-disable
    consistent-return,
    func-names,
    no-console,
    no-undef,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
//
// Platform detection method
exports.isBrowser = function () {
  if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
    return false;
  }
  return true;
};

// Mechanism for showing API deprecation warnings. By default logs the warnings
// but can also be configured to throw instead with the `NOFLO_FATAL_DEPRECATED`
// env var.
exports.deprecated = function (message) {
  if (exports.isBrowser()) {
    if (window.NOFLO_FATAL_DEPRECATED) { throw new Error(message); }
    console.warn(message);
    return;
  }
  if (process.env.NOFLO_FATAL_DEPRECATED) {
    throw new Error(message);
  }
  return console.warn(message);
};
