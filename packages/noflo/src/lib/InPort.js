//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./InPort.d.ts" */
import BasePort from "./BasePort.js";

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
 * @param {import("./IP.js").default} ip
 * @returns {boolean}
 */
/**
 * @typedef {import("./BasePort.js").BaseOptions & InPortOptions} PortOptions
 */

export default class InPort extends BasePort {
  /**
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

    const baseOptions = this.options;
    this.options = /** @type {PortOptions} */ (baseOptions);

    /** @type {import("./Component.js").Component|null} */
    this.nodeInstance = null;

    this.prepareBuffer();
  }

  /**
   * Assign a delegate for retrieving data should this inPort
   *
   * @param {import("./InternalSocket.js").InternalSocket} socket
   * @param {number|null} [localId]
   */
  attachSocket(socket, localId = null) {
    // have a default value.
    if (this.hasDefault()) {
      socket.setDataDelegate(() => this.options.default);
    }

    /**
     * @param {string} type
     * @param {any} detail
     */
    const forward = (type, detail) =>
      this.handleSocketEvent(type, detail, localId);
    socket.addEventListener("connect", () => forward("connect", socket));
    socket.addEventListener("begingroup", (event) =>
      forward("begingroup", event.detail),
    );
    socket.addEventListener("data", (event) => {
      this.validateData(event.detail);
      return forward("data", event.detail);
    });
    socket.addEventListener("endgroup", (event) =>
      forward("endgroup", event.detail),
    );
    socket.addEventListener("disconnect", () => forward("disconnect", socket));
    socket.addEventListener("ip", (event) =>
      this.handleIP(event.detail, localId),
    );
  }

  /**
   * @param {import("./IP.js").default} packet
   * @param {number|null} [index]
   */
  handleIP(packet, index = null) {
    const ip = packet;
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
   * @param {string} event
   * @param {any} payload
   */
  handleSocketEvent(event, payload, id) {
    // Emit port event. Addressable ports carry [payload, index] as the
    // event detail (matching attach/detach); `ip` events keep the raw IP
    // object with its `index` property.
    if (this.isAddressable()) {
      return this.dispatchLifecycleEvent(event, [payload, id]);
    }
    return this.dispatchLifecycleEvent(event, payload);
  }

  hasDefault() {
    return this.options.default !== undefined;
  }

  prepareBuffer() {
    if (this.isAddressable()) {
      if (this.options.scoped) {
        /** @type {Object<string,Object<number,Array<import("./IP.js").default>>>} */
        this.indexedScopedBuffer = {};
      }
      /** @type {Object<number,Array<import("./IP.js").default>>} */
      this.indexedIipBuffer = {};
      /** @type {Object<number,Array<import("./IP.js").default>>} */
      this.indexedBuffer = {};
      return;
    }
    if (this.options.scoped) {
      /** @type {Object<string,Array<import("./IP.js").default>>} */
      this.scopedBuffer = {};
    }
    /** @type {Array<import("./IP.js").default>} */
    this.iipBuffer = [];
    /** @type {Array<import("./IP.js").default>} */
    this.buffer = [];
  }

  /**
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
   * @param {any} data
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

  // Clears inport buffers
  clear() {
    return this.prepareBuffer();
  }
}
