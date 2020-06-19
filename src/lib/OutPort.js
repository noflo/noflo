/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
const BasePort = require('./BasePort');
const IP = require('./IP');

// ## NoFlo outport
//
// Outport Port (outport) implementation for NoFlo components.
// These ports are the way a component sends Information Packets.
class OutPort extends BasePort {
  constructor(options) {
    if (options == null) { options = {}; }
    if (options.scoped == null) { options.scoped = true; }
    super(options);
    this.cache = {};
  }

  attach(socket, index = null) {
    super.attach(socket, index);
    if (this.isCaching() && (this.cache[index] != null)) {
      this.send(this.cache[index], index);
    }
  }

  connect(socketId = null) {
    const sockets = this.getSockets(socketId);
    this.checkRequired(sockets);
    for (let socket of Array.from(sockets)) {
      if (!socket) { continue; }
      socket.connect();
    }
  }

  beginGroup(group, socketId = null) {
    const sockets = this.getSockets(socketId);
    this.checkRequired(sockets);
    sockets.forEach(function(socket) {
      if (!socket) { return; }
      return socket.beginGroup(group);
    });
  }

  send(data, socketId = null) {
    const sockets = this.getSockets(socketId);
    this.checkRequired(sockets);
    if (this.isCaching() && (data !== this.cache[socketId])) {
      this.cache[socketId] = data;
    }
    sockets.forEach(function(socket) {
      if (!socket) { return; }
      return socket.send(data);
    });
  }

  endGroup(socketId = null) {
    const sockets = this.getSockets(socketId);
    this.checkRequired(sockets);
    for (let socket of Array.from(sockets)) {
      if (!socket) { continue; }
      socket.endGroup();
    }
  }

  disconnect(socketId = null) {
    const sockets = this.getSockets(socketId);
    this.checkRequired(sockets);
    for (let socket of Array.from(sockets)) {
      if (!socket) { continue; }
      socket.disconnect();
    }
  }

  sendIP(type, data, options, socketId, autoConnect) {
    let ip;
    if (autoConnect == null) { autoConnect = true; }
    if (IP.isIP(type)) {
      ip = type;
      socketId = ip.index;
    } else {
      ip = new IP(type, data, options);
    }
    const sockets = this.getSockets(socketId);
    this.checkRequired(sockets);

    if (ip.datatype === 'all') {
      // Stamp non-specific IP objects with port datatype
      ip.datatype = this.getDataType();
    }
    if (this.getSchema() && !ip.schema) {
      // Stamp non-specific IP objects with port schema
      ip.schema = this.getSchema();
    }

    if (this.isCaching() && (data !== (this.cache[socketId] != null ? this.cache[socketId].data : undefined))) {
      this.cache[socketId] = ip;
    }
    let pristine = true;
    for (let socket of Array.from(sockets)) {
      if (!socket) { continue; }
      if (pristine) {
        socket.post(ip, autoConnect);
        pristine = false;
      } else {
        if (ip.clonable) { ip = ip.clone(); }
        socket.post(ip, autoConnect);
      }
    }
    return this;
  }

  openBracket(data = null, options, socketId = null) {
    if (options == null) { options = {}; }
    return this.sendIP('openBracket', data, options, socketId);
  }

  data(data, options, socketId = null) {
    if (options == null) { options = {}; }
    return this.sendIP('data', data, options, socketId);
  }

  closeBracket(data = null, options, socketId = null) {
    if (options == null) { options = {}; }
    return this.sendIP('closeBracket', data, options, socketId);
  }

  checkRequired(sockets) {
    if ((sockets.length === 0) && this.isRequired()) {
      throw new Error(`${this.getId()}: No connections available`);
    }
  }

  getSockets(socketId) {
    // Addressable sockets affect only one connection at time
    if (this.isAddressable()) {
      if (socketId === null) { throw new Error(`${this.getId()} Socket ID required`); }
      if (!this.sockets[socketId]) { return []; }
      return [this.sockets[socketId]];
    }
    // Regular sockets affect all outbound connections
    return this.sockets;
  }

  isCaching() {
    if (this.options.caching) { return true; }
    return false;
  }
}

module.exports = OutPort;
