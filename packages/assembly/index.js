import noflo from 'noflo';

const validators = {
  def: val => val !== undefined,
  set: val => (val !== undefined) && (val !== null),
  ok: val => !!val,
  num: val => typeof val === 'number',
  str: val => typeof val === 'string',
  obj: val => (typeof val === 'object') && (val !== null),
  func: val => typeof val === 'function',
  '>0': val => val > 0,
};

const errorMessages = {
  def: key => `${key} is undefined`,
  set: key => `${key} is not set`,
  ok: key => `${key} is false or empty`,
  num: (key, val) => `${key} is not a number: ${val}`,
  str: (key, val) => `${key} is not a string: ${val}`,
  obj: (key, val) => `${key} is not an object: ${val}`,
  func: (key, val) => `${key} is not a function: ${val}`,
  '>0': (key, val) => `${key} is not positive: ${val}`,
};

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

export const Component = class Component extends noflo.Component {
  constructor(options = {}) {
    let opts = normalizePorts(options, 'in');
    opts = normalizePorts(opts, 'out');
    super(opts);
    if (options.validates) {
      if (Array.isArray(options.validates)) {
        // Normalize array to hashmap
        this.validates = {};
        options.validates.forEach((f) => {
          this.validates[f] = 'ok';
        });
      } else {
        this.validates = options.validates;
      }
    }
    if (typeof this.relay === 'function') {
      this.process(function process(input, output) {
        if (input.ip.type !== 'data') { return; }
        const msg = input.getData('in');
        if (msg.errors && msg.errors.length > 0) {
          output.sendDone(msg);
          return;
        }
        if (this.validates) {
          const errs = this.validate(msg, this.validates);
          if (errs.length > 0) {
            output.sendDone(exports.fail(msg, errs));
            return;
          }
        }
        this.relay(msg, output);
      });
    }
    if (typeof this.handle === 'function') {
      this.process(this.handle);
    }
  }

  validate(msg, fields = this.validates) {
    if ((typeof msg !== 'object') || (typeof fields !== 'object')) { return []; }
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

    Object.keys(fields).forEach((f) => {
      const path = f.indexOf('.') > 0 ? f.split('.') : [f];
      let v = fields[f];
      if (!(v in validators)) { v = 'ok'; }
      checkField(msg, 'msg', path, v);
    });
    return errors;
  }
};

export function fail(msg, err) {
  if (!Array.isArray(msg.errors)) {
    throw new Error('Message.errors is not an array');
  }
  const errs = Array.isArray(err) ? err : [err];
  errs.forEach(e => msg.errors.push(e));
  return msg;
}

export function failed(msg) {
  return msg.errors && Array.isArray(msg.errors) > 0 && msg.errors.length > 0;
}

export function fork(msg, excludeKeys = [], cloneKeys = []) {
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
