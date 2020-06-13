/* eslint-disable
    guard-for-in,
    no-continue,
    no-multi-assign,
    no-param-reassign,
    no-restricted-syntax,
    no-shadow,
    no-underscore-dangle,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
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

// Valid IP types
let IP;
const validTypes = [
  'data',
  'openBracket',
  'closeBracket',
];

module.exports = (IP = class IP {
  // Detects if an arbitrary value is an IP
  static isIP(obj) {
    return obj && (typeof obj === 'object') && (obj._isIP === true);
  }

  // Creates as new IP object
  // Valid types: 'data', 'openBracket', 'closeBracket'
  constructor(type, data = null, options) {
    if (type == null) { type = 'data'; }
    this.type = type;
    this.data = data;
    if (options == null) { options = {}; }
    this._isIP = true;
    this.scope = null; // sync scope id
    this.owner = null; // packet owner process
    this.clonable = false; // cloning safety flag
    this.index = null; // addressable port index
    this.schema = null;
    this.datatype = 'all';
    for (const key in options) {
      const val = options[key];
      this[key] = val;
    }
    return this;
  }

  // Creates a new IP copying its contents by value not reference
  clone() {
    const ip = new IP(this.type);
    for (const key in this) {
      const val = this[key];
      if (['owner'].indexOf(key) !== -1) { continue; }
      if (val === null) { continue; }
      if (typeof (val) === 'object') {
        ip[key] = JSON.parse(JSON.stringify(val));
      } else {
        ip[key] = val;
      }
    }
    return ip;
  }

  // Moves an IP to a different owner
  move(owner) {
    // no-op
    this.owner = owner;
    return this;
  }

  // Frees IP contents
  drop() {
    for (const key in this) { const val = this[key]; delete this[key]; }
  }
});
