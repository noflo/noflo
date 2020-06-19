/* eslint-disable
    func-names,
    guard-for-in,
    max-classes-per-file,
    new-cap,
    no-multi-assign,
    no-restricted-syntax,
    no-shadow,
    no-unused-vars,
    no-useless-escape,
    prefer-destructuring,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
let InPorts; let
  OutPorts;
const { EventEmitter } = require('events');
const InPort = require('./InPort');
const OutPort = require('./OutPort');

// NoFlo ports collections
//
// Ports collection classes for NoFlo components. These are
// used to hold a set of input or output ports of a component.
class Ports extends EventEmitter {
  constructor(ports, model) {
    super();
    this.model = model;
    this.ports = {};
    if (!ports) { return; }
    for (const name in ports) {
      const options = ports[name];
      this.add(name, options);
    }
  }

  add(name, options, process) {
    if ((name === 'add') || (name === 'remove')) {
      throw new Error('Add and remove are restricted port names');
    }

    if (!name.match(/^[a-z0-9_\.\/]+$/)) {
      throw new Error(`Port names can only contain lowercase alphanumeric characters and underscores. '${name}' not allowed`);
    }

    // Remove previous implementation
    if (this.ports[name]) { this.remove(name); }

    if ((typeof options === 'object') && options.canAttach) {
      this.ports[name] = options;
    } else {
      this.ports[name] = new this.model(options, process);
    }

    this[name] = this.ports[name];

    this.emit('add', name);

    return this; // chainable
  }

  remove(name) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not defined`); }
    delete this.ports[name];
    delete this[name];
    this.emit('remove', name);

    return this; // chainable
  }
}

exports.InPorts = (InPorts = class InPorts extends Ports {
  constructor(ports) {
    super(ports, InPort);
  }

  on(name, event, callback) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    this.ports[name].on(event, callback);
  }

  once(name, event, callback) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    this.ports[name].once(event, callback);
  }
});

exports.OutPorts = (OutPorts = class OutPorts extends Ports {
  constructor(ports) {
    super(ports, OutPort);
  }

  connect(name, socketId) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    this.ports[name].connect(socketId);
  }

  beginGroup(name, group, socketId) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    this.ports[name].beginGroup(group, socketId);
  }

  send(name, data, socketId) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    this.ports[name].send(data, socketId);
  }

  endGroup(name, socketId) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    this.ports[name].endGroup(socketId);
  }

  disconnect(name, socketId) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    this.ports[name].disconnect(socketId);
  }
});

// Port name normalization:
// returns object containing keys name and index for ports names in
// format `portname` or `portname[index]`.
exports.normalizePortName = function (name) {
  const port = { name };
  // Regular port
  if (name.indexOf('[') === -1) { return port; }
  // Addressable port with index
  const matched = name.match(/(.*)\[([0-9]+)\]/);
  if (!(matched != null ? matched.length : undefined)) { return name; }
  port.name = matched[1];
  port.index = matched[2];
  return port;
};
