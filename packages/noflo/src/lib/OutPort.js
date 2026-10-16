//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./OutPort.d.ts" */
import BasePort from "./BasePort.js";
import IP from "./IP.js";

/**
 * @typedef OutPortOptions
 * @property {boolean} [fanoutRefs] - When true, fan-out of an IP marked
 *   `clonable: false` is allowed on this port: each attached edge receives
 *   a fresh IP envelope carrying the same payload reference, instead of
 *   the send throwing.
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
   * Create an output port. Ports are scoped by default.
   *
   * @param {PortOptions} options - Options for the outport
   */
  constructor(options = {}) {
    const opts = options;
    if (opts.scoped == null) {
      opts.scoped = true;
    }
    super(opts);

    /**
     * Port configuration, including datatype, schema, and scoping behavior
     * @type {PortOptions}
     */
    const baseOptions = this.options;
    this.options = /** @type {PortOptions} */ (baseOptions);

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
   * Attach a socket to the port.
   *
   * @param {import("./InternalSocket.js").InternalSocket} socket
   * @param {number|null} [index]
   */
  attach(socket, index = null) {
    super.attach(socket, index);
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
   * Send a data packet to the port's socket(s).
   *
   * @param {any} data
   * @param {number|null} [index]
   */
  send(data, index = null) {
    const sockets = this.getSockets(index);
    this.checkRequired(sockets);
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
   * Terminally disconnect every attached socket, without the required-port
   * check: closing down a component must not fail on an unconnected
   * outport. Each disconnect drains first, so downstream sees
   * end-of-input after the in-flight packets (work document #45).
   *
   * @returns {void}
   */
  disconnectAll() {
    this.sockets.forEach((socket) => {
      if (!socket) {
        return;
      }
      socket.disconnect();
    });
  }

  /**
   * Send an Information Packet to the port's socket(s), stamping it with the
   * port's datatype and schema, and returning `this`. The admission Promise
   * for the send is available on {@link OutPort#lastWrite}; it resolves once
   * every receiving edge has admitted the packet per its high-water mark.
   *
   * @param {string|IP} type
   * @param {any} [data]
   * @param {import("./IP.js").IPOptions} [options]
   * @param {number|null} [index]
   */
  sendIP(type, data, options, index = null) {
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

    const targets = sockets.filter((socket) => socket);
    const fanout = targets.length > 1;
    if (fanout && !ip.clonable && !this.isFanoutRefs()) {
      throw new Error(
        `${this.getId()}: fan-out to ${targets.length} connections of an IP marked clonable: false — enable the fanoutRefs option on this outport to share the payload reference, or route the packet through a splitter component`,
      );
    }
    // The IP leaves the sending process: release ownership while it is in
    // transport. The receiving buffer stamps the consumer; a consuming read
    // moves it onto the consuming component.
    ip.owner = null;
    // Fan-out is automatic, and the multiplication is observable: every
    // attached edge receives its own IP envelope carrying its own owner,
    // admission slot, and — per the sender's `clonable` declaration — its
    // own deep-copied payload. A `fanoutRefs` outport shares the payload
    // reference across the envelopes instead of copying it.
    /** @type {Array<Promise<void>|void>} */
    const writes = [];
    sockets.forEach((socket) => {
      if (!socket) {
        return;
      }
      let outgoing = ip;
      if (fanout) {
        outgoing = this.isFanoutRefs() ? ip.envelope() : ip.clone();
      }
      writes.push(socket.post(outgoing));
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
   * Check whether this port opts into reference-sharing fan-out for IPs
   * marked `clonable: false`.
   *
   * @returns {boolean}
   */
  isFanoutRefs() {
    if (this.options.fanoutRefs) {
      return true;
    }
    return false;
  }
}
