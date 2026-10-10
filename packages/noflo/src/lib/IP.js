//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2016-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./IP.d.ts" */

/**
 * @typedef {Object<string, boolean|string>} IPOptions
 */

/**
 * An Information Packet: the unit of information transmitted between
 * components running in a NoFlo network. IP objects carry a `type` that
 * defines whether they're regular `data` IPs or the beginning or end of a
 * stream (`openBracket`, `closeBracket`).
 *
 * The component currently holding an IP object is identified with the
 * `owner` key.
 *
 * By default, IP objects may be sent to multiple components. If they're set
 * to be clonable, each component will receive its own clone of the IP. This
 * should be enabled for any IP object working with data that is safe to
 * clone.
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
     * Whether the IP must be cloned before sending to additional sockets
     * @type {boolean}
     */
    this.clonable = false; // cloning safety flag
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
   * Create a new IP copying its contents by value, not reference. The owner
   * is not copied.
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
        ip[key] = JSON.parse(JSON.stringify(val));
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
