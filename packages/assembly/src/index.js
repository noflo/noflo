import { Component as NoFloComponent } from 'noflo';

/**
 * @typedef {{ errors: Error[], [key: string]: any }} AssemblyMessage
 */
/**
 * @typedef {{ [key: string]: string}} AssemblyValidators
 */
/**
 * @typedef {{ [key: string]: (val: any) => boolean}} AssemblyValidatorFunctions
 */
/**
 * @typedef {{ [key: string]: (key: string, val?: any) => string}} AssemblyErrorMessages
 */
/**
 * @callback RelayFunction
 * @param {AssemblyMessage} msg
 * @param {import("noflo/lib/ProcessOutput").default} output
 */

/** @type {AssemblyValidatorFunctions} */
const validators = {
  def: (val) => val !== undefined,
  set: (val) => (val !== undefined) && (val !== null),
  ok: (val) => !!val,
  num: (val) => typeof val === 'number',
  str: (val) => typeof val === 'string',
  obj: (val) => (typeof val === 'object') && (val !== null),
  func: (val) => typeof val === 'function',
  '>0': (val) => val > 0,
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
  '>0': (key, val) => `${key} is not positive: ${val}`,
};

/**
 * @param {AssemblyMessage} msg
 * @param {Error|Error[]} err
 * @returns {AssemblyMessage}
 */
export function fail(msg, err) {
  if (!Array.isArray(msg.errors)) {
    throw new Error('Message.errors is not an array');
  }
  const errs = Array.isArray(err) ? err : [err];
  errs.forEach((e) => msg.errors.push(e));
  return msg;
}

/**
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
        tmp[name] = { datatype: 'all' };
      });
      result[key] = tmp;
    } // else is normal NoFlo ports object
  } else {
    // Default to single port
    const dir = direction === 'out' ? 'Outgoing' : 'Incoming';
    result[key] = {
      [direction]: {
        datatype: 'object',
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
      res[f] = 'ok';
    });
    return res;
  }
  return rules;
}

export class Component extends NoFloComponent {
  /**
   * @param {Object} [options]
   * @param {AssemblyValidators|Array<string>} [options.validates]
   */
  constructor(options = {}) {
    let opts = normalizePorts(options, 'in');
    opts = normalizePorts(opts, 'out');
    super(opts);
    /** @type {RelayFunction|null} */
    this.relay = this.relay || null;
    if (options.validates) {
      this.validates = normalizeValidators(options.validates);
    }

    if (typeof this.relay === 'function') {
      const func = /** @type {RelayFunction} */ (this.relay);
      this.process((input, output) => {
        if (!input.hasData('in')) { return; }
        const msg = input.getData('in');
        if (!this.validate(msg)) {
          output.sendDone(msg);
          return;
        }
        func(msg, output);
      });
    }
    if (typeof this.handle === 'function') {
      this.process(this.handle);
    }
  }

  /**
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
      if (!obj || (path.length <= 0)) { return; }
      const key = /** @type {string} */ (path.shift());
      const v = path.length === 0 ? validator : 'obj';
      if (!validators[v](obj[key])) {
        errors.push(new Error(errorMessages[v](`${objPath}.${key}`, obj[key])));
        return;
      }
      if (path.length > 0) {
        checkField(obj[key], `${objPath}.${key}`, path, validator);
      }
    }

    Object.keys(rules).forEach((f) => {
      const path = f.indexOf('.') > 0 ? f.split('.') : [f];
      let v = rules[f];
      if (!(v in validators)) { v = 'ok'; }
      checkField(msg, 'msg', path, v);
    });
    return errors;
  }

  /**
   * @param {AssemblyMessage} msg
   * @param {AssemblyValidators|Array<string>} [rules]
   */
  validate(msg, rules = this.validates) {
    if (failed(msg)) {
      return false;
    }
    if (rules && typeof rules === 'object') {
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
 * @param {AssemblyMessage} msg
 * @param {Array<string>} [excludeKeys]
 * @param {Array<string>} [cloneKeys]
 * @returns {AssemblyMessage}
 */
export function fork(msg, excludeKeys = [], cloneKeys = []) {
  /** @type {AssemblyMessage} */
  const newMsg = {
    errors: cloneKeys.includes('error') ? msg.errors.slice(0) : msg.errors,
  };
  Object.keys(msg).forEach((key) => {
    if (key === 'errors') { return; }
    if (excludeKeys.includes(key)) { return; }
    if (cloneKeys.includes(key)) {
      newMsg[key] = JSON.parse(JSON.stringify(msg[key]));
    } else {
      newMsg[key] = msg[key];
    }
  });
  return newMsg;
}

/**
 * @param {AssemblyMessage} base
 * @param {Object<string, any>} extra
 * @returns {AssemblyMessage}
 */
export function merge(base, extra) {
  const combined = base;
  const baseKeys = Object.keys(base);
  Object.keys(extra).forEach((key) => {
    if ((baseKeys.indexOf(key) === -1 || base[key] === undefined) && extra[key] !== undefined) {
      combined[key] = extra[key];
    }
  });
  return combined;
}

export default Component;
