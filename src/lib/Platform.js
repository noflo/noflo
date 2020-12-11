//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
//

/* eslint-disable
    no-console,
    no-undef,
*/

// Platform detection method
/**
 * @returns {boolean}
 */
export function isBrowser() {
  if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
    return false;
  }
  return true;
}

// Mechanism for showing API deprecation warnings. By default logs the warnings
// but can also be configured to throw instead with the `NOFLO_FATAL_DEPRECATED`
// env var.
/**
 * @param {string} message
 * @returns {void}
 */
export function deprecated(message) {
  if (isBrowser()) {
    console.warn(message);
    return;
  }
  if (process.env.NOFLO_FATAL_DEPRECATED) {
    throw new Error(message);
  }
  console.warn(message);
}

/**
 * @param {Function} func
 * @returns {void}
 */
export function makeAsync(func, sameLoop = false) {
  if (isBrowser()) {
    // FIXME: Browsers don't have setImmediate yet so can't do same loop
    setTimeout(func, 0);
    return;
  }
  if (sameLoop) {
    setImmediate(() => {
      func();
    });
    return;
  }
  process.nextTick(func);
}
