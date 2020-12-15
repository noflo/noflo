//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
import BasePort from './BasePort';

// ## NoFlo inport
//
// Input Port (inport) implementation for NoFlo components. These
// ports are the way a component receives Information Packets.
/**
 * @typedef InPortOptions
 * @property {any} [default]
 * @property {Array<any>} [values]
 * @property {boolean} [control]
 * @property {boolean} [triggering]
 */
/**
 * @callback HasValidationCallback
 * @param {import("./IP").default} ip
 * @returns {boolean}
 */
/**
 * @typedef {import("./BasePort").BaseOptions & InPortOptions} PortOptions
 */

export default class InPort extends BasePort {
  /**
   * @param {PortOptions} [options]
   */
  constructor(options = {}) {
    const opts = options;
    if (opts.control == null) { opts.control = false; }
    if (opts.scoped == null) { opts.scoped = true; }
    if (opts.triggering == null) { opts.triggering = true; }

    super(opts);

    const baseOptions = this.options;
    this.options = /** @type {PortOptions} */ (baseOptions);

    /** @type {import("./Component").Component|null} */
    this.nodeInstance = null;

    this.prepareBuffer();
  }

  /**
   * Assign a delegate for retrieving data should this inPort
   *
   * @param {import("./InternalSocket").InternalSocket} socket
   * @param {number|null} [localId]
   */
  attachSocket(socket, localId = null) {
    // have a default value.
    if (this.hasDefault()) {
      socket.setDataDelegate(() => this.options.default);
    }

    socket.on('connect', () => this.handleSocketEvent('connect', socket, localId));
    socket.on('begingroup', (group) => this.handleSocketEvent('begingroup', group, localId));
    socket.on('data', (data) => {
      this.validateData(data);
      return this.handleSocketEvent('data', data, localId);
    });
    socket.on('endgroup', (group) => this.handleSocketEvent('endgroup', group, localId));
    socket.on('disconnect', () => this.handleSocketEvent('disconnect', socket, localId));
    socket.on('ip', (ip) => this.handleIP(ip, localId));
  }

  /**
   * @param {import("./IP").default} packet
   * @param {number|null} [index]
   */
  handleIP(packet, index = null) {
    if (this.options.control && (packet.type !== 'data')) { return; }
    const ip = packet;
    ip.owner = this.nodeInstance;
    if (this.isAddressable()) {
      ip.index = index;
    }
    if (ip.datatype === 'all') {
      // Stamp non-specific IP objects with port datatype
      ip.datatype = this.getDataType();
    }
    if (this.getSchema() && !ip.schema) {
      // Stamp non-specific IP objects with port schema
      ip.schema = this.getSchema();
    }

    const buf = this.prepareBufferForIP(ip);
    buf.push(ip);
    if (this.options.control && (buf.length > 1)) { buf.shift(); }

    this.emit('ip', ip, index);
  }

  /**
   * @param {string} event
   * @param {any} payload
   * @param {number} [id]
   */
  handleSocketEvent(event, payload, id) {
    // Emit port event
    if (this.isAddressable()) {
      return this.emit(event, payload, id);
    }
    return this.emit(event, payload);
  }

  hasDefault() {
    return this.options.default !== undefined;
  }

  prepareBuffer() {
    if (this.isAddressable()) {
      if (this.options.scoped) {
        /** @type {Object<string,Object<number,Array<import("./IP").default>>>} */
        this.indexedScopedBuffer = {};
      }
      /** @type {Object<number,Array<import("./IP").default>>} */
      this.indexedIipBuffer = {};
      /** @type {Object<number,Array<import("./IP").default>>} */
      this.indexedBuffer = {};
      return;
    }
    if (this.options.scoped) {
      /** @type {Object<string,Array<import("./IP").default>>} */
      this.scopedBuffer = {};
    }
    /** @type {Array<import("./IP").default>} */
    this.iipBuffer = [];
    /** @type {Array<import("./IP").default>} */
    this.buffer = [];
  }

