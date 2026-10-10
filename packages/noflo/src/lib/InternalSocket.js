//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2013-2017 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./InternalSocket.d.ts" */

import { Edge, resolveHighWaterMark } from "./Edge.js";
import IP from "./IP.js";
import { LegacyEventBase } from "./LegacyEvents.js";
import { makeAsync } from "./Platform.js";

/**
 * @typedef SocketError
 * @property {Error} error
 * @property {string} [id]
 * @property {Object<string, any>} [metadata]
 */

// ## Internal Sockets
//
// The default communications mechanism between NoFlo processes is
// an _internal socket_, which is responsible for accepting information
// packets sent from processes' outports, and emitting corresponding
// events so that the packets can be caught to the inport of the
// connected process.
export class InternalSocket extends LegacyEventBase {
  /**
   * @private
   */
  regularEmitEvent(event, data) {
    this.dispatchLifecycleEvent(event, data);
  }

  /**
   * @private
   */
  debugEmitEvent(event, data) {
    try {
      this.dispatchLifecycleEvent(event, data);
    } catch (error) {
      if (error.id && error.metadata && error.error) {
        // Wrapped debuggable error coming from downstream, no need to wrap
        if (this.listeners("error").length === 0) {
          throw error.error;
        }
        this.dispatchLifecycleEvent("error", error);
        return;
      }

      if (this.listeners("error").length === 0) {
        throw error;
      }

      this.dispatchLifecycleEvent("error", {
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
   * @property {number|null} [highWaterMark] - Pre-resolved default (component ∪ runtime levels); the socket's edge metadata still takes precedence
   */

  /**
   * @param {Object<string, any>} [metadata]
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
    // Data-plane transport: IPs flow through an Edge. The high-water mark
    // is resolved from this socket's edge metadata over the pre-resolved
    // default (component port and runtime levels, merged by the network);
    // unbounded (the 1.x default) takes the Edge's synchronous fast path,
    // preserving the legacy delivery timing exactly.
    this.edge = new Edge({
      highWaterMark: resolveHighWaterMark(metadata, options.highWaterMark),
    });
    this.edge.onDelivery((ip) => this.#deliverIP(ip));
    this.edge.onErrorDelivery((error) => {
      if (this.listeners("error").length === 0) {
        // Loud escalation in the async delivery context, mirroring the
        // synchronous no-listener throw
        setImmediate(() => {
          throw error;
        });
        return;
      }
      this.dispatchLifecycleEvent("error", {
        id: this.to ? this.to.process.id : null,
        error,
        metadata: this.metadata,
      });
    });
  }

  /**
   * Deliver an IP from the edge to the socket's listeners.
   *
   * @param {IP} ip
   */
  #deliverIP(ip) {
    this.emitEvent("ip", ip);
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
    if (this.connected) {
      return;
    }
    this.connected = true;
    this.emitEvent("connect", null);
  }

  disconnect() {
    if (!this.connected) {
      return;
    }
    this.connected = false;
    this.emitEvent("disconnect", null);
  }

  isConnected() {
    return this.connected;
  }

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
    if (data === undefined && typeof this.dataDelegate === "function") {
      data = this.dataDelegate();
    }
    return this.post(new IP("data", data), false);
  }

  // ## Sending information packets without open bracket
  //
  // As _connect_ event is considered as open bracket, it needs to be followed
  // by a _disconnect_ event or a closing bracket. In the new simplified
  // sending semantics single IP objects can be sent without open/close brackets.
  /**
   * @param {IP} packet
   * @param {boolean} [autoDisconnect]
   * @returns {Promise<void>|void} Resolves when the packet has been
   *   admitted by the edge per its high-water mark, and rejects on send
   *   errors — which also escalate through the socket error path
   *   (process-error with a listener, loud throw without). Void when the
   *   packet is silently dropped (e.g. a stray bracket closing).
   *   Fire-and-forget compatible: callers may ignore the Promise —
   *   internal handling keeps ignored rejections off the unhandled
   *   channel.
   */
  post(packet, autoDisconnect = true) {
    let ip = packet;
    if (ip === undefined && typeof this.dataDelegate === "function") {
      ip = this.dataDelegate();
    }
    // Connect before sending when there is no open bracket framing
    if (!this.isConnected() && this.brackets.length === 0) {
      this.connect();
    }
    let write;
    if (ip.type === "closeBracket" && this.brackets.length === 0) {
      // A stray close is silently dropped
    } else {
      if (ip.type === "openBracket") {
        this.brackets.push(ip.data);
      }
      if (ip.type === "closeBracket") {
        if (ip.data == null) {
          // Name the closing bracket after the innermost open group
          ip.data = this.brackets[this.brackets.length - 1];
        }
        this.brackets.pop();
      }
      // Transport the IP through the edge; delivery emits the events. A
      // rejected write escalates through the socket error path (side-
      // channel catch — the returned promise still rejects for awaiting
      // callers, so transport errors reach them without becoming unhandled
      // rejections in fire-and-forget call sites).
      write = this.edge.write(ip);
      write.catch((error) => {
        if (this.listeners("error").length === 0) {
          // No error listener: escalate loudly, like the 1.x debug
          // emission path did
          setImmediate(() => {
            throw error;
          });
          return;
        }
        this.dispatchLifecycleEvent("error", {
          id: this.to ? this.to.process.id : null,
          error,
          metadata: this.metadata,
        });
      });
    }
    if (autoDisconnect && this.isConnected() && this.brackets.length === 0) {
      this.disconnect();
    }
    return write;
  }

  // ## Brackets and streams
  //
  // Packets can carry structure as bracket substreams: an `openBracket`
  // IP opens a stream, the packets belonging to it follow, and a
  // `closeBracket` IP closes it. Brackets nest, so tree structures can be
  // transmitted as a stream of packets. The stream name travels in the
  // bracket IP payloads — an `openBracket` for `article` followed by data
  // for its fields reads as:
  //
  // * `openBracket "article"`
  // * `data "Lorem ipsum"` (title)
  // * `data "Henri Bergius"` (author)
  // * `closeBracket "article"`
  //
  // Components are free to ignore brackets, but are recommended to
  // forward them onward if the data structures remain intact through
  // the component's processing — a stream that arrives grouped should
  // leave grouped.

  // ## Socket data delegation
  //
  // Sockets have the option to receive data from a delegate function
  // should the `send` method receive undefined for `data`.  This
  // helps in the case of defaulting values.
  setDataDelegate(delegate) {
    if (typeof delegate !== "function") {
      throw Error("A data delegate must be a function.");
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

    if (!this.from && !this.to) {
      return "UNDEFINED";
    }
    if (this.from && !this.to) {
      return `${fromStr(this.from)} -> ANON`;
    }
    if (!this.from) {
      return `DATA -> ${toStr(this.to)}`;
    }
    return `${fromStr(this.from)} -> ${toStr(this.to)}`;
  }
}

/**
 * @param {Object<string, any>} [metadata]
 * @param {InternalSocketOptions} [options]
 * @returns {InternalSocket}
 */
export function createSocket(metadata = {}, options = {}) {
  return new InternalSocket(metadata, options);
}
