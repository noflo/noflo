const NoFloComponent = require('noflo').Component;

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

function fail(msg, err) {
  if (!Array.isArray(msg.errors)) {
    throw new Error('Message.errors is not an array');
  }
  const errs = Array.isArray(err) ? err : [err];
  errs.forEach((e) => msg.errors.push(e));
  return msg;
}

function failed(msg) {
  return msg.errors && Array.isArray(msg.errors) > 0 && msg.errors.length > 0;
}

// Converts shortened ports definition to standard NoFlo ports definition
function normalizePorts(options, direction) {
  const key = `${direction}Ports`;
  const result = options;
  if (key in options) {
    if (Array.isArray(options[key])) {
      // Convert array to all-typed ports
      const tmp = {};
      options[key].forEach((name) => {
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

function normalizeValidators(rules) {
  if (Array.isArray(rules)) {
    // Normalize array to hashmap
    const res = {};
    rules.forEach((f) => {
      res[f] = 'ok';
    });
    return res;
  }
  return rules;
}

class Component extends NoFloComponent {
  constructor(options = {}) {
    let opts = normalizePorts(options, 'in');
    opts = normalizePorts(opts, 'out');
    super(opts);
    if (options.validates) {
      this.validates = normalizeValidators(options.validates);
    }
    if (typeof this.relay === 'function') {
      this.process((input, output) => {
        if (!input.hasData('in')) { return; }
        const msg = input.getData('in');
        if (!this.validate(msg)) {
          output.sendDone(msg);
          return;
        }
        this.relay(msg, output);
      });
    }
    if (typeof this.handle === 'function') {
      this.process(this.handle);
    }
  }

  checkFields(msg, rules) {
    const errors = [];
    function checkField(obj, objPath, path, validator) {
      if (!obj || (path.length <= 0)) { return; }
      const key = path.shift();
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

function fork(msg, excludeKeys = [], cloneKeys = []) {
  const newMsg = {};
  Object.keys(msg).forEach((key) => {
    if (excludeKeys.includes(key)) { return; }
    if (cloneKeys.includes(key)) {
      newMsg[key] = JSON.parse(JSON.stringify(msg[key]));
    } else {
      newMsg[key] = msg[key];
    }
  });
  return newMsg;
}

function merge(base, extra) {
  const combined = base;
  const baseKeys = Object.keys(base);
  Object.keys(extra).forEach((key) => {
    if ((baseKeys.indexOf(key) === -1 || base[key] === undefined) && extra[key] !== undefined) {
      combined[key] = extra[key];
    }
  });
  return combined;
}

module.exports = Component;
module.exports.default = Component;
module.exports.fail = fail;
module.exports.failed = failed;
module.exports.fork = fork;
module.exports.merge = merge;
