//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./OutPort.d.ts" */
import BasePort from "./BasePort.js";
import IP from "./IP.js";

/**
 * @typedef OutPortOptions
 * @property {boolean} [caching]
 */
/**
 * @typedef {import("./BasePort.js").BaseOptions & OutPortOptions} PortOptions
 */

/**
 * A NoFlo outport.
 *
 * Outport Port (outport) implementation for NoFlo components. These ports
 * are the way a component sends Information Packets.
 */
export default class OutPort extends BasePort {
  /**
   * Create an output port. Ports are scoped by default; caching (resending
   * the latest data to newly attached sockets) is off unless requested.
   *
   * @param {PortOptions} options - Options for the outport
   */
  constructor(options = {}) {
    const opts = options;
    if (opts.scoped == null) {
      opts.scoped = true;
    }
    if (typeof opts.caching !== "boolean") {
      opts.caching = false;
    }
    super(opts);

    /**
     * Port configuration, including datatype, schema, scoping, and caching behavior
     * @type {PortOptions}
     */
    const baseOptions = this.options;
    this.options = /** @type {PortOptions} */ (baseOptions);

    /**
     * Latest cached data IP per addressable slot, resent on new connections when caching is enabled
     * @type {Object<string, IP>}
     */
    this.cache = {};

    /**
     * Admission promise for the most recent send: resolves when all
     * packets sent by the last sendIP call have been admitted by their
     * edges per the high-water marks.
     *
     * @type {Promise<void>}
     */
    this.lastWrite = Promise.resolve();
  }

  /**
   * Attach a socket to the port. With caching enabled, the cached value for
   * the slot is sent to the new socket immediately.
   *
   * @param {import("./InternalSocket.js").InternalSocket} socket
   * @param {number|null} [index]
   */
  attach(socket, index = null) {
    super.attach(socket, index);
    if (this.isCaching() && this.cache[`${index}`] != null) {
      this.send(this.cache[`${index}`], index);
    }
  }

  /**
   * Connect the port's socket(s), checking required ports first. On
   * addressable ports only the given slot is affected; on regular ports all
   * attached sockets are.
   *
   * @param {number|null} [index]
   */
  connect(index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
    sockets.forEach((socket) => {
      if (!socket) {
        return;
      }
      socket.connect();
    });
  }

  /**
   * Send a data packet to the port's socket(s). With caching enabled the
   * value is kept for resend on new connections.
   *
   * @param {any} data
   * @param {number|null} [index]
   */
  send(data, index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
    if (this.isCaching() && data !== this.cache[`${index}`]) {
      this.cache[`${index}`] = data;
    }
    sockets.forEach((socket) => {
      if (!socket) {
        return;
      }
      socket.send(data);
    });
  }

  /**
   * Disconnect the port's socket(s).
   *
   * @param {number|null} [index]
   */
  disconnect(index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
    sockets.forEach((socket) => {
      if (!socket) {
        return;
      }
      socket.disconnect();
    });
  }

  /**
   * Send an Information Packet to the port's socket(s), stamping it with the
   * port's datatype and schema, updating the cache, and returning `this`.
   * The admission Promise for the send is available on
   * {@link OutPort#lastWrite}; it resolves once every receiving edge has
   * admitted the packet per its high-water mark.
   *
   * @param {string|IP} type
   * @param {any} [data]
   * @param {import("./IP.js").IPOptions} [options]
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
    } else if (typeof type === "string") {
      ip = new IP(type, data, options);
    } else {
      throw new Error("Unknown type for IP type");
    }
    const sockets = this.getSockets(idx);
    this.checkRequired(sockets);

    if (ip.datatype === "all") {
      // Stamp non-specific IP objects with port datatype
      ip.datatype = this.getDataType();
    }
    if (this.getSchema() && !ip.schema) {
      // Stamp non-specific IP objects with port schema
      ip.schema = this.getSchema();
    }

    const cachedData =
      this.cache[`${idx}`] != null ? this.cache[`${idx}`].data : undefined;
    if (this.isCaching() && data !== cachedData) {
      this.cache[`${idx}`] = ip;
    }
    let pristine = true;
    /** @type {Array<Promise<void>|void>} */
    const writes = [];
    sockets.forEach((socket) => {
      if (!socket) {
        return;
      }
      if (pristine) {
        writes.push(socket.post(ip, autoConnect));
        pristine = false;
      } else {
        if (ip.clonable) {
          ip = ip.clone();
        }
        writes.push(socket.post(ip, autoConnect));
      }
    });
    // Admission promise for the most recent send. The noop catch keeps
    // fire-and-forget callers off the unhandled-rejection channel —
    // send errors are escalated at the socket level — while awaiters of
    // lastWrite still receive them.
    const admission = Promise.all(writes).then(() => undefined);
    admission.catch(() => {});
    this.lastWrite = admission;
    return this;
  }

  /**
   * Send an open-bracket IP to the port.
   *
   * @param {string|null} data
   * @param {import("./IP.js").IPOptions} options
   * @param {number|null} [index]
   */
  openBracket(data = null, options = {}, index = null) {
    return this.sendIP("openBracket", data, options, index);
  }

  /**
   * Send a data IP to the port.
   *
   * @param {any} data
   * @param {import("./IP.js").IPOptions} options
   * @param {number|null} [index]
   */
  data(data, options = {}, index = null) {
    return this.sendIP("data", data, options, index);
  }

  /**
   * Send a close-bracket IP to the port.
   *
   * @param {string|null} data
   * @param {import("./IP.js").IPOptions} options
   * @param {number|null} [index]
   */
  closeBracket(data = null, options = {}, index = null) {
    return this.sendIP("closeBracket", data, options, index);
  }

  /**
   * Throw when the port is required but none of its sockets are connected.
   *
   * @param {Array<import("./InternalSocket.js").InternalSocket|void>} sockets
   * @returns {void}
   */
  checkRequired(sockets) {
    if (sockets.length === 0 && this.isRequired()) {
      throw new Error(`${this.getId()}: No connections available`);
    }
  }

  /**
   * Get the socket(s) a send should target: the single slot for addressable
   * ports (index required), or all attached sockets for regular ports.
   *
   * @param {number|null} index
   * @returns {Array<import("./InternalSocket.js").InternalSocket|void>}
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
    if (index !== null) {
      throw new Error(
        `${this.getId()} is not addressable, but the packet carries index ${index} — clear ip.index before sending to a non-addressable port`,
      );
    }
    // Regular sockets affect all outbound connections
    return this.sockets;
  }

  /**
   * Check whether the port resends its latest value to newly attached
   * sockets.
   *
   * @returns {boolean}
   */
  isCaching() {
    if (this.options.caching) {
      return true;
    }
    return false;
  }
}
