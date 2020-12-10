//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2018 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
/* eslint-disable
    import/prefer-default-export,
*/
import * as getParams from 'get-function-params';
import { Component } from './Component';

/**
 * @typedef FuncParam
 * @property {string} param
 * @property {any} [default]
 */
/**
 * @typedef {Object} PortOptions - Options for configuring all types of ports
 * @property {string} [description='']
 * @property {string} [datatype='all']
 * @property {string} [schema=null]
 * @property {string} [type=null]
 * @property {boolean} [required=false]
 * @property {boolean} [scoped=true]
 * @property {any} [default]
 */

// ## asComponent generator API
//
// asComponent is a helper for turning JavaScript functions into
// NoFlo components.
//
// Each call to this function returns a component instance where
// the input parameters of the given function are converted into
// NoFlo inports, and there are `out` and `error` ports for the
// results of the function execution.
//
// Variants supported:
//
// * Regular synchronous functions: return value gets sent to `out`.
//   Thrown errors get sent to `error`
// * Functions returning a Promise: resolved promises get sent to `out`,
//   rejected promises to `error`
// * Functions taking a Node.js style asynchronous callback: `err` argument
//   to callback gets sent to `error`, result gets sent to `out`
//
// Usage example:
//
//     exports.getComponent = function () {
//       return noflo.asComponent(Math.random, {
//         description: 'Generate a random number',
//       });
//     };
//
// ### Wrapping built-in functions
//
// Built-in JavaScript functions don't make their arguments introspectable.
// Because of this, these cannot be directly converted to components.
// You'll have to provide a wrapper JavaScript function to make  the arguments appear as ports.
//
// Example:
//
//     exports.getComponent = function () {
//       return noflo.asComponent(function (selector) {
//         return document.querySelector(selector);
//       }, {
//         description: 'Return an element matching the CSS selector',
//         icon: 'html5',
//       });
//     };
//
// ### Default values
//
// Function arguments with a default value are supported in ES6 environments.
// The default arguments are visible via the component's port interface.
//
// However, ES5 transpilation doesn't work with default values.
// In these cases the port with a default won't be visible. It is
// recommended to use default values only with components that don't need to run in legacy browsers.
/**
 * @param {Function} func
 * @param {Object} options
 * @returns {Component}
 */
export function asComponent(func, options) {
  let hasCallback = false;
  /** @type {Array<FuncParam>} */
  const params = getParams(func).filter((p) => {
    if (p.param !== 'callback') { return true; }
    hasCallback = true;
    return false;
  });

  const c = new Component(options);
  params.forEach((p) => {
    /** @type {PortOptions} */
    const portOptions = { required: true };
    if (typeof p.default !== 'undefined') {
      portOptions.default = p.default;
      portOptions.required = false;
    }
    c.inPorts.add(p.param, portOptions);
    c.forwardBrackets[p.param] = ['out', 'error'];
  });
  if (!params.length) {
    c.inPorts.add('in',
      { datatype: 'bang' });
  }

  c.outPorts.add('out');
  c.outPorts.add('error');
  c.process((input, output) => {
    let values;
    if (params.length) {
      for (let i = 0; i < params.length; i += 1) {
        const p = params[i];
        if (!input.hasData(p.param)) { return; }
      }
      values = params.map((p) => input.getData(p.param));
    } else {
      if (!input.hasData('in')) { return; }
      input.getData('in');
      values = [];
    }

    if (hasCallback) {
      // Handle Node.js style async functions
      /**
       * @param {Error|null} err
       * @param {any} [res]
       */
      const cb = (err, res) => {
        if (err) {
          output.done(err);
          return;
        }
        output.sendDone(res);
      };
      values.push(cb);
      func(...values);
      return;
    }

    const res = func(...values);
    if (res && (typeof res === 'object') && (typeof res.then === 'function')) {
      // Result is a Promise, resolve and handle
      const resPromise = /** @type {Promise<any>} */ (res);
      resPromise.then(
        (val) => output.sendDone(val),
        (err) => output.done(err),
      );
      return;
    }
    output.sendDone(res);
  });
  return c;
}
