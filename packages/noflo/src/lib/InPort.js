//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2014-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./InPort.d.ts" */
import BasePort from "./BasePort.js";

/**
 * @typedef InPortOptions
 * @property {boolean} [control]
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
   * Create an input port. Control and scoping behavior default to
   * non-control and scoped respectively; the buffer structures are
   * prepared for regular and addressable use.
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
    super(opts);

    /**
     * Port configuration, including datatype, schema, and control/scoping behavior
     * @type {PortOptions}
     */
    const baseOptions = this.options;
    this.options = /** @type {PortOptions} */ (baseOptions);

    /**
     * The component instance this port belongs to, populated by the network
     * @type {import("./Component.js").Component|null}
     */
    this.nodeInstance = null;

    /**
     * Whether the input is at end of transmission: every attached socket has
     * been terminally closed by its sender (or none are attached at all,
     * so nothing can arrive). EOT is not scoped — it is a fact about the
     * sender ("there will be nothing more coming from it"), and a new
     * transmission (connect) re-opens the input (work document #40 update
     * #5, #45).
     *
     * @type {boolean}
     */
    this.eot = true;

    this.prepareBuffer();
  }

  /**
   * Subscribe the port to a socket and forward its events into the port's
   * buffers and lifecycle events.
   *
   * @param {import("./InternalSocket.js").InternalSocket} socket
   * @param {number|null} [localId]
   */
  attachSocket(socket, localId = null) {
    // Connection framing stays a port-level event (consumed for example by
    // subgraphs starting their internal network on first data); packets are
    // delivered through the `ip` event only.
    socket.addEventListener("connect", () => {
      // A connect is the beginning of transmission: the input is no longer
      // at EOT
      this.#setEot(false);
      if (this.isAddressable()) {
        this.dispatchLifecycleEvent("connect", [socket, localId]);
        return;
      }
      this.dispatchLifecycleEvent("connect", socket);
    });
    socket.addEventListener("disconnect", () => {
      // Refresh the EOT state before the lifecycle dispatch: the
      // disconnect is the sender's terminal close, and the listeners must
      // see the post-refresh state
      this.#refreshEot();
      if (this.isAddressable()) {
        this.dispatchLifecycleEvent("disconnect", [socket, localId]);
      } else {
        this.dispatchLifecycleEvent("disconnect", socket);
      }
    });
    socket.addEventListener("ip", (event) =>
      this.handleIP(event.detail, localId),
    );
    // A newly attached edge is a live sender: the input is no longer at
    // EOT until that sender closes it
    this.#refreshEot();
  }

  /**
   * Whether the input is at end of transmission: every attached socket has been
   * terminally closed by its sender, or none are attached (nothing can
   * arrive). A later `connect` or `attach` re-opens the input.
   *
   * @returns {boolean}
   */
  isEot() {
    return this.eot;
  }

  /**
   * @param {boolean} value
   * @returns {void}
   */
  #setEot(value) {
    this.eot = value;
  }

  /**
   * @returns {void}
   */
  #refreshEot() {
    let live = false;
    for (const socket of this.sockets) {
      if (!socket) {
        continue;
      }
      if (!socket.isTerminal()) {
        // A sender edge that has not terminally closed may still deliver
        this.#setEot(false);
        return;
      }
      live = true;
    }
    // Every attached socket is terminally closed (or none are attached:
    // nothing can arrive)
    this.#setEot(true);
  }

  /**
   * Remove a socket from the port. The remaining attached sockets
   * re-determine the port's EOT state.
   *
   * @param {import("./InternalSocket.js").InternalSocket} socket
   * @returns {void}
   */
  detach(socket) {
    super.detach(socket);
    this.#refreshEot();
  }

  /**
   * Receive an Information Packet from a socket: stamp it with ownership,
   * index, and port datatype/schema, buffer it, and emit the `ip` event.
   *
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
   * @returns {import("./IP.js").default|undefined}
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
   * The stream-completeness check: the validator is bracket-aware, so on
   * control ports the buffered stream's framing — not just data presence
   * — decides completeness. A closeBracket completing a stream with data
   * inside is the completion moment (work document #47).
   *
   * @param {string|null} scope
   * @param {() => HasValidationCallback} makeValidate - Factory for the
   *   per-walk validator; each buffer walk gets fresh framing state
   * @returns {boolean}
   */
  hasStream(scope, makeValidate) {
    // Each buffer walk gets fresh framing state: a partially open
    // regular stream must not poison the IIP-buffer walk (work document
    // #47 review)
    if (this.hasIPinBuffer(scope, null, makeValidate())) {
      return true;
    }
    return this.hasIIP(null, makeValidate());
  }

  /**
   * Fetches a packet from the port
   * @param {string|null} scope
   * @param {number|null} [index]
   */
  get(scope, index = null) {
    const res = this.getFromBuffer(scope, index);
    if (res !== undefined) {
      // Consuming read: ownership of the IP transfers from the buffer to
      // this component. Control ports read non-consumingly — the buffered
      // IP stays in the buffer, so its ownership does not move.
      if (!this.options.control) {
        res.move(this.nodeInstance);
      }
      return res;
    }
    // Try to find an IIP instead. On regular ports the IIP is consumed by
    // the read, so ownership transfers with it; control ports read their
    // IIP buffer non-consumingly like the regular buffer, so the buffered
    // IP keeps its buffer-stamped ownership
    const iip = this.getFromBuffer(null, index, true);
    if (iip !== undefined && !this.options.control) {
      iip.move(this.nodeInstance);
    }
    return iip;
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
    // the buffered stream — buffered brackets alone do not satisfy it.
    // The bracket-stack walk must still run: original() tracks the
    // stream's framing, and the wrapper filters only the verdict, so an
    // open stream's data does not satisfy a completion gate. The
    // firing matrix caught the previous wrapper destroying the walk:
    // hasStream on a control port returned true for any partially open
    // stream (work document #47)
    if (this.options.control) {
      const original = valid;
      valid = (ip) => Boolean(original(ip)) && ip.type === "data";
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
   * Clear all inport buffers, resetting the port to an empty state.
   *
   * @returns {void}
   */
  clear() {
    return this.prepareBuffer();
  }

  /**
   * Counts the IPs currently buffered on this port, across the regular,
   * IIP, scoped, and indexed buffer shapes. Used by the component's
   * shutdown path to report unconsumed data.
   *
   * @returns {number}
   */
  /**
   * Counts the IPs currently buffered on this port, across the regular,
   * IIP, scoped, and indexed buffer shapes. Used by the component's
   * shutdown path to report unconsumed data.
   *
   * Control ports always buffer their latest stream non-consumingly by
   * design, so they are excluded: a configured control port holding its
   * value at shutdown is correct usage, not a footgun.
   *
   * @returns {number}
   */
  countBuffered() {
    if (this.options.control) {
      return 0;
    }
    let count = 0;
    if (this.isAddressable()) {
      if (this.options.scoped) {
        Object.keys(this.indexedScopedBuffer ?? {}).forEach((scope) => {
          Object.keys(this.indexedScopedBuffer[scope] ?? {}).forEach(
            (index) => {
              count += (this.indexedScopedBuffer[scope][index] ?? []).length;
            },
          );
        });
      }
      Object.keys(this.indexedIipBuffer ?? {}).forEach((index) => {
        count += (this.indexedIipBuffer[index] ?? []).length;
      });
      Object.keys(this.indexedBuffer ?? {}).forEach((index) => {
        count += (this.indexedBuffer[index] ?? []).length;
      });
      return count;
    }
    if (this.options.scoped) {
      Object.keys(this.scopedBuffer ?? {}).forEach((scope) => {
        count += (this.scopedBuffer[scope] ?? []).length;
      });
    }
    count += (this.iipBuffer ?? []).length;
    count += (this.buffer ?? []).length;
    return count;
  }

  /**
   * Bracket framing residue in this port's buffers: bracket IPs that can
   * never pair with arriving data once the port's senders have terminally
   * disconnected. One entry per (scope, index) buffer holding brackets.
   * Control ports are scanned like regular ones — a standing data value
   * is legitimate, but bracket framing around it is the stranded class
   * (work document #40 update #13).
   *
   * @returns {Array<{scope: string|null, index: number|null, open: number, close: number}>}
   */
  strandedFraming() {
    /** @type {Array<{scope: string|null, index: number|null, open: number, close: number}>} */
    const residue = [];
    /**
     * @param {Array<{type: string}>|undefined} buf
     * @param {string|null} scope
     * @param {number|null} index
     */
    const scan = (buf, scope, index) => {
      let open = 0;
      let close = 0;
      for (const ip of buf ?? []) {
        if (ip.type === "openBracket") {
          open += 1;
        } else if (ip.type === "closeBracket") {
          close += 1;
        }
      }
      if (open > 0 || close > 0) {
        residue.push({ scope, index, open, close });
      }
    };
    if (this.isAddressable()) {
      if (this.options.scoped) {
        Object.keys(this.indexedScopedBuffer ?? {}).forEach((scope) => {
          Object.keys(this.indexedScopedBuffer[scope] ?? {}).forEach(
            (index) => {
              scan(
                this.indexedScopedBuffer[scope][index],
                scope,
                Number(index),
              );
            },
          );
        });
      }
      Object.keys(this.indexedBuffer ?? {}).forEach((index) => {
        scan(this.indexedBuffer[index], null, Number(index));
      });
      return residue;
    }
    if (this.options.scoped) {
      Object.keys(this.scopedBuffer ?? {}).forEach((scope) => {
        scan(this.scopedBuffer[scope], scope, null);
      });
    }
    scan(this.buffer, null, null);
    return residue;
  }
}
