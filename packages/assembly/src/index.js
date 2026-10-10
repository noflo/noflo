/**
 * @noflo/assembly - Message relay conventions for NoFlo
 * (c) 2021-2026 Henri Bergius
 * (c) 2017-2021 Vladimir Sibirov
 * SPDX-License-Identifier: MIT
 *
 * Assembly Line: a shared message envelope (`msg.errors` for error
 * accumulation), validation helpers, and a `Component` base class where
 * components either declare a `relay(msg, output)` hook for single-input
 * processing or a `processMessage(input, output)` hook for multi-port ones.
 *
 * @module @noflo/assembly
 */

/* @ts-self-types="./index.d.ts" */

import { Component as NoFloComponent } from "@noflo/noflo";

/**
 * A message travelling through an assembly: a free-form payload where the
 * `errors` array accumulates errors from every component that touched it.
 *
 * @typedef {{ errors: Error[], [key: string]: any }} AssemblyMessage
 */
/**
 * Validation rules keyed by message path (`field` or `parent.field`), with
 * validator names as values.
 *
 * @typedef {{ [key: string]: string}} AssemblyValidators
 */
/**
 * The built-in validator functions, keyed by the names usable in
 * {@link AssemblyValidators}.
 *
 * @typedef {{ [key: string]: (val: any) => boolean}} AssemblyValidatorFunctions
 */
/**
 * Error message templates for the built-in validators, keyed by the same
 * names.
 *
 * @typedef {{ [key: string]: (key: string, val?: any) => string}} AssemblyErrorMessages
 */
/**
 * The single-input processing hook an assembly component can declare
 * instead of overriding the full Process API handler: receives the validated
 * message and the output sender.
 *
 * @callback RelayFunction
 * @param {AssemblyMessage} msg
 * @param {{ sendDone(map: Record<string, unknown>): void }} output
 */

/** @type {AssemblyValidatorFunctions} */
const validators = {
  def: (val) => val !== undefined,
  set: (val) => val !== undefined && val !== null,
  ok: (val) => !!val,
  num: (val) => typeof val === "number",
  str: (val) => typeof val === "string",
  obj: (val) => typeof val === "object" && val !== null,
  func: (val) => typeof val === "function",
  ">0": (val) => val > 0,
};

/** @type {AssemblyErrorMessages} */
const errorMessages = {
  def: (key) => `${key} is undefined`,
  set: (key) => `${key} is not set`,
  ok: (key) => `${key} is false or empty`,
  num: (key, val) => `${key} is not a number: ${val}`,
  str: (key, val) => `${key} is not a string: ${val}`,
  obj: (key, val) => `${key} is not an object: ${val}`,
  func: (key, val) => `${key} is not a function: ${val}`,
  ">0": (key, val) => `${key} is not positive: ${val}`,
};

/**
 * Options for constructing an assembly component.
 *
 * @typedef {Object<string, any>} AssemblyComponentOptions
 * @property {string} [description]
 * @property {string} [icon]
 * @property {Object<string, any>} [inPorts]
 * @property {Object<string, any>} [outPorts]
 * @property {AssemblyValidators|Array<string>} [validates]
 */

/**
 * Append an error (or several) to a message's `errors` array.
 *
 * @param {AssemblyMessage} msg
 * @param {Error|Error[]} err
 * @returns {AssemblyMessage}
 */
export function fail(msg, err) {
  if (!Array.isArray(msg.errors)) {
    throw new Error("Message.errors is not an array");
  }
  const errs = Array.isArray(err) ? err : [err];
  for (const e of errs) {
    msg.errors.push(e);
  }
  return msg;
}

/**
 * Check whether a message has accumulated any errors.
 *
 * @param {AssemblyMessage} msg
 * @returns {boolean}
 */
export function failed(msg) {
  return msg.errors && Array.isArray(msg.errors) && msg.errors.length > 0;
}

/**
 * Converts shortened ports definition to standard NoFlo ports definition
 * @param {Object<key, any>} options
 * @param {string} direction
 * @returns {Object<key, any>}
 */
function normalizePorts(options, direction) {
  const key = `${direction}Ports`;
  const result = options;
  if (key in options) {
    if (Array.isArray(options[key])) {
      // Convert array to all-typed ports
      /** @type {Object<key, any>} */
      const tmp = {};
      const portsArray = /** @type {Array<string>} */ (options[key]);
      portsArray.forEach((name) => {
        tmp[name] = { datatype: "all" };
      });
      result[key] = tmp;
    } // else is normal NoFlo ports object
  } else {
    // Default to single port
    const dir = direction === "out" ? "Outgoing" : "Incoming";
    result[key] = {
      [direction]: {
        datatype: "object",
        description: `${dir} message`,
        required: true,
      },
    };
  }
  return result;
}

/**
 * @param {AssemblyValidators|Array<string>} rules
 * @returns {AssemblyValidators}
 */
function normalizeValidators(rules) {
  if (Array.isArray(rules)) {
    // Normalize array to hashmap
    /** @type {AssemblyValidators} */
    const res = {};
    rules.forEach((f) => {
      res[f] = "ok";
    });
    return res;
  }
  return rules;
}

