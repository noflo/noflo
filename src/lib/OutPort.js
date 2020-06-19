//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
const BasePort = require('./BasePort');
const IP = require('./IP');

// ## NoFlo outport
//
// Outport Port (outport) implementation for NoFlo components.
// These ports are the way a component sends Information Packets.
module.exports = class OutPort extends BasePort {
  constructor(options = {}) {
    const opts = options;
    if (opts.scoped == null) { opts.scoped = true; }
    super(opts);
    this.cache = {};
  }

  attach(socket, index = null) {
    super.attach(socket, index);
    if (this.isCaching() && (this.cache[index] != null)) {
      this.send(this.cache[index], index);
    }
  }

  connect(index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
    sockets.forEach((socket) => {
      if (!socket) { return; }
      socket.connect();
    });
  }

  beginGroup(group, index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
    sockets.forEach((socket) => {
      if (!socket) { return; }
      socket.beginGroup(group);
    });
  }

  send(data, index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
    if (this.isCaching() && (data !== this.cache[index])) {
      this.cache[index] = data;
    }
    sockets.forEach((socket) => {
      if (!socket) { return; }
      socket.send(data);
    });
  }

  endGroup(index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
    sockets.forEach((socket) => {
      if (!socket) { return; }
      socket.endGroup();
    });
  }

  disconnect(index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
    sockets.forEach((socket) => {
      if (!socket) { return; }
      socket.disconnect();
    });
  }

  sendIP(type, data, options, index, autoConnect = true) {
    let ip;
    let idx = index;
    if (IP.isIP(type)) {
      ip = type;
      idx = ip.index;
    } else {
      ip = new IP(type, data, options);
    }
    const sockets = this.getSockets(idx);
    this.checkRequired(sockets);

    if (ip.datatype === 'all') {
      // Stamp non-specific IP objects with port datatype
      ip.datatype = this.getDataType();
    }
    if (this.getSchema() && !ip.schema) {
      // Stamp non-specific IP objects with port schema
      ip.schema = this.getSchema();
    }

    const cachedData = this.cache[idx] != null ? this.cache[idx].data : undefined;
    if (this.isCaching() && data !== cachedData) {
      this.cache[idx] = ip;
    }
    let pristine = true;
    sockets.forEach((socket) => {
      if (!socket) { return; }
      if (pristine) {
        socket.post(ip, autoConnect);
        pristine = false;
      } else {
        if (ip.clonable) { ip = ip.clone(); }
        socket.post(ip, autoConnect);
      }
    });
    return this;
  }

  openBracket(data = null, options = {}, index = null) {
    return this.sendIP('openBracket', data, options, index);
  }

  data(data, options = {}, index = null) {
    return this.sendIP('data', data, options, index);
  }

  closeBracket(data = null, options = {}, index = null) {
    return this.sendIP('closeBracket', data, options, index);
  }

  checkRequired(sockets) {
    if ((sockets.length === 0) && this.isRequired()) {
      throw new Error(`${this.getId()}: No connections available`);
    }
  }

  getSockets(index) {
    // Addressable sockets affect only one connection at time
    if (this.isAddressable()) {
      if (index === null) { throw new Error(`${this.getId()} Socket ID required`); }
      if (!this.sockets[index]) { return []; }
      return [this.sockets[index]];
    }
    // Regular sockets affect all outbound connections
    return this.sockets;
  }

  isCaching() {
    if (this.options.caching) { return true; }
    return false;
  }
};
