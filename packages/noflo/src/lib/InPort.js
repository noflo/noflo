//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./InPort.d.ts" */
import BasePort from "./BasePort.js";

/**
 * @typedef InPortOptions
 * @property {any} [default]
 * @property {Array<any>} [values]
 * @property {boolean} [control]
 * @property {boolean} [triggering]
 */
/**
 * @callback HasValidationCallback
 * @param {import("./IP.js").default} ip
 * @returns {boolean}
 */
/**
 * @typedef {import("./BasePort.js").BaseOptions & InPortOptions} PortOptions
 */

/**
 * A NoFlo inport.
 *
 * Input Port (inport) implementation for NoFlo components. These ports are
 * the way a component receives Information Packets.
 */
export default class InPort extends BasePort {
  /**
   * Create an input port. Control, scoping, and triggering behavior default
   * to non-control, scoped, and triggering respectively; the buffer
   * structures are prepared for regular and addressable use.
   *
   * @param {PortOptions} [options]
   */
  constructor(options = {}) {
    const opts = options;
    if (opts.control == null) {
      opts.control = false;
    }
    if (opts.scoped == null) {
      opts.scoped = true;
    }
    if (opts.triggering == null) {
      opts.triggering = true;
    }

    super(opts);

    /**
     * Port configuration, including datatype, schema, and control/scoping/triggering behavior
     * @type {PortOptions}
     */
    const baseOptions = this.options;
    this.options = /** @type {PortOptions} */ (baseOptions);

    /**
     * The component instance this port belongs to, populated by the network
     * @type {import("./Component.js").Component|null}
     */
    this.nodeInstance = null;

    this.prepareBuffer();
  }

  /**
   * Subscribe the port to a socket and forward its events into the port's
   * buffers and lifecycle events. Installs the default-value data delegate
   * when the port has one.
   *
   * @param {import("./InternalSocket.js").InternalSocket} socket
   * @param {number|null} [localId]
   */
  attachSocket(socket, localId = null) {
    // have a default value.
    if (this.hasDefault()) {
      socket.setDataDelegate(() => this.options.default);
    }

    // Connection framing stays a port-level event (consumed for example by
    // subgraphs starting their internal network on first data); packets are
    // delivered through the `ip` event only.
    socket.addEventListener("connect", () => {
      if (this.isAddressable()) {
        this.dispatchLifecycleEvent("connect", [socket, localId]);
        return;
      }
      this.dispatchLifecycleEvent("connect", socket);
    });
    socket.addEventListener("disconnect", () => {
      if (this.isAddressable()) {
        this.dispatchLifecycleEvent("disconnect", [socket, localId]);
        return;
      }
      this.dispatchLifecycleEvent("disconnect", socket);
    });
    socket.addEventListener("ip", (event) =>
      this.handleIP(event.detail, localId),
    );
  }

  /**
   * Receive an Information Packet from a socket: validate it against the
   * port's `values` list, stamp it with ownership, index, and port
   * datatype/schema, buffer it, and emit the `ip` event.
   *
   * @param {import("./IP.js").default} packet
   * @param {number|null} [index]
   */
  handleIP(packet, index = null) {
    const ip = packet;
    if (ip.type === "data") {
      this.validateData(ip.data);
    }
    ip.owner = this.nodeInstance;
    if (this.isAddressable()) {
      ip.index = index;
    }
    if (ip.datatype === "all") {
      // Stamp non-specific IP objects with port datatype
      ip.datatype = this.getDataType();
    }
    if (this.getSchema() && !ip.schema) {
      // Stamp non-specific IP objects with port schema
      ip.schema = this.getSchema();
    }

    const buf = this.prepareBufferForIP(ip);
    // Control ports buffer the latest stream: brackets are kept, an
    // unbracketed data IP is its own stream, and a new openBracket
    // discards any previously buffered stream
    if (this.options.control) {
      if (packet.type === "openBracket" && buf.length > 0) {
        buf.length = 0;
      }
      if (
        packet.type === "data" &&
        !buf.some((buffered) => buffered.type === "openBracket")
      ) {
        buf.length = 0;
      }
    }
    buf.push(ip);
    this.dispatchLifecycleEvent("ip", ip);
  }

  /**
   * Check whether the port has a default value to send when no packet
   * arrives.
   *
   * @returns {boolean}
   */
  hasDefault() {
    return this.options.default !== undefined;
  }

  /**
   * Initialize the port's packet buffers: per-scope and per-index structures
   * for scoped and/or addressable ports, plus the separate IIP buffer.
   *
   * @returns {void}
   */
  prepareBuffer() {
    if (this.isAddressable()) {
      if (this.options.scoped) {
        /**
         * Buffers for scoped packets on addressable ports, keyed by scope then slot index
         * @type {Object<string,Object<number,Array<import("./IP.js").default>>>}
         */
        this.indexedScopedBuffer = {};
      }
      /**
       * Buffers for initial information packets on addressable ports, keyed by slot index
       * @type {Object<number,Array<import("./IP.js").default>>}
       */
      this.indexedIipBuffer = {};
      /**
       * Buffers for regular packets on addressable ports, keyed by slot index
       * @type {Object<number,Array<import("./IP.js").default>>}
       */
      this.indexedBuffer = {};
      return;
    }
    if (this.options.scoped) {
      /**
       * Buffers for scoped packets, keyed by scope
       * @type {Object<string,Array<import("./IP.js").default>>}
       */
      this.scopedBuffer = {};
    }
    /**
     * Buffer for initial information packets
     * @type {Array<import("./IP.js").default>}
     */
    this.iipBuffer = [];
    /**
     * Buffer for regular packets
     * @type {Array<import("./IP.js").default>}
     */
    this.buffer = [];
  }

