//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
//

/* eslint-disable
    no-console,
    no-undef,
*/

// Platform detection method
exports.isBrowser = function isBrowser() {
  if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
    return false;
  }
  return true;
};

// Mechanism for showing API deprecation warnings. By default logs the warnings
// but can also be configured to throw instead with the `NOFLO_FATAL_DEPRECATED`
// env var.
exports.deprecated = function deprecated(message) {
  if (exports.isBrowser()) {
    console.warn(message);
    return;
  }
  if (process.env.NOFLO_FATAL_DEPRECATED) {
    throw new Error(message);
  }
  console.warn(message);
};
