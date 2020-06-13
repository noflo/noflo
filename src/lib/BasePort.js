/* eslint-disable
    class-methods-use-this,
    consistent-return,
    no-continue,
    no-param-reassign,
    no-plusplus,
    no-return-assign,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
const { EventEmitter } = require('events');

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

class BasePort extends EventEmitter {
  constructor(options) {
    super();
    // Options holds all options of the current port
    this.options = this.handleOptions(options);
    // Sockets list contains all currently attached
    // connections to the port
    this.sockets = [];
    // Name of the graph node this port is in
    this.node = null;
    // Name of the port
    this.name = null;
  }

  handleOptions(options) {
    if (!options) { options = {}; }
    // We default to the `all` type if no explicit datatype
    // was provided
    if (!options.datatype) { options.datatype = 'all'; }
    // By default ports are not required for graph execution
    if (options.required === undefined) { options.required = false; }

    // Normalize the legacy `integer` type to `int`.
    if (options.datatype === 'integer') { options.datatype = 'int'; }

    // Ensure datatype defined for the port is valid
    if (validTypes.indexOf(options.datatype) === -1) {
      throw new Error(`Invalid port datatype '${options.datatype}' specified, valid are ${validTypes.join(', ')}`);
    }

    // Ensure schema defined for the port is valid
    if (options.type && !options.schema) {
      options.schema = options.type;
      delete options.type;
    }
    if (options.schema && (options.schema.indexOf('/') === -1)) {
      throw new Error(`Invalid port schema '${options.schema}' specified. Should be URL or MIME type`);
    }

    return options;
  }

  getId() {
    if (!this.node || !this.name) {
      return 'Port';
    }
    return `${this.node} ${this.name.toUpperCase()}`;
  }

  getDataType() { return this.options.datatype; }

  getSchema() { return this.options.schema || null; }

  getDescription() { return this.options.description; }

  attach(socket, index = null) {
    if (!this.isAddressable() || (index === null)) {
      index = this.sockets.length;
    }
    this.sockets[index] = socket;
    this.attachSocket(socket, index);
    if (this.isAddressable()) {
      this.emit('attach', socket, index);
      return;
    }
    this.emit('attach', socket);
  }

  attachSocket() { }

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

  isAttached(socketId = null) {
    if (this.isAddressable() && (socketId !== null)) {
      if (this.sockets[socketId]) { return true; }
      return false;
    }
    if (this.sockets.length) { return true; }
    return false;
  }

  listAttached() {
    const attached = [];
    for (let idx = 0; idx < this.sockets.length; idx++) {
      const socket = this.sockets[idx];
      if (!socket) { continue; }
      attached.push(idx);
    }
    return attached;
  }

  isConnected(socketId = null) {
    if (this.isAddressable()) {
      if (socketId === null) { throw new Error(`${this.getId()}: Socket ID required`); }
      if (!this.sockets[socketId]) { throw new Error(`${this.getId()}: Socket ${socketId} not available`); }
      return this.sockets[socketId].isConnected();
    }

    let connected = false;
    this.sockets.forEach((socket) => {
      if (!socket) { return; }
      if (socket.isConnected()) {
        return connected = true;
      }
    });
    return connected;
  }

  canAttach() { return true; }
}

module.exports = BasePort;
