//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2016-2017 Flowhub UG
//     NoFlo may be freely distributed under the MIT license

// ## Information Packets
//
// IP objects are the way information is transmitted between
// components running in a NoFlo network. IP objects contain
// a `type` that defines whether they're regular `data` IPs
// or whether they are the beginning or end of a stream
// (`openBracket`, `closeBracket`).
//
// The component currently holding an IP object is identified
// with the `owner` key.
//
// By default, IP objects may be sent to multiple components.
// If they're set to be clonable, each component will receive
// its own clone of the IP. This should be enabled for any
// IP object working with data that is safe to clone.
//
// It is also possible to carry metadata with an IP object.
// For example, the `datatype` and `schema` of the sending
// port is transmitted with the IP object.

// Valid IP types:
//   - 'data'
//   - 'openBracket'
//   - 'closeBracket'

/**
 * @typedef {Object<string, boolean|string>} IPOptions
 */

export default class IP {
  // Detects if an arbitrary value is an IP
  /**
   * @param {any} obj
   * @returns {boolean}
   */
  static isIP(obj) {
    return obj && (typeof obj === 'object') && (obj.isIP === true);
  }

  // Creates as new IP object
  // Valid types: 'data', 'openBracket', 'closeBracket'
  /**
   * @param {string} type
   * @param {any} data
   * @param {IPOptions} [options]
   */
  constructor(type, data = null, options = {}) {
    this.type = type || 'data';
    this.data = data;
    this.isIP = true;
    /** @type {string|null} */
    this.scope = null; // sync scope id
    /** @type {import("./Component").Component|null} */
    this.owner = null; // packet owner process
    this.clonable = false; // cloning safety flag
    /** @type {number|null} */
    this.index = null; // addressable port index
    this.schema = null;
    this.datatype = 'all';
    this.initial = false;
    if (typeof options === 'object') {
      Object.keys(options).forEach((key) => { this[key] = options[key]; });
    }
    return this;
  }

  // Creates a new IP copying its contents by value not reference
  /**
   * @returns {IP}
   */
  clone() {
    const ip = new IP(this.type);
    Object.keys(this).forEach((key) => {
      const val = this[key];
      if (key === 'owner') { return; }
      if (val === null) { return; }
      if (typeof (val) === 'object') {
        ip[key] = JSON.parse(JSON.stringify(val));
      } else {
        ip[key] = val;
      }
    });
    return ip;
  }

  // Moves an IP to a different owner
  /**
   * @param {import("./Component").Component|null} owner
   */
  move(owner) {
    // no-op
    this.owner = owner;
    return this;
  }

  // Frees IP contents
  drop() {
    Object.keys(this).forEach((key) => {
      delete this[key];
    });
  }
}
