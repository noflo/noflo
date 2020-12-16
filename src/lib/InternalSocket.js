//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2017 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
import { EventEmitter } from 'events';
import IP from './IP';
import { makeAsync } from './Platform';

function legacyToIp(event, payload) {
  // No need to wrap modern IP Objects
  if (IP.isIP(payload)) { return payload; }

  // Wrap legacy events into appropriate IP objects
  switch (event) {
    case 'begingroup':
      return new IP('openBracket', payload);
    case 'endgroup':
      return new IP('closeBracket');
    case 'data':
      return new IP('data', payload);
    default:
      return null;
  }
}

function ipToLegacy(ip) {
  switch (ip.type) {
    case 'openBracket':
      return {
        event: 'begingroup',
        payload: ip.data,
      };
    case 'data':
      return {
        event: 'data',
        payload: ip.data,
      };
    case 'closeBracket':
      return {
        event: 'endgroup',
        payload: ip.data,
      };
    default:
      return null;
  }
}

/**
 * @typedef SocketError
 * @property {Error} error
 * @property {string} [id]
 * @property {import("fbp-graph/lib/Types").GraphNodeMetadata} [metadata]
 */

// ## Internal Sockets
//
// The default communications mechanism between NoFlo processes is
// an _internal socket_, which is responsible for accepting information
// packets sent from processes' outports, and emitting corresponding
// events so that the packets can be caught to the inport of the
// connected process.
export class InternalSocket extends EventEmitter {
  /**
   * @private
   */
  regularEmitEvent(event, data) {
    this.emit(event, data);
  }

  /**
   * @private
   */
  debugEmitEvent(event, data) {
    try {
      this.emit(event, data);
    } catch (error) {
      if (error.id && error.metadata && error.error) {
        // Wrapped debuggable error coming from downstream, no need to wrap
        if (this.listeners('error').length === 0) { throw error.error; }
        this.emit('error', error);
        return;
      }

      if (this.listeners('error').length === 0) { throw error; }

      this.emit('error', {
        id: this.to ? this.to.process.id : null,
        error,
        metadata: this.metadata,
      });
    }
  }

  /**
   * @typedef InternalSocketOptions
   * @property {boolean} [debug] - Whether to catch exceptions caused by IP transmission
   * @property {boolean} [async] - Whether IP transmission should be asynchronous
   */

  /**
   * @param {import("fbp-graph/lib/Types").GraphEdgeMetadata} [metadata]
   * @param {InternalSocketOptions} [options]
   */
  constructor(metadata = {}, options = {}) {
    super();
    this.metadata = metadata;
    this.brackets = [];
    this.connected = false;
    this.dataDelegate = null;
    this.debug = options.debug || false;
    this.async = options.async || false;
    this.from = null;
    this.to = null;
  }

  emitEvent(event, data) {
    if (this.debug) {
      if (this.async) {
        makeAsync(() => this.debugEmitEvent(event, data));
        return;
      }
      this.debugEmitEvent(event, data);
      return;
    }
    if (this.async) {
      makeAsync(() => this.regularEmitEvent(event, data));
      return;
    }
    this.regularEmitEvent(event, data);
  }

  // ## Socket connections
  //
  // Sockets that are attached to the ports of processes may be
  // either connected or disconnected. The semantical meaning of
  // a connection is that the outport is in the process of sending
  // data. Disconnecting means an end of transmission.
  //
  // This can be used for example to signal the beginning and end
  // of information packets resulting from the reading of a single
  // file or a database query.
  //
  // Example, disconnecting when a file has been completely read:
  //
  //     readBuffer: (fd, position, size, buffer) ->
  //       fs.read fd, buffer, 0, buffer.length, position, (err, bytes, buffer) =>
  //         # Send data. The first send will also connect if not
  //         # already connected.
  //         @outPorts.out.send buffer.slice 0, bytes
  //         position += buffer.length
  //
  //         # Disconnect when the file has been completely read
  //         return @outPorts.out.disconnect() if position >= size
  //
  //         # Otherwise, call same method recursively
  //         @readBuffer fd, position, size, buffer
  connect() {
    if (this.connected) { return; }
    this.connected = true;
    this.emitEvent('connect', null);
  }

  disconnect() {
    if (!this.connected) { return; }
    this.connected = false;
    this.emitEvent('disconnect', null);
  }

  isConnected() { return this.connected; }

  // ## Sending information packets
  //
  // The _send_ method is used by a processe's outport to
  // send information packets. The actual packet contents are
  // not defined by NoFlo, and may be any valid JavaScript data
  // structure.
  //
  // The packet contents however should be such that may be safely
  // serialized or deserialized via JSON. This way the NoFlo networks
  // can be constructed with more flexibility, as file buffers or
  // message queues can be used as additional packet relay mechanisms.
  send(data) {
    if ((data === undefined) && (typeof this.dataDelegate === 'function')) {
      this.handleSocketEvent('data', this.dataDelegate());
      return;
    }
    this.handleSocketEvent('data', data);
  }