  /**
   * @param {import("./IP").default} ip
   * @returns {Array<import("./IP").default>}
   */
  prepareBufferForIP(ip) {
    if (this.isAddressable()) {
      if ((ip.scope != null) && this.options.scoped) {
        if (!(ip.scope in this.indexedScopedBuffer)) { this.indexedScopedBuffer[ip.scope] = []; }
        if (!(ip.index in this.indexedScopedBuffer[ip.scope])) {
          this.indexedScopedBuffer[ip.scope][ip.index] = [];
        }
        return this.indexedScopedBuffer[ip.scope][ip.index];
      }
      if (ip.initial) {
        if (!(ip.index in this.indexedIipBuffer)) { this.indexedIipBuffer[ip.index] = []; }
        return this.indexedIipBuffer[ip.index];
      }
      if (!(ip.index in this.indexedBuffer)) { this.indexedBuffer[ip.index] = []; }
      return this.indexedBuffer[ip.index];
    }
    if ((ip.scope != null) && this.options.scoped) {
      if (!(ip.scope in this.scopedBuffer)) {
        this.scopedBuffer[ip.scope] = [];
      }
      return this.scopedBuffer[ip.scope];
    }
    if (ip.initial) {
      return this.iipBuffer;
    }
    return this.buffer;
  }

  /**
   * @param {any} data
   */
  validateData(data) {
    if (!this.options.values) { return; }
    if (this.options.values.indexOf(data) === -1) {
      throw new Error(`Invalid data='${data}' received, not in [${this.options.values}]`);
    }
  }

  /**
   * @param {string|null} scope
   * @param {number|null} index
   * @param {boolean} [initial]
   * @returns {Array<import("./IP").default>}
   */
  getBuffer(scope, index, initial = false) {
    if (this.isAddressable()) {
      if ((scope != null) && this.options.scoped) {
        if (!(scope in this.indexedScopedBuffer)) { return undefined; }
        if (!(index in this.indexedScopedBuffer[scope])) { return undefined; }
        return this.indexedScopedBuffer[scope][index];
      }
      if (initial) {
        if (!(index in this.indexedIipBuffer)) { return undefined; }
        return this.indexedIipBuffer[index];
      }
      if (!(index in this.indexedBuffer)) { return undefined; }
      return this.indexedBuffer[index];
    }
    if ((scope != null) && this.options.scoped) {
      if (!(scope in this.scopedBuffer)) { return undefined; }
      return this.scopedBuffer[scope];
    }
    if (initial) {
      return this.iipBuffer;
    }
    return this.buffer;
  }

  /**
   * @param {string|null} scope
   * @param {number|null} index
   * @param {boolean} [initial]
   * @returns {import("./IP").default|void}
   */
  getFromBuffer(scope, index, initial = false) {
    const buf = this.getBuffer(scope, index, initial);
    if (!(buf != null ? buf.length : undefined)) {
      return undefined;
    }
    if (this.options.control) {
      return buf[buf.length - 1];
    }
    return buf.shift();
  }

  /**
   * Fetches a packet from the port
   * @param {string|null} scope
   * @param {number|null} [index]
   */
  get(scope, index = null) {
    const res = this.getFromBuffer(scope, index);
    if (res !== undefined) { return res; }
    // Try to find an IIP instead
    return this.getFromBuffer(null, index, true);
  }

  /**
   * Fetches a packet from the port
   * @param {string|null} scope
   * @param {number|null} index
   * @param {HasValidationCallback} validate
   * @param {boolean} [initial]
   */
  hasIPinBuffer(scope, index, validate, initial = false) {
    const buf = this.getBuffer(scope, index, initial);
    if (!(buf != null ? buf.length : undefined)) { return false; }
    for (let i = 0; i < buf.length; i += 1) {
      if (validate(buf[i])) { return true; }
    }
    return false;
  }

  /**
   * @param {number|null} index
   * @param {HasValidationCallback} validate
   */
  hasIIP(index, validate) {
    return this.hasIPinBuffer(null, index, validate, true);
  }

  /**
   * Returns true if port contains packet(s) matching the validator
   * @param {string|null} scope
   * @param {number|null|HasValidationCallback} index
   * @param {HasValidationCallback} [validate]
   */
  has(scope, index, validate) {
    let valid = validate;
    /** @type {number|null} */
    let idx;
    if (typeof index === 'function') {
      valid = /** @type {HasValidationCallback} */ (index);
      idx = null;
    } else {
      idx = index;
    }
    if (this.hasIPinBuffer(scope, idx, valid)) { return true; }
    if (this.hasIIP(idx, valid)) { return true; }
    return false;
  }

  /**
   * Returns the number of data packets in an inport
   * @param {string|null} scope
   * @param {number|null} [index]
   * @returns {number}
   */
  length(scope, index = null) {
    const buf = this.getBuffer(scope, index);
    if (!buf) { return 0; }
    return buf.length;
  }

  /**
   * Tells if buffer has packets or not
   * @param {string|null} scope
   */
  ready(scope) {
    return this.length(scope) > 0;
  }

  // Clears inport buffers
  clear() {
    return this.prepareBuffer();
  }
}
