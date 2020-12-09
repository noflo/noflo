//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license

/* eslint-disable
    no-param-reassign,
    prefer-rest-params,
*/

// Guess language from filename
/**
 * @param {string} filename
 * @returns {string}
 */
export function guessLanguageFromFilename(filename) {
  if (/.*\.coffee$/.test(filename)) { return 'coffeescript'; }
  if (/.*\.ts$/.test(filename)) { return 'typescript'; }
  return 'javascript';
}

/**
 * @param {Object} obj
 * @returns {boolean}
 */
export function isArray(obj) {
  if (Array.isArray) { return Array.isArray(obj); }
  return Object.prototype.toString.call(obj) === '[object Array]';
}

// the following functions are from http://underscorejs.org/docs/underscore.html
// Underscore.js 1.8.3 http://underscorejs.org
// (c) 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
// Underscore may be freely distributed under the MIT license.

// Returns a function, that, as long as it continues to be invoked,
// will not be triggered.
// The function will be called after it stops being called for N milliseconds.
// If immediate is passed, trigger the function on the leading edge,
// instead of the trailing.
/**
 * @param {Function} func
 * @param {number} wait
 * @param {boolean} [immediate]
 * @returns {Function}
 */
export function debounce(func, wait, immediate) {
  /** @type {any} */
  let timeout;
  /** @type {IArguments|null} */
  let args;
  /** @type {any} */
  let context;
  /** @type {number} */
  let timestamp;
  /** @type {any} */
  let result;

  function later() {
    const last = Date.now() - timestamp;
    if ((last < wait) && (last >= 0)) {
      timeout = setTimeout(later, wait - last);
    } else {
      timeout = null;
      if (!immediate) {
        result = func.apply(context, args);
        if (!timeout) {
          context = null;
          args = null;
        }
      }
    }
  }

  return function after() {
    context = this;
    args = arguments;
    timestamp = Date.now();
    const callNow = immediate && !timeout;
    if (!timeout) {
      timeout = setTimeout(later, wait);
    }
    if (callNow) {
      result = func.apply(context, args);
      context = null;
      args = null;
    }
    return result;
  };
}
