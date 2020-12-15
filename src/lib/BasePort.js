//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
import { EventEmitter } from 'events';

// ## NoFlo Port Base class
//
// Base port type used for options normalization. Both inports and outports extend this class.

// The list of valid datatypes for ports.
const validTypes = [
  'all',
  'string',
  'number',
  'int',
  'object',
  'array',
  'boolean',
  'color',
  'date',
  'bang',
  'function',
  'buffer',
  'stream',
];

/**
 * @typedef {Object} BaseOptions - Options for configuring all types of ports
 * @property {string} [description='']
 * @property {boolean} [addressable=false]
 * @property {boolean} [buffered=false]
 * @property {string} [datatype='all']
 * @property {string} [schema=null]
 * @property {string} [type=null]
 * @property {boolean} [required=false]
 * @property {boolean} [scoped=true]
 */

/**
 * @template {BaseOptions} BaseportOptions
 * @param {BaseportOptions} options
 * @return {BaseportOptions}
 */
function handleOptions(options) {
  // We default to the `all` type if no explicit datatype
  // was provided
  let datatype = options.datatype || 'all';
  // Normalize the legacy `integer` type to `int`.
  if (datatype === 'integer') { datatype = 'int'; }

  // By default ports are not required for graph execution
  const required = options.required || false;

  // Ensure datatype defined for the port is valid
  if (validTypes.indexOf(datatype) === -1) {
    throw new Error(`Invalid port datatype '${datatype}' specified, valid are ${validTypes.join(', ')}`);
  }

  // Ensure schema defined for the port is valid
  const schema = options.schema || options.type;

  if (schema && (schema.indexOf('/') === -1)) {
    throw new Error(`Invalid port schema '${schema}' specified. Should be URL or MIME type`);
  }

  // Scoping
  const scoped = (typeof options.scoped === 'boolean') ? options.scoped : true;

  // Description
  const description = options.description || '';

  /* eslint-disable prefer-object-spread */
  return Object.assign({}, options, {
    description,
    datatype,
    required,
    schema,
    scoped,
  });
}

export default class BasePort extends EventEmitter {
  /**
   * @param {BaseOptions} options
   */
  constructor(options) {
    super();
    // Options holds all options of the current port
    this.options = handleOptions(options);
    // Sockets list contains all currently attached
    // connections to the port
    /** @type {Array<import("./InternalSocket").InternalSocket|void>} */
    this.sockets = [];
    // Name of the graph node this port is in
    /** @type {string|null} */
    this.node = null;
    /** @type {import("./Component").Component|null} */
    this.nodeInstance = null;
    // Name of the port
    /** @type {string|null} */
    this.name = null;
  }

  getId() {
    if (!this.node || !this.name) {
      return 'Port';
    }
    return `${this.node} ${this.name.toUpperCase()}`;
  }

  /**
   * @returns {string}
   */
  getDataType() { return this.options.datatype || 'all'; }

  getSchema() { return this.options.schema || null; }

  getDescription() { return this.options.description; }

  /**
   * @param {import("./InternalSocket").InternalSocket} socket
   * @param {number|null} [index]
   */
  attach(socket, index = null) {
    let idx = /** @type {number} */ (index);
    if (!this.isAddressable() || (index === null)) {
      idx = this.sockets.length;
    }
    this.sockets[idx] = socket;
    this.attachSocket(socket, idx);
    if (this.isAddressable()) {
      this.emit('attach', socket, idx);
      return;
    }
    this.emit('attach', socket);
  }

  /**
   * @param {import("./InternalSocket").InternalSocket} socket
   * @param {number|null} [index]
   */
  attachSocket(socket, index = null) { } // eslint-disable-line class-methods-use-this,no-unused-vars,max-len

  /**
   * @param {import("./InternalSocket").InternalSocket} socket
   */
  detach(socket) {
    const index = this.sockets.indexOf(socket);
    if (index === -1) {
      return;
    }
    this.sockets[index] = undefined;
    if (this.isAddressable()) {
      this.emit('detach', socket, index);
      return;
    }
    this.emit('detach', socket);
  }

  isAddressable() {
    if (this.options.addressable) { return true; }
    return false;
  }

  isBuffered() {
    if (this.options.buffered) { return true; }
    return false;
  }

  isRequired() {
    if (this.options.required) { return true; }
    return false;
  }

  /**
   * @param {number|null} socketId
   * @returns {boolean}
   */
  isAttached(socketId = null) {
    if (this.isAddressable() && (socketId !== null)) {
      if (this.sockets[socketId]) { return true; }
      return false;
    }
    if (this.sockets.length) {
      return true;
    }
    return false;
  }

  listAttached() {
    const attached = [];
    for (let idx = 0; idx < this.sockets.length; idx += 1) {
      const socket = this.sockets[idx];
      if (socket) { attached.push(idx); }
    }
    return attached;
  }

  /**
   * @param {number|null} socketId
   * @returns {boolean}
   */
  isConnected(socketId = null) {
    if (this.isAddressable()) {
      if (socketId === null) {
        throw new Error(`${this.getId()}: Socket ID required`);
      }
      if (!this.sockets[socketId]) {
        throw new Error(`${this.getId()}: Socket ${socketId} not available`);
      }
      // eslint-disable-next-line max-len
      const socket = /** @type {import("./InternalSocket").InternalSocket} */ (this.sockets[socketId]);
      return socket.isConnected();
    }

    let connected = false;
    this.sockets.forEach((socket) => {
      if (!socket) { return; }
      if (socket.isConnected()) {
        connected = true;
      }
    });
    return connected;
  }

  /* eslint-disable class-methods-use-this */
  canAttach() { return true; }
}