/**
 * An assembly component: a NoFlo component with a shared message envelope
 * (`msg.errors`), declarative field validation, and support for the
 * `relay(msg, output)` single-input hook and the `processMessage(input,
 * output)` multi-port hook.
 */
export class Component extends NoFloComponent {
  /**
   * Create the component. Port definitions may be given as arrays of names
   * (typed `all`), full NoFlo port definitions, or omitted for a single
   * default message port. Validation rules from `validates` apply to the
   * `relay` hook.
   *
   * @param {AssemblyComponentOptions} [options]
   */
  constructor(options = {}) {
    let opts = normalizePorts(options, "in");
    opts = normalizePorts(opts, "out");
    super(opts);
    if (options.validates) {
      /**
       * Validation rules applied to the message before the relay hook runs.
       *
       * @type {AssemblyValidators|undefined}
       */
      this.validates = normalizeValidators(options.validates);
    }

    const relay = /** @type {RelayFunction|undefined} */ (
      /** @type {unknown} */ (this.relay)
    );
    if (typeof relay === "function") {
      const func = relay.bind(this);
      this.process((input, output) => {
        if (!input.hasData("in")) {
          return;
        }
        const msg = input.getData("in");
        if (!this.validate(msg)) {
          output.sendDone(msg);
          return;
        }
        func(msg, output);
      });
    }
    const processMessage =
      /** @type {undefined | ((input: any, output: any) => any)} */ (
        /** @type {unknown} */ (this.processMessage)
      );
    if (typeof processMessage === "function") {
      this.process(processMessage);
    }
  }

  /**
   * Check the fields of a message against validation rules, collecting an
   * Error for every violated rule. Paths may be dotted (`parent.field`).
   *
   * @param {AssemblyMessage} msg
   * @param {AssemblyValidators} rules
   * @returns {Array<Error>}
   */
  checkFields(msg, rules) {
    /** @type {Array<Error>} */
    const errors = [];
    /**
     * @param {AssemblyMessage|any} obj
     * @param {string} objPath
     * @param {string[]} path
     * @param {string} validator
     */
    function checkField(obj, objPath, path, validator) {
      if (!obj || path.length <= 0) {
        return;
      }
      const key = /** @type {string} */ (path.shift());
      const v = path.length === 0 ? validator : "obj";
      if (!validators[v](obj[key])) {
        errors.push(new Error(errorMessages[v](`${objPath}.${key}`, obj[key])));
        return;
      }
      if (path.length > 0) {
        checkField(obj[key], `${objPath}.${key}`, path, validator);
      }
    }

    Object.keys(rules).forEach((f) => {
      const path = f.indexOf(".") > 0 ? f.split(".") : [f];
      let v = rules[f];
      if (!(v in validators)) {
        v = "ok";
      }
      checkField(msg, "msg", path, v);
    });
    return errors;
  }

  /**
   * Validate a message against the given rules (defaulting to the rules
   * given at construction). Violations are appended to the message's
   * `errors` array; a message that already carries errors fails without
   * re-validation.
   *
   * @param {AssemblyMessage} msg
   * @param {AssemblyValidators|Array<string>} [rules]
   */
  validate(msg, rules = this.validates) {
    if (failed(msg)) {
      return false;
    }
    if (rules && typeof rules === "object") {
      rules = normalizeValidators(rules);
      const errs = this.checkFields(msg, rules);
      if (errs.length > 0) {
        fail(msg, errs);
        return false;
      }
    }
    return true;
  }
}

/**
 * Create a new message derived from `msg`. Keys in `excludeKeys` are
 * dropped; keys in `cloneKeys` are deep-copied instead of shared by
 * reference. The `errors` array is shared unless `error` is cloned.
 *
 * @param {AssemblyMessage} msg
 * @param {Array<string>} [excludeKeys]
 * @param {Array<string>} [cloneKeys]
 * @returns {AssemblyMessage}
 */
export function fork(msg, excludeKeys = [], cloneKeys = []) {
  /** @type {AssemblyMessage} */
  const newMsg = {
    errors: cloneKeys.includes("error") ? msg.errors.slice(0) : msg.errors,
  };
  Object.keys(msg).forEach((key) => {
    if (key === "errors") {
      return;
    }
    if (excludeKeys.includes(key)) {
      return;
    }
    if (cloneKeys.includes(key)) {
      newMsg[key] = JSON.parse(JSON.stringify(msg[key]));
    } else {
      newMsg[key] = msg[key];
    }
  });
  return newMsg;
}

/**
 * Merge the entries of `extra` into `base`, filling in only keys that are
 * missing or undefined in `base`. Returns the same `base` object, mutated.
 *
 * @param {AssemblyMessage} base
 * @param {Object<string, any>} extra
 * @returns {AssemblyMessage}
 */
export function merge(base, extra) {
  const combined = base;
  const baseKeys = Object.keys(base);
  Object.keys(extra).forEach((key) => {
    if (
      (baseKeys.indexOf(key) === -1 || base[key] === undefined) &&
      extra[key] !== undefined
    ) {
      combined[key] = extra[key];
    }
  });
  return combined;
}

export default Component;
