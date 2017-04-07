'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.fail = fail;
exports.failed = failed;
exports.fork = fork;
exports.merge = merge;

var _noflo = require('noflo');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var validators = {
  def: function def(val) {
    return val !== undefined;
  },
  set: function set(val) {
    return val !== undefined && val !== null;
  },
  ok: function ok(val) {
    return !!val;
  },
  num: function num(val) {
    return typeof val === 'number';
  },
  str: function str(val) {
    return typeof val === 'string';
  },
  obj: function obj(val) {
    return (typeof val === 'undefined' ? 'undefined' : _typeof(val)) === 'object' && val !== null;
  },
  func: function func(val) {
    return typeof val === 'function';
  },
  '>0': function _(val) {
    return val > 0;
  }
};

var errorMessages = {
  def: function def(key) {
    return key + ' is undefined';
  },
  set: function set(key) {
    return key + ' is not set';
  },
  ok: function ok(key) {
    return key + ' is false or empty';
  },
  num: function num(key, val) {
    return key + ' is not a number: ' + val;
  },
  str: function str(key, val) {
    return key + ' is not a string: ' + val;
  },
  obj: function obj(key, val) {
    return key + ' is not an object: ' + val;
  },
  func: function func(key, val) {
    return key + ' is not a function: ' + val;
  },
  '>0': function _(key, val) {
    return key + ' is not positive: ' + val;
  }
};

function fail(msg, err) {
  if (!Array.isArray(msg.errors)) {
    throw new Error('Message.errors is not an array');
  }
  var errs = Array.isArray(err) ? err : [err];
  errs.forEach(function (e) {
    return msg.errors.push(e);
  });
  return msg;
}

function failed(msg) {
  return msg.errors && Array.isArray(msg.errors) > 0 && msg.errors.length > 0;
}

// Converts shortened ports definition to standard NoFlo ports definition
function normalizePorts(options, direction) {
  var key = direction + 'Ports';
  var result = options;
  if (key in options) {
    if (Array.isArray(options[key])) {
      // Convert array to all-typed ports
      var tmp = {};
      options[key].forEach(function (name) {
        tmp[name] = { datatype: 'all' };
      });
      result[key] = tmp;
    } // else is normal NoFlo ports object
  } else {
    // Default to single port
    var dir = direction === 'out' ? 'Outgoing' : 'Incoming';
    result[key] = _defineProperty({}, direction, {
      datatype: 'object',
      description: dir + ' message',
      required: true
    });
  }
  return result;
}

function normalizeValidators(rules) {
  if (Array.isArray(rules)) {
    // Normalize array to hashmap
    var res = {};
    rules.forEach(function (f) {
      res[f] = 'ok';
    });
    return res;
  }
  return rules;
}

var Component = function (_NoFloComponent) {
  _inherits(Component, _NoFloComponent);

  function Component() {
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    _classCallCheck(this, Component);

    var opts = normalizePorts(options, 'in');
    opts = normalizePorts(opts, 'out');

    var _this = _possibleConstructorReturn(this, (Component.__proto__ || Object.getPrototypeOf(Component)).call(this, opts));

    if (options.validates) {
      _this.validates = normalizeValidators(options.validates);
    }
    if (typeof _this.relay === 'function') {
      _this.process(function (input, output) {
        if (!input.hasData('in')) {
          return;
        }
        var msg = input.getData('in');
        if (!_this.validate(msg)) {
          output.sendDone(msg);
          return;
        }
        _this.relay(msg, output);
      });
    }
    if (typeof _this.handle === 'function') {
      _this.process(_this.handle);
    }
    return _this;
  }

  _createClass(Component, [{
    key: 'checkFields',
    value: function checkFields(msg, rules) {
      var errors = [];
      function checkField(obj, objPath, path, validator) {
        if (!obj || path.length <= 0) {
          return;
        }
        var key = path.shift();
        var v = path.length === 0 ? validator : 'obj';
        if (!validators[v](obj[key])) {
          errors.push(new Error(errorMessages[v](objPath + '.' + key, obj[key])));
          return;
        }
        if (path.length > 0) {
          checkField(obj[key], objPath + '.' + key, path, validator);
        }
      }

      Object.keys(rules).forEach(function (f) {
        var path = f.indexOf('.') > 0 ? f.split('.') : [f];
        var v = rules[f];
        if (!(v in validators)) {
          v = 'ok';
        }
        checkField(msg, 'msg', path, v);
      });
      return errors;
    }
  }, {
    key: 'validate',
    value: function validate(msg) {
      var rules = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.validates;

      if (failed(msg)) {
        return false;
      }
      if (rules && (typeof rules === 'undefined' ? 'undefined' : _typeof(rules)) === 'object') {
        rules = normalizeValidators(rules);
        var errs = this.checkFields(msg, rules);
        if (errs.length > 0) {
          fail(msg, errs);
          return false;
        }
      }
      return true;
    }
  }]);

  return Component;
}(_noflo.Component);

exports.default = Component;
function fork(msg) {
  var excludeKeys = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
  var cloneKeys = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];

  var newMsg = {};
  Object.keys(msg).forEach(function (key) {
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

function merge(base, extra) {
  var combined = base;
  var baseKeys = Object.keys(base);
  Object.keys(extra).forEach(function (key) {
    if ((baseKeys.indexOf(key) === -1 || base[key] === undefined) && extra[key] !== undefined) {
      combined[key] = extra[key];
    }
  });
  return combined;
}
