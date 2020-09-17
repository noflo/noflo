//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license

/* eslint-disable
    no-param-reassign,
    prefer-rest-params,
*/

// Guess language from filename
function guessLanguageFromFilename(filename) {
  if (/.*\.coffee$/.test(filename)) { return 'coffeescript'; }
  if (/.*\.ts$/.test(filename)) { return 'typescript'; }
  return 'javascript';
}

function isArray(obj) {
  if (Array.isArray) { return Array.isArray(obj); }
  return Object.prototype.toString.call(obj) === '[object Array]';
}

// the following functions are from http://underscorejs.org/docs/underscore.html
// Underscore.js 1.8.3 http://underscorejs.org
// (c) 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
// Underscore may be freely distributed under the MIT license.

// Internal function that returns an efficient (for current engines)
// version of the passed-in callback,
// to be repeatedly applied in other Underscore functions.
function optimizeCb(func, context, argCount) {
  if (context === undefined) {
    return func;
  }
  switch (argCount === null ? 3 : argCount) {
    case 1:
      return (value) => func.call(context, value);
    case 2:
      return (value, other) => func.call(context, value, other);
    case 3:
      return (value, index, collection) => func.call(context, value, index, collection);
    case 4:
      return (accumulator, value, index, collection) => {
        func.call(context, accumulator, value, index, collection);
      };
    default: // No-op
  }
  return function call() {
    return func.apply(context, arguments);
  };
}

// Create a reducing function iterating left or right.
// Optimized iterator function as using arguments.length in the main function
// will deoptimize the, see #1991.
function createReduce(dir) {
  function iterator(obj, iteratee, memo, keys, index, length) {
    while ((index >= 0) && (index < length)) {
      const currentKey = keys ? keys[index] : index;
      memo = iteratee(memo, obj[currentKey], currentKey, obj);
      index += dir;
    }
    return memo;
  }

  return function reduce(obj, iteratee, memo, context) {
    iteratee = optimizeCb(iteratee, context, 4);
    const keys = Object.keys(obj);
    const {
      length,
    } = keys || obj;
    let index = dir > 0 ? 0 : length - 1;
    if (arguments.length < 3) {
      memo = obj[keys ? keys[index] : index];
      index += dir;
    }
    return iterator(obj, iteratee, memo, keys, index, length);
  };
}

const reduceRight = createReduce(-1);

// Returns a function, that, as long as it continues to be invoked,
// will not be triggered.
// The function will be called after it stops being called for N milliseconds.
// If immediate is passed, trigger the function on the leading edge,
// instead of the trailing.
function debounce(func, wait, immediate) {
  let timeout;
  let args;
  let context;
  let timestamp;
  let result;

  function later() {
    const last = Date.now - timestamp;
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
    timestamp = Date.now;
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

exports.guessLanguageFromFilename = guessLanguageFromFilename;
exports.reduceRight = reduceRight;
exports.debounce = debounce;
exports.isArray = isArray;
