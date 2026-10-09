/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module runtime-server
 * @description The transport-neutral core of `@noflo/runtime` (work document
 *   #28): receives protocol frames through `handleFrame`, dispatches them by
 *   command code to registered handlers, and emits outgoing frames through
 *   injected `send`/`broadcast` functions. A *context* is whatever the
 *   transport passes through — over Reticulum, the link (and its verified
 *   identity) a frame arrived on; the core never inspects it.
 *
 *   The core is isomorphic: no Node builtins, no transport construction.
 *   The Reticulum binding lives in the transport layer and is responsible
 *   for calling `authorize` when a link establishes and feeding received
 *   frames to `handleFrame`.
 */

import {
  CAPABILITY,
  CMD_BREAKPOINT_CLEAR,
  CMD_BREAKPOINT_SET,
  CMD_COMP_DETAIL_REQ,
  CMD_COMP_SYNC_REQ,
  CMD_COMP_WRITE,
  CMD_CRDT_UPDATE,
  CMD_HWM_SET,
  CMD_PROCESS_CTRL,
  CMD_PROCESS_LIST_REQ,
  CMD_PUBSUB_SUB,
  CMD_RUN_CTRL,
  decodeFrame,
  encodeAuthResponse,
  LIMITATION,
  PROTOCOL_VERSION,
  ProtocolError,
} from "@noflo/fbp-protocol";

/**
 * Capability a client needs to send a given command. Only client→runtime
 * commands appear here: runtime→client codes arriving inbound are simply
 * commands with no handler. Requests and control commands map to the mask
 * bits the auth response advertises — a client sending a command the
 * runtime did not advertise is dropped with a `notpermitted` event.
 *
 * @type {Record<number, number>}
 */
const REQUIRED_CAPABILITY = {
  [CMD_CRDT_UPDATE]: CAPABILITY.GRAPH_EDIT,
  [CMD_COMP_SYNC_REQ]: CAPABILITY.COMPONENT_READ,
  [CMD_COMP_DETAIL_REQ]: CAPABILITY.COMPONENT_READ,
  [CMD_COMP_WRITE]: CAPABILITY.COMPONENT_WRITE,
  [CMD_PUBSUB_SUB]: CAPABILITY.TELEMETRY_READ,
  [CMD_RUN_CTRL]: CAPABILITY.LIFECYCLE_CTRL,
  [CMD_BREAKPOINT_SET]: CAPABILITY.LIFECYCLE_CTRL,
  [CMD_BREAKPOINT_CLEAR]: CAPABILITY.LIFECYCLE_CTRL,
  [CMD_PROCESS_CTRL]: CAPABILITY.LIFECYCLE_CTRL,
  [CMD_PROCESS_LIST_REQ]: CAPABILITY.GRAPH_READ,
  [CMD_HWM_SET]: CAPABILITY.LIFECYCLE_CTRL,
};

/**
 * Compose a capability mask from {@link CAPABILITY} names. Unknown names
 * fail loudly: a typo'd capability would otherwise silently narrow the
 * advertised mask.
 *
 * @param {string[]} names Capability names, e.g. `["GRAPH_READ", "GRAPH_EDIT"]`.
 * @returns {number} Bitwise capability mask.
 * @throws {ProtocolError} On an unknown capability name.
 */
export function capabilitiesMask(names) {
  let mask = 0;
  for (const name of names) {
    const bit = CAPABILITY[name];
    if (bit === undefined) {
      throw new ProtocolError(`unknown capability name: ${name}`);
    }
    mask |= bit;
  }
  return mask;
}

/**
 * The transport-neutral FBP Protocol 2.0 runtime core.
 *
 * @extends {EventTarget}
 */
export class RuntimeServer extends EventTarget {
  /**
   * @param {object} [options]
   * @param {string[]|number} [options.capabilities] Capability names or a
   *   precomputed mask; defaults to the full read surface a monitoring
   *   client needs (graph, telemetry, components read-only).
   * @param {number} [options.limitationCode] One of {@link LIMITATION};
   *   defaults to full access.
   * @param {number} [options.protocolVersion] Defaults to {@link PROTOCOL_VERSION}.
   * @param {(bytes: Uint8Array, context: any) => void} [options.send] Deliver
   *   a frame to one client context.
   * @param {(bytes: Uint8Array, exceptContext?: any) => void} [options.broadcast] Deliver
   *   a frame to every authorized client context except the given one, if
   *   any — used to converge operation logs without echoing an operation
   *   back to its origin.
   */
  constructor(options = {}) {
    super();
    const capabilities = options.capabilities ?? [
      "GRAPH_READ",
      "METADATA_SYNC",
      "TELEMETRY_READ",
      "COMPONENT_READ",
    ];
    this.capabilityMask =
      typeof capabilities === "number"
        ? capabilities
        : capabilitiesMask(capabilities);
    this.limitationCode = options.limitationCode ?? LIMITATION.FULL_ACCESS;
    this.protocolVersion = options.protocolVersion ?? PROTOCOL_VERSION;
    /** @type {(bytes: Uint8Array, context: any) => void} */
    this.send = options.send ?? (() => {});
    /** @type {(bytes: Uint8Array, exceptContext?: any) => void} */
    this.broadcast = options.broadcast ?? (() => {});
    /** @type {Map<number, (decoded: any, context: any) => any>} */
    this.handlers = new Map();
  }

  /**
   * Register the handler for one command code. Handlers receive the typed
   * decoded frame (its `cmd` field carries the opcode) and the context the
   * frame arrived on.
   *
   * @param {number} opcode Command code from `@noflo/fbp-protocol`.
   * @param {(decoded: any, context: any) => any} handler Handlers may be
   *   async; rejections surface as `error` events like synchronous throws.
   * @returns {void}
   */
  registerHandler(opcode, handler) {
    this.handlers.set(opcode, handler);
  }

  /**
   * Unilaterally send the `0x02 CMD_AUTH_RESPONSE` to one client context.
   * The transport calls this when a Reticulum link establishes with a
   * verified identity — auth itself is the transport's job
   * (`link.identify()`); this only advertises what the identified peer may
   * do.
   *
   * @param {any} context
   * @returns {void}
   */
  authorize(context) {
    this.send(
      encodeAuthResponse({
        protocolVersion: this.protocolVersion,
        capabilityMask: this.capabilityMask,
        limitationCode: this.limitationCode,
      }),
      context,
    );
  }

  /**
   * Handle one inbound link frame: decode by leading opcode, check the
   * command's capability requirement against the advertised mask, and
   * dispatch to the registered handler. Frames the codec rejects — garbage
   * bytes, unknown opcodes, malformed payloads — do not throw: the protocol
   * has no error channel for them, and a runtime must survive hostile link
   * traffic. They surface as `undecodable` events instead. Commands the
   * runtime did not advertise a capability for are dropped with a
   * `notpermitted` event; commands with no handler yet emit
   * `unhandledframe`; handler failures surface as `error` events. None of
   * these escape to the transport.
   *
   * @param {Uint8Array} bytes
   * @param {any} context
   * @returns {void}
   */
  handleFrame(bytes, context) {
    /** @type {ReturnType<decodeFrame>|null} */
    let decoded = null;
    try {
      decoded = decodeFrame(bytes);
    } catch (error) {
      this.#emit("undecodable", { bytes, context, error });
      return;
    }
    const handler = this.handlers.get(decoded.cmd);
    if (!handler) {
      // A command with no handler is a runtime-side gap, not a client
      // error: surface it as an event, ignore on the wire.
      this.#emit("unhandledframe", { decoded, context });
      return;
    }
    const required = REQUIRED_CAPABILITY[decoded.cmd];
    if (
      required !== undefined &&
      (this.capabilityMask & required) !== required
    ) {
      // The runtime did not advertise this capability: the client is
      // violating what the auth response told it. Drop the frame.
      this.#emit("notpermitted", { decoded, context, required });
      return;
    }
    try {
      const result = handler(decoded, context);
      if (result instanceof Promise) {
        // Async handlers (WebCrypto hashing, registry I/O) must not let
        // rejections escape the dispatch loop either.
        result.catch((error) => {
          this.#emit("error", { error, context, decoded });
        });
      }
    } catch (error) {
      this.#emit("error", { error, context, decoded });
    }
  }

  /**
   * @param {string} type
   * @param {any} detail
   * @returns {void}
   */
  #emit(type, detail) {
    this.dispatchEvent(new globalThis.CustomEvent(type, { detail }));
  }
}
