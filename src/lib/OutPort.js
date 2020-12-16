//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
import BasePort from './BasePort';
import IP from './IP';

// ## NoFlo outport
//
// Outport Port (outport) implementation for NoFlo components.
// These ports are the way a component sends Information Packets.
/**
 * @typedef OutPortOptions
 * @property {boolean} [caching]
 */
/**
 * @typedef {import("./BasePort").BaseOptions & OutPortOptions} PortOptions
 */

export default class OutPort extends BasePort {
  /**
   * @param {PortOptions} options - Options for the outport
   */
  constructor(options = {}) {
    const opts = options;
    if (opts.scoped == null) { opts.scoped = true; }
    if (typeof opts.caching !== 'boolean') {
      opts.caching = false;
    }
    super(opts);

    const baseOptions = this.options;
    this.options = /** @type {PortOptions} */ (baseOptions);

    /** @type {Object<string, IP>} */
    this.cache = {};
  }

  /**
   * @param {import("./InternalSocket").InternalSocket} socket
   * @param {number|null} [index]
   */
  attach(socket, index = null) {
    super.attach(socket, index);
    if (this.isCaching() && (this.cache[`${index}`] != null)) {
      this.send(this.cache[`${index}`], index);
    }
  }

  /**
   * @param {number|null} [index]
   */
  connect(index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
    sockets.forEach((socket) => {
      if (!socket) { return; }
      socket.connect();
    });
  }

  /**
   * @param {string} group
   * @param {number|null} [index]
   */
  beginGroup(group, index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
    sockets.forEach((socket) => {
      if (!socket) { return; }
      socket.beginGroup(group);
    });
  }

  /**
   * @param {any} data
   * @param {number|null} [index]
   */
  send(data, index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
    if (this.isCaching() && (data !== this.cache[`${index}`])) {
      this.cache[`${index}`] = data;
    }
    sockets.forEach((socket) => {
      if (!socket) { return; }
      socket.send(data);
    });
  }

  /**
   * @param {number|null} [index]
   */
  endGroup(index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
    sockets.forEach((socket) => {
      if (!socket) { return; }
      socket.endGroup();
    });
  }

  /**
   * @param {number|null} [index]
   */
  disconnect(index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
    sockets.forEach((socket) => {
      if (!socket) { return; }
      socket.disconnect();
    });
  }

  /**
   * @param {string|IP} type
   * @param {any} [data]
   * @param {import("./IP").IPOptions} [options]
   * @param {number|null} [index]
   * @param {boolean} [autoConnect]
   */
  sendIP(type, data, options, index = null, autoConnect = true) {
    /** @type {IP} */
    let ip;
    let idx = index;
    if (IP.isIP(type)) {
      ip = /** @type {IP} */ (type);
      idx = ip.index;
    } else if (typeof type === 'string') {
      ip = new IP(type, data, options);
    } else {
      throw new Error('Unknown type for IP type');
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

    const cachedData = this.cache[`${idx}`] != null ? this.cache[`${idx}`].data : undefined;
    if (this.isCaching() && data !== cachedData) {
      this.cache[`${idx}`] = ip;
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

  /**
   * @param {string|null} data
   * @param {import("./IP").IPOptions} options
   * @param {number|null} [index]
   */
  openBracket(data = null, options = {}, index = null) {
    return this.sendIP('openBracket', data, options, index);
  }

  /**
   * @param {any} data
   * @param {import("./IP").IPOptions} options
   * @param {number|null} [index]
   */
  data(data, options = {}, index = null) {
    return this.sendIP('data', data, options, index);
  }

  /**
   * @param {string|null} data
   * @param {import("./IP").IPOptions} options
   * @param {number|null} [index]
   */
  closeBracket(data = null, options = {}, index = null) {
    return this.sendIP('closeBracket', data, options, index);
  }

  /**
   * @param {Array<import("./InternalSocket").InternalSocket|void>} sockets
   */
  checkRequired(sockets) {
    if ((sockets.length === 0) && this.isRequired()) {
      throw new Error(`${this.getId()}: No connections available`);
    }
  }

  /**
   * @param {number|null} index
   * @returns {Array<import("./InternalSocket").InternalSocket|void>}
   */
  getSockets(index) {
    // Addressable sockets affect only one connection at time
    if (this.isAddressable()) {
      if (index === null) {
        throw new Error(`${this.getId()} Socket ID required`);
      }
      const idx = /** @type {number} */ (index);
      if (!this.sockets[idx]) {
        return [];
      }
      return [this.sockets[idx]];
    }
    // Regular sockets affect all outbound connections
    return this.sockets;
  }

  isCaching() {
    if (this.options.caching) {
      return true;
    }
    return false;
  }
}
