/* eslint-disable
    max-len,
    no-multi-assign,
    no-param-reassign,
    no-restricted-syntax,
    no-shadow,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
let InPort;
const BasePort = require('./BasePort');
const IP = require('./IP');

// ## NoFlo inport
//
// Input Port (inport) implementation for NoFlo components. These
// ports are the way a component receives Information Packets.
module.exports = (InPort = class InPort extends BasePort {
  constructor(options) {
    if (options == null) { options = {}; }
    if (options.control == null) { options.control = false; }
    if (options.scoped == null) { options.scoped = true; }
    if (options.triggering == null) { options.triggering = true; }

    if (options.process) {
      throw new Error('InPort process callback is deprecated. Please use Process API');
    }

    if (options.handle) {
      throw new Error('InPort handle callback is deprecated. Please use Process API');
    }

    super(options);

    this.prepareBuffer();
  }

  // Assign a delegate for retrieving data should this inPort
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

  handleIP(ip, id) {
    if (this.options.control && (ip.type !== 'data')) { return; }
    ip.owner = this.nodeInstance;
    if (this.isAddressable()) { ip.index = id; }
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

    this.emit('ip', ip, id);
  }

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
      if (this.options.scoped) { this.scopedBuffer = {}; }
      this.indexedBuffer = {};
      this.iipBuffer = {};
      return;
    }
    if (this.options.scoped) { this.scopedBuffer = {}; }
    this.iipBuffer = [];
    this.buffer = [];
  }

  prepareBufferForIP(ip) {
    if (this.isAddressable()) {
      if ((ip.scope != null) && this.options.scoped) {
        if (!(ip.scope in this.scopedBuffer)) { this.scopedBuffer[ip.scope] = []; }
        if (!(ip.index in this.scopedBuffer[ip.scope])) { this.scopedBuffer[ip.scope][ip.index] = []; }
        return this.scopedBuffer[ip.scope][ip.index];
      }
      if (ip.initial) {
        if (!(ip.index in this.iipBuffer)) { this.iipBuffer[ip.index] = []; }
        return this.iipBuffer[ip.index];
      }
      if (!(ip.index in this.indexedBuffer)) { this.indexedBuffer[ip.index] = []; }
      return this.indexedBuffer[ip.index];
    }
    if ((ip.scope != null) && this.options.scoped) {
      if (!(ip.scope in this.scopedBuffer)) { this.scopedBuffer[ip.scope] = []; }
      return this.scopedBuffer[ip.scope];
    }
    if (ip.initial) {
      return this.iipBuffer;
    }
    return this.buffer;
  }

  validateData(data) {
    if (!this.options.values) { return; }
    if (this.options.values.indexOf(data) === -1) {
      throw new Error(`Invalid data='${data}' received, not in [${this.options.values}]`);
    }
  }

  getBuffer(scope, idx, initial) {
    if (initial == null) { initial = false; }
    if (this.isAddressable()) {
      if ((scope != null) && this.options.scoped) {
        if (!(scope in this.scopedBuffer)) { return undefined; }
        if (!(idx in this.scopedBuffer[scope])) { return undefined; }
        return this.scopedBuffer[scope][idx];
      }
      if (initial) {
        if (!(idx in this.iipBuffer)) { return undefined; }
        return this.iipBuffer[idx];
      }
      if (!(idx in this.indexedBuffer)) { return undefined; }
      return this.indexedBuffer[idx];
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

  getFromBuffer(scope, idx, initial) {
    if (initial == null) { initial = false; }
    const buf = this.getBuffer(scope, idx, initial);
    if (!(buf != null ? buf.length : undefined)) { return undefined; }
    if (this.options.control) { return buf[buf.length - 1]; } return buf.shift();
  }

  // Fetches a packet from the port
  get(scope, idx) {
    const res = this.getFromBuffer(scope, idx);
    if (res !== undefined) { return res; }
    // Try to find an IIP instead
    return this.getFromBuffer(null, idx, true);
  }

  hasIPinBuffer(scope, idx, validate, initial) {
    if (initial == null) { initial = false; }
    const buf = this.getBuffer(scope, idx, initial);
    if (!(buf != null ? buf.length : undefined)) { return false; }
    for (const packet of Array.from(buf)) {
      if (validate(packet)) { return true; }
    }
    return false;
  }

  hasIIP(idx, validate) {
    return this.hasIPinBuffer(null, idx, validate, true);
  }

  // Returns true if port contains packet(s) matching the validator
  has(scope, idx, validate) {
    if (!this.isAddressable()) {
      validate = idx;
      idx = null;
    }
    if (this.hasIPinBuffer(scope, idx, validate)) { return true; }
    if (this.hasIIP(idx, validate)) { return true; }
    return false;
  }

  // Returns the number of data packets in an inport
  length(scope, idx) {
    const buf = this.getBuffer(scope, idx);
    if (!buf) { return 0; }
    return buf.length;
  }

  // Tells if buffer has packets or not
  ready(scope, idx) {
    return this.length(scope) > 0;
  }

  // Clears inport buffers
  clear() {
    return this.prepareBuffer();
  }
});
