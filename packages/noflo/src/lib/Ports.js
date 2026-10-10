/* eslint-disable max-classes-per-file */
//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./Ports.d.ts" */

import { EventBase } from "./EventBase.js";
import InPort from "./InPort.js";
import OutPort from "./OutPort.js";

/**
 * @typedef {import("./BasePort.js").BaseOptions} PortOptions
 */

// NoFlo ports collections
//
// Ports collection classes for NoFlo components. These are
// used to hold a set of input or output ports of a component.
class Ports extends EventBase {
  /**
   * Create a ports collection. Port definitions are given as a map of port
   * name to port instance or port options; entries are added in order.
   *
   * @param {Object<string, import("./BasePort.js").default|PortOptions>} ports
   * @param {typeof import("./BasePort.js").default} model
   */
  constructor(ports, model) {
    super();
    /** @type {typeof import("./BasePort.js").default} Port class instantiated for entries added to this collection */
    this.model = model;
    /** @type {Object<string, import("./BasePort.js").default>} The ports in this collection, keyed by port name */
    this.ports = {};
    if (!ports) {
      return;
    }
    Object.keys(ports).forEach((name) => {
      const options = ports[name];
      this.add(name, options);
    });
  }

  /**
   * Add a port to the collection, replacing any previous port with the same
   * name. The port is also exposed as a property of the collection under its
   * name. Port names must be lowercase alphanumeric characters, underscores,
   * dots, or slashes; `add` and `remove` are reserved.
   *
   * @param {string} name
   * @param {Object|import("./BasePort.js").default|PortOptions} [options]
   */
  add(name, options = {}) {
    if (name === "add" || name === "remove") {
      throw new Error("Add and remove are restricted port names");
    }

    /* eslint-disable no-useless-escape */
    if (!name.match(/^[a-z0-9_./]+$/)) {
      throw new Error(
        `Port names can only contain lowercase alphanumeric characters and underscores. '${name}' not allowed`,
      );
    }

    // Remove previous implementation
    if (this.ports[name]) {
      this.remove(name);
    }

    const maybePort = /** @type {import("./BasePort.js").default} */ (options);
    if (typeof maybePort === "object" && maybePort.canAttach) {
      this.ports[name] = maybePort;
    } else {
      const Model = this.model;
      this.ports[name] = new Model(options);
    }

    this[name] = this.ports[name];

    this.dispatchLifecycleEvent("add", name);

    return this; // chainable
  }

  /**
   * Remove a port from the collection.
   *
   * @param {string} name
   */
  remove(name) {
    if (!this.ports[name]) {
      throw new Error(`Port ${name} not defined`);
    }
    delete this.ports[name];
    delete this[name];
    this.dispatchLifecycleEvent("remove", name);

    return this; // chainable
  }
}

/**
 * @typedef {{ [key: string]: InPort|import("./InPort.js").PortOptions }} InPortsOptions
 */
/**
 * An input-ports collection: holds the {@link InPort} instances of a
 * component and exposes them both via the `ports` map and as named
 * properties.
 */
export class InPorts extends Ports {
  /**
   * Create an input-ports collection holding {@link InPort} instances.
   *
   * @param {InPortsOptions} [ports]
   */
  constructor(ports = {}) {
    super(ports, InPort);
    const basePorts = this.ports;
    this.ports = /** @type {Object<string, InPort>} */ (basePorts);
  }
}

/**
 * @typedef {{ [key: string]: OutPort|import("./OutPort.js").PortOptions }} OutPortsOptions
 */
/**
 * An output-ports collection: holds the {@link OutPort} instances of a
 * component and exposes them both via the `ports` map and as named
 * properties.
 */
export class OutPorts extends Ports {
  /**
   * Create an output-ports collection holding {@link OutPort} instances.
   *
   * @param {OutPortsOptions} [ports]
   */
  constructor(ports = {}) {
    super(ports, OutPort);
    const basePorts = this.ports;
    this.ports = /** @type {Object<string, OutPort>} */ (basePorts);
  }

  /**
   * Connect an output port, either to a specific attached socket or to all
   * of them. See {@link OutPort#connect}.
   *
   * @param {string} name
   * @param {number|null} [socketId]
   */
  connect(name, socketId) {
    const port = /** @type {OutPort} */ (this.ports[name]);
    if (!port) {
      throw new Error(`Port ${name} not available`);
    }
    port.connect(socketId);
  }

  /**
   * Send a data packet to an output port. See {@link OutPort#send}.
   *
   * @param {string} name
   * @param {any} data
   * @param {number|null} [socketId]
   */
  send(name, data, socketId) {
    const port = /** @type {OutPort} */ (this.ports[name]);
    if (!port) {
      throw new Error(`Port ${name} not available`);
    }
    port.send(data, socketId);
  }

  /**
   * Disconnect an output port. See {@link OutPort#disconnect}.
   *
   * @param {string} name
   * @param {number|null} [socketId]
   */
  disconnect(name, socketId) {
    const port = /** @type {OutPort} */ (this.ports[name]);
    if (!port) {
      throw new Error(`Port ${name} not available`);
    }
    port.disconnect(socketId);
  }
}

/**
 * Normalize a port name: returns an object with `name` and, for addressable
 * ports written as `portname[index]`, the string `index`.
 *
 * @param {string} name
 * @returns {{ name: string, index?: string }}
 */
export function normalizePortName(name) {
  const port = { name };
  // Regular port
  if (name.indexOf("[") === -1) {
    return port;
  }
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