  /**
   * Pick the buffer an incoming IP belongs to, creating missing scope or
   * index entries as needed: the scoped buffer for scoped IPs, the IIP
   * buffer for initial packets, and the regular buffer otherwise.
   *
   * @param {import("./IP.js").default} ip
   * @returns {Array<import("./IP.js").default>}
   */
  prepareBufferForIP(ip) {
    if (this.isAddressable()) {
      if (ip.scope != null && this.options.scoped) {
        if (!(ip.scope in this.indexedScopedBuffer)) {
          this.indexedScopedBuffer[ip.scope] = [];
        }
        if (!(ip.index in this.indexedScopedBuffer[ip.scope])) {
          this.indexedScopedBuffer[ip.scope][ip.index] = [];
        }
        return this.indexedScopedBuffer[ip.scope][ip.index];
      }
      if (ip.initial) {
        if (!(ip.index in this.indexedIipBuffer)) {
          this.indexedIipBuffer[ip.index] = [];
        }
        return this.indexedIipBuffer[ip.index];
      }
      if (!(ip.index in this.indexedBuffer)) {
        this.indexedBuffer[ip.index] = [];
      }
      return this.indexedBuffer[ip.index];
    }
    if (ip.scope != null && this.options.scoped) {
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
   * Validate incoming data against the port's `values` list, when one is
   * configured. Throws on values outside the list.
   *
   * @param {any} data
   * @returns {void}
   */
  validateData(data) {
    if (!this.options.values) {
      return;
    }
    if (this.options.values.indexOf(data) === -1) {
      throw new Error(
        `Invalid data='${data}' received, not in [${this.options.values}]`,
      );
    }
  }

  /**
   * Get the packet buffer for a given scope and addressable-port index.
   * Returns `undefined` when the scope or index has no buffer yet.
   *
   * @param {string|null} scope
   * @param {number|null} index
   * @param {boolean} [initial]
   * @returns {Array<import("./IP.js").default>}
   */
  getBuffer(scope, index, initial = false) {
    if (this.isAddressable()) {
      if (scope != null && this.options.scoped) {
        if (!(scope in this.indexedScopedBuffer)) {
          return undefined;
        }
        if (!(index in this.indexedScopedBuffer[scope])) {
          return undefined;
        }
        return this.indexedScopedBuffer[scope][index];
      }
      if (initial) {
        if (!(index in this.indexedIipBuffer)) {
          return undefined;
        }
        return this.indexedIipBuffer[index];
      }
      if (!(index in this.indexedBuffer)) {
        return undefined;
      }
      return this.indexedBuffer[index];
    }
    if (scope != null && this.options.scoped) {
      if (!(scope in this.scopedBuffer)) {
        return undefined;
      }
      return this.scopedBuffer[scope];
    }
    if (initial) {
      return this.iipBuffer;
    }
    return this.buffer;
  }

  /**
   * Fetch the next packet from the buffer for a given scope and index.
   * Control ports read non-consumingly, returning the latest data IP of the
   * buffered stream instead of shifting it.
   *
   * @param {string|null} scope
   * @param {number|null} index
   * @param {boolean} [initial]
   * @returns {import("./IP.js").default|void}
   */
  getFromBuffer(scope, index, initial = false) {
    const buf = this.getBuffer(scope, index, initial);
    if (!(buf != null ? buf.length : undefined)) {
      return undefined;
    }
    if (this.options.control) {
      // Non-consuming: return the latest data IP within the buffered
      // stream, skipping over its brackets
      for (let i = buf.length - 1; i >= 0; i -= 1) {
        if (buf[i].type === "data") {
          return buf[i];
        }
      }
      return undefined;
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
    if (res !== undefined) {
      return res;
    }
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
    if (!(buf != null ? buf.length : undefined)) {
      return false;
    }
    for (let i = 0; i < buf.length; i += 1) {
      if (validate(buf[i])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check whether the port holds an initial information packet for the given
   * addressable-port index, optionally validated.
   *
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
    if (typeof index === "function") {
      valid = /** @type {HasValidationCallback} */ (index);
      idx = null;
    } else {
      idx = index;
    }
    // On control ports, has() reports whether a data IP is present in
    // the buffered stream — buffered brackets alone do not satisfy it
    if (this.options.control) {
      const original = valid;
      valid = (ip) => ip.type === "data" && original(ip);
    }
    if (this.hasIPinBuffer(scope, idx, valid)) {
      return true;
    }
    if (this.hasIIP(idx, valid)) {
      return true;
    }
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
    if (!buf) {
      return 0;
    }
    return buf.length;
  }

  /**
   * Tells if buffer has packets or not
   * @param {string|null} scope
   */
  ready(scope) {
    return this.length(scope) > 0;
  }

  /**
   * Clear all inport buffers, resetting the port to an empty state.
   *
   * @returns {void}
   */
  clear() {
    return this.prepareBuffer();
  }
}