  // ## Sending information packets without open bracket
  //
  // As _connect_ event is considered as open bracket, it needs to be followed
  // by a _disconnect_ event or a closing bracket. In the new simplified
  // sending semantics single IP objects can be sent without open/close brackets.
  post(packet, autoDisconnect = true) {
    let ip = packet;
    if ((ip === undefined) && (typeof this.dataDelegate === 'function')) {
      ip = this.dataDelegate();
    }
    // Send legacy connect/disconnect if needed
    if (!this.isConnected() && (this.brackets.length === 0)) {
      (this.connect)();
    }
    this.handleSocketEvent('ip', ip, false);
    if (autoDisconnect && this.isConnected() && (this.brackets.length === 0)) {
      (this.disconnect)();
    }
  }

  // ## Information Packet grouping
  //
  // Processes sending data to sockets may also group the packets
  // when necessary. This allows transmitting tree structures as
  // a stream of packets.
  //
  // For example, an object could be split into multiple packets
  // where each property is identified by a separate grouping:
  //
  //     # Group by object ID
  //     @outPorts.out.beginGroup object.id
  //
  //     for property, value of object
  //       @outPorts.out.beginGroup property
  //       @outPorts.out.send value
  //       @outPorts.out.endGroup()
  //
  //     @outPorts.out.endGroup()
  //
  // This would cause a tree structure to be sent to the receiving
  // process as a stream of packets. So, an article object may be
  // as packets like:
  //
  // * `/<article id>/title/Lorem ipsum`
  // * `/<article id>/author/Henri Bergius`
  //
  // Components are free to ignore groupings, but are recommended
  // to pass received groupings onward if the data structures remain
  // intact through the component's processing.
  beginGroup(group) {
    this.handleSocketEvent('begingroup', group);
  }

  endGroup() {
    this.handleSocketEvent('endgroup');
  }

  // ## Socket data delegation
  //
  // Sockets have the option to receive data from a delegate function
  // should the `send` method receive undefined for `data`.  This
  // helps in the case of defaulting values.
  setDataDelegate(delegate) {
    if (typeof delegate !== 'function') {
      throw Error('A data delegate must be a function.');
    }
    this.dataDelegate = delegate;
  }

  // ## Socket debug mode
  //
  // Sockets can catch exceptions happening in processes when data is
  // sent to them. These errors can then be reported to the network for
  // notification to the developer.
  setDebug(active) {
    this.debug = active;
  }

  // ## Socket identifiers
  //
  // Socket identifiers are mainly used for debugging purposes.
  // Typical identifiers look like _ReadFile:OUT -> Display:IN_,
  // but for sockets sending initial information packets to
  // components may also loom like _DATA -> ReadFile:SOURCE_.
  getId() {
    const fromStr = (from) => `${from.process.id}() ${from.port.toUpperCase()}`;
    const toStr = (to) => `${to.port.toUpperCase()} ${to.process.id}()`;

    if (!this.from && !this.to) { return 'UNDEFINED'; }
    if (this.from && !this.to) { return `${fromStr(this.from)} -> ANON`; }
    if (!this.from) { return `DATA -> ${toStr(this.to)}`; }
    return `${fromStr(this.from)} -> ${toStr(this.to)}`;
  }

  /* eslint-disable no-param-reassign */
  handleSocketEvent(event, payload, autoConnect = true) {
    const isIP = (event === 'ip') && IP.isIP(payload);
    const ip = isIP ? payload : legacyToIp(event, payload);
    if (!ip) { return; }

    if (!this.isConnected() && autoConnect && (this.brackets.length === 0)) {
      // Connect before sending
      this.connect();
    }

    if (event === 'begingroup') {
      this.brackets.push(payload);
    }
    if (isIP && (ip.type === 'openBracket')) {
      this.brackets.push(ip.data);
    }

    if (event === 'endgroup') {
      // Prevent closing already closed groups
      if (this.brackets.length === 0) { return; }
      // Add group name to bracket
      ip.data = this.brackets.pop();
      payload = ip.data;
    }
    if (isIP && (payload.type === 'closeBracket')) {
      // Prevent closing already closed brackets
      if (this.brackets.length === 0) { return; }
      this.brackets.pop();
    }

    // Emit the IP Object
    this.emitEvent('ip', ip);

    // Emit the legacy event
    if (!ip || !ip.type) { return; }

    if (isIP) {
      const legacy = ipToLegacy(ip);
      ({ event, payload } = legacy);
    }

    if (event === 'connect') { this.connected = true; }
    if (event === 'disconnect') { this.connected = false; }
    this.emitEvent(event, payload);
  }
}

/**
 * @param {import("fbp-graph/lib/Types").GraphEdgeMetadata} [metadata]
 * @param {InternalSocketOptions} [options]
 * @returns {InternalSocket}
 */
export function createSocket(metadata = {}, options = {}) {
  return new InternalSocket(metadata, options);
}
