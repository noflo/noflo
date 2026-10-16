//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2016-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./IP.d.ts" */

/**
 * @typedef {Object<string, boolean|string|number>} IPOptions
 * @property {number|null} [index] - Connection index for addressable ports
 */

/**
 * An Information Packet: the unit of information transmitted between
 * components running in a NoFlo network. IP objects carry a `type` that
 * defines whether they're regular `data` IPs or the beginning or end of a
 * stream (`openBracket`, `closeBracket`).
 *
 * The component currently holding an IP object is identified with the
 * `owner` key. An IP is owned by exactly one process at a time: it starts
 * unowned while in transport, is stamped with the receiving component when
 * buffered, and transfers to the consuming component when read. Fan-out
 * (one outport, multiple attached edges) delivers a distinct IP envelope
 * to every edge — IP identities are never shared between edges.
 *
 * The payload reference is a separate concern from packet ownership,
 * declared by the sender with the `clonable` boolean. IPs are clonable by
 * default: on fan-out each edge's envelope carries its own deep-copied
 * payload. Setting `clonable: false` marks a payload that must not be
 * copied (a shared canvas, a function, a resource handle): fan-out of such
 * an IP throws unless the outport opts into reference-sharing with the
 * `fanoutRefs` option, in which case each edge's envelope carries the same
 * payload reference.
 *
 * It is also possible to carry metadata with an IP object. For example, the
 * `datatype` and `schema` of the sending port is transmitted with the IP
 * object.
 */
export default class IP {
  /**
   * Detect whether an arbitrary value is an IP object.
   *
   * @param {any} obj
   * @returns {boolean}
   */
  static isIP(obj) {
    return obj && typeof obj === "object" && obj.isIP === true;
  }

  /**
   * Create a new IP object. Valid types are `data`, `openBracket`, and
   * `closeBracket`; options are applied onto the instance as properties.
   *
   * @param {string} type
   * @param {any} data
   * @param {IPOptions} [options]
   */
  constructor(type, data = null, options = {}) {
    /**
     * IP type: `data`, `openBracket`, or `closeBracket`
     * @type {string}
     */
    this.type = type || "data";
    /**
     * The packet payload, if any
     * @type {any}
     */
    this.data = data;
    /**
     * Marker used by {@link IP.isIP} to recognize IP objects
     * @type {boolean}
     */
    this.isIP = true;
    /**
     * Synchronization scope id shared between correlated packets, or null for unscoped
     * @type {string|null}
     */
    this.scope = null; // sync scope id
    /**
     * The component currently holding the packet
     * @type {import("./Component.js").Component|null}
     */
    this.owner = null; // packet owner process
    /**
     * Whether the payload may be copied when the IP is delivered to
     * multiple edges. `true` (default) gives each edge's envelope its own
     * deep-copied payload; `false` marks a payload that must not be
     * copied — fan-out of such an IP throws unless the outport opts into
     * reference sharing via its `fanoutRefs` option.
     * @type {boolean}
     */
    this.clonable = true; // payload-copy declaration
    /**
     * Slot index the packet targets on an addressable port
     * @type {number|null}
     */
    this.index = null; // addressable port index
    /**
     * Schema identifier of the payload, stamped from the sending port
     * @type {string|null}
     */
    this.schema = null;
    /**
     * Datatype of the payload, stamped from the sending port
     * @type {string}
     */
    this.datatype = "all";
    /**
     * Whether the packet is an initial information packet injected at network start
     * @type {boolean}
     */
    this.initial = false;
    if (typeof options === "object") {
      Object.keys(options).forEach((key) => {
        this[key] = options[key];
      });
    }
  }

  /**
   * Create a fresh IP envelope carrying the same payload by reference.
   * This is the always-safe clone used for fan-out: the new envelope has
   * its own identity (and no owner), while `data` and the other metadata
   * are shared with the original. The `clonable` declaration carries
   * over, so a further fan-out of the envelope behaves like the original.
   *
   * @returns {IP}
   */
  envelope() {
    const ip = new IP(this.type);
    Object.keys(this).forEach((key) => {
      if (key === "owner") {
        return;
      }
      ip[key] = this[key];
    });
    return ip;
  }

  /**
   * Create a new IP copying its contents by value, not reference. The owner
   * is not copied.
   *
   * The payload is deep-copied with `structuredClone`, which round-trips
   * typed arrays, `Map`s, `Set`s, `Date`s, and cyclic references that the
   * 1.x JSON-based copy silently corrupted. Payloads the structured clone
   * algorithm cannot copy (functions, symbols) throw; send such payloads
   * with `clonable: false` and let fan-out share the reference, or deliver
   * them to a single edge.
   *
   * @returns {IP}
   */
  clone() {
    const ip = new IP(this.type);
    Object.keys(this).forEach((key) => {
      const val = this[key];
      if (key === "owner") {
        return;
      }
      if (val === null) {
        return;
      }
      if (typeof val === "object") {
        try {
          ip[key] = structuredClone(val);
        } catch (error) {
          throw new Error(
            `IP property '${key}' is not clonable: ${/** @type {Error} */ (error).message}`,
          );
        }
      } else {
        ip[key] = val;
      }
    });
    return ip;
  }

  /**
   * Move the IP to a different owning component.
   *
   * @param {import("./Component.js").Component|null} owner
   */
  move(owner) {
    // no-op
    this.owner = owner;
    return this;
  }

  /**
   * Free the IP contents. The packet object becomes empty and unusable.
   *
   * @returns {void}
   */
  drop() {
    Object.keys(this).forEach((key) => {
      delete this[key];
    });
  }
}
