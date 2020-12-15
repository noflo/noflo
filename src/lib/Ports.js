/* eslint-disable max-classes-per-file */
//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
import { EventEmitter } from 'events';
import InPort from './InPort';
import OutPort from './OutPort';

/**
 * @typedef {import("./BasePort").BaseOptions} PortOptions
 */

// NoFlo ports collections
//
// Ports collection classes for NoFlo components. These are
// used to hold a set of input or output ports of a component.
class Ports extends EventEmitter {
  /**
   * @param {Object<string, import("./BasePort").default|PortOptions>} ports
   * @param {typeof import("./BasePort").default} model
   */
  constructor(ports, model) {
    super();
    this.model = model;
    /** @type {Object<string, import("./BasePort").default>} */
    this.ports = {};
    if (!ports) { return; }
    Object.keys(ports).forEach((name) => {
      const options = ports[name];
      this.add(name, options);
    });
  }

  /**
   * @param {string} name
   * @param {Object|import("./BasePort").default|PortOptions} [options]
   */
  add(name, options = {}) {
    if ((name === 'add') || (name === 'remove')) {
      throw new Error('Add and remove are restricted port names');
    }

    /* eslint-disable no-useless-escape */
    if (!name.match(/^[a-z0-9_\.\/]+$/)) {
      throw new Error(`Port names can only contain lowercase alphanumeric characters and underscores. '${name}' not allowed`);
    }

    // Remove previous implementation
    if (this.ports[name]) { this.remove(name); }

    const maybePort = /** @type {import("./BasePort").default} */ (options);
    if ((typeof maybePort === 'object') && maybePort.canAttach) {
      this.ports[name] = maybePort;
    } else {
      const Model = this.model;
      this.ports[name] = new Model(options);
    }

    this[name] = this.ports[name];

    this.emit('add', name);

    return this; // chainable
  }

  /**
   * @param {string} name
   */
  remove(name) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not defined`); }
    delete this.ports[name];
    delete this[name];
    this.emit('remove', name);

    return this; // chainable
  }
}

/**
 * @typedef {{ [key: string]: InPort|import("./InPort").PortOptions }} InPortsOptions
 */
export class InPorts extends Ports {
  /**
   * @param {InPortsOptions} [ports]
   */
  constructor(ports = {}) {
    super(ports, InPort);
    const basePorts = this.ports;
    this.ports = /** @type {Object<string, InPort>} */ (basePorts);
  }
}

/**
 * @typedef {{ [key: string]: OutPort|import("./OutPort").PortOptions }} OutPortsOptions
 */
export class OutPorts extends Ports {
  /**
   * @param {OutPortsOptions} [ports]
   */
  constructor(ports = {}) {
    super(ports, OutPort);
    const basePorts = this.ports;
    this.ports = /** @type {Object<string, OutPort>} */ (basePorts);
  }

  connect(name, socketId) {
    const port = /** @type {OutPort} */ (this.ports[name]);
    if (!port) { throw new Error(`Port ${name} not available`); }
    port.connect(socketId);
  }

  beginGroup(name, group, socketId) {
    const port = /** @type {OutPort} */ (this.ports[name]);
    if (!port) { throw new Error(`Port ${name} not available`); }
    port.beginGroup(group, socketId);
  }

  send(name, data, socketId) {
    const port = /** @type {OutPort} */ (this.ports[name]);
    if (!port) { throw new Error(`Port ${name} not available`); }
    port.send(data, socketId);
  }

  endGroup(name, socketId) {
    const port = /** @type {OutPort} */ (this.ports[name]);
    if (!port) { throw new Error(`Port ${name} not available`); }
    port.endGroup(socketId);
  }

  disconnect(name, socketId) {
    const port = /** @type {OutPort} */ (this.ports[name]);
    if (!port) { throw new Error(`Port ${name} not available`); }
    port.disconnect(socketId);
  }
}

// Port name normalization:
// returns object containing keys name and index for ports names in
// format `portname` or `portname[index]`.
/**
 * @param {string} name
 * @returns {{ name: string, index?: string }}
 */
export function normalizePortName(name) {
  const port = { name };
  // Regular port
  if (name.indexOf('[') === -1) { return port; }
  // Addressable port with index
  const matched = name.match(/(.*)\[([0-9]+)\]/);
  if (!matched || matched.length < 3) {
    return port;
  }
  return {
    name: matched[1],
    index: matched[2],
  };
}
