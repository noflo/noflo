//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
//
/* @ts-self-types="./Platform.d.ts" */

/* eslint-disable
    no-console,
    no-undef,
*/

// Mechanism for showing API deprecation warnings. By default logs the warnings
// but can also be configured to throw instead with the `NOFLO_FATAL_DEPRECATED`
// environment variable (available on runtimes that expose `process`).
/**
 * @param {string} message
 * @returns {void}
 */
export function deprecated(message) {
  if (
    typeof process !== "undefined" &&
    process.env &&
    process.env.NOFLO_FATAL_DEPRECATED
  ) {
    throw new Error(message);
  }
  console.warn(message);
}

/**
 * Run a function asynchronously. On runtimes exposing a `process` object this
 * uses `process.nextTick` (or `setImmediate` for same-loop scheduling);
 * browser-like runtimes fall back to `setTimeout`.
 *
 * The scheduling phase is deliberate and load-bearing: `process.nextTick`
 * runs before promise callbacks (ordering socket-event emission against the
 * promise-based Edge chain), while `setImmediate`/`setTimeout` are
 * macrotasks that give the event loop a turn before the callback runs (for
 * example initial Information Packets must not be sent until pending I/O of
 * the current iteration has had its chance). Do NOT replace these with
 * `queueMicrotask`: it is a microtask and would fire before the event loop
 * continues, reordering packet delivery and diverging from the browser
 * fallback, which is also a macrotask.
 *
 * @param {Function} func
 * @param {boolean} [sameLoop]
 * @returns {void}
 */
export function makeAsync(func, sameLoop = false) {
  if (
    typeof process !== "undefined" &&
    typeof process.nextTick === "function"
  ) {
    if (sameLoop && typeof setImmediate === "function") {
      setImmediate(() => {
        func();
      });
      return;
    }
    process.nextTick(func);
    return;
  }
  setTimeout(func, 0);
}
