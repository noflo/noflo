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
/* @ts-self-types="./runtime-server.d.ts" */

import {
  CAPABILITY,
  CMD_BREAKPOINT_CLEAR,
  CMD_BREAKPOINT_SET,
  CMD_COMP_DETAIL_REQ,
  CMD_COMP_INSTALL_REQ,
  CMD_COMP_SYNC_REQ,
  CMD_COMP_WRITE,
  CMD_CRDT_SYNC_REQ,
  CMD_CRDT_UPDATE,
  CMD_HWM_SET,
  CMD_PROCESS_CTRL,
  CMD_PROCESS_LIST_REQ,
  CMD_PUBSUB_SUB,
  CMD_RUN_CTRL,
  capabilitiesMask,
  decodeFrame,
  encodeAuthResponse,
  LIMITATION,
  PROTOCOL_VERSION,
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
  [CMD_CRDT_SYNC_REQ]: CAPABILITY.GRAPH_READ,
  [CMD_CRDT_UPDATE]: CAPABILITY.GRAPH_EDIT,
  [CMD_COMP_SYNC_REQ]: CAPABILITY.COMPONENT_READ,
  [CMD_COMP_DETAIL_REQ]: CAPABILITY.COMPONENT_READ,
  [CMD_COMP_WRITE]: CAPABILITY.COMPONENT_WRITE,
  [CMD_COMP_INSTALL_REQ]: CAPABILITY.COMPONENT_WRITE,
  [CMD_PUBSUB_SUB]: CAPABILITY.TELEMETRY_READ,
  [CMD_RUN_CTRL]: CAPABILITY.LIFECYCLE_CTRL,
  [CMD_BREAKPOINT_SET]: CAPABILITY.LIFECYCLE_CTRL,
  [CMD_BREAKPOINT_CLEAR]: CAPABILITY.LIFECYCLE_CTRL,
  [CMD_PROCESS_CTRL]: CAPABILITY.LIFECYCLE_CTRL,
  [CMD_PROCESS_LIST_REQ]: CAPABILITY.GRAPH_READ,
  [CMD_HWM_SET]: CAPABILITY.LIFECYCLE_CTRL,
};

/**
 * Capability a client needs to *receive* a given command — the outbound
 * counterpart of {@link REQUIRED_CAPABILITY}. Broadcasts are fan-outs the
 * sender does not address; without this map a peer the runtime denied
 * would still receive every rebroadcast operation stream. Only
 * runtime→client commands the runtime broadcasts appear here; a command
 * with no entry is deliverable to any authorized context.
 *
 * @type {Record<number, number>}
 */
const OUTBOUND_CAPABILITY = {
  [CMD_CRDT_UPDATE]: CAPABILITY.GRAPH_READ,
};

/**
 * The transport-neutral FBP Protocol 2.0 runtime core.
 *
 * @extends {EventTarget}
 */
export class RuntimeServer extends EventTarget {
  /** @type {Map<any, number>} Per-context capability mask, set at authorize. */
  #contextCapabilities = new Map();

  /**
   * @param {object} options
   * @param {string[]|number} [options.capabilities] Capability names or a
   *   precomputed mask — the runtime's *advertised* technical surface. It
   *   is the ceiling every granted mask is filtered through: a capability
   *   the server does not advertise cannot be exercised no matter what the
   *   authorization plane grants. Defaults to the read surface a
   *   monitoring client needs (graph, telemetry, components read-only).
   * @param {(identityHash: string, context: any) => number|Promise<number>} options.capabilityPolicy
   *   Required. The authorization plane: resolves a verified peer's
   *   identity hash (and link context) to the granted capability mask —
   *   DACAR is the native implementation (see the `./dacar` subpath; wrap
   *   `DacarCapabilityPolicy#resolve`). The returned mask is filtered
   *   through the advertised surface; a rejection denies the peer entirely
   *   and surfaces as an `error` event. There is no static fallback store:
   *   a runtime without a plane denies everything, by construction.
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
  constructor(options) {
    super();
    if (typeof options.capabilityPolicy !== "function") {
      throw new Error(
        "RuntimeServer requires a capabilityPolicy — the authorization plane resolving peers to capability masks. There is no static fallback store; wrap DacarCapabilityPolicy#resolve for the native one.",
      );
    }
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
    this.capabilityPolicy = options.capabilityPolicy;
    this.limitationCode = options.limitationCode ?? LIMITATION.FULL_ACCESS;
    this.protocolVersion = options.protocolVersion ?? PROTOCOL_VERSION;
    /** @type {(bytes: Uint8Array, context: any) => void} */
    this.send = options.send ?? (() => {});
    /** @type {(bytes: Uint8Array, exceptContext?: any) => void} */
    this.broadcast = options.broadcast ?? (() => {});
    /** @type {Map<number, (decoded: any, context: any) => any>} */
    this.handlers = new Map();
    /** @type {Map<any, number>} Capability mask resolved per authorized context. */
    this.#contextCapabilities = new Map();
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
   * Resolve the capability mask an identity is granted right now, through
   * the authorization plane, filtered through the advertised surface. This
   * is the one resolution path the runtime core has — `authorize` applies
   * it when a link identifies, and transports consult it when an
   * identity-bearing request arrives outside a link's per-context mask
   * (e.g. a baseline resource fetch), so a plane revocation bites the next
   * fetch instead of the next link. A rejecting policy surfaces as a
   * throw; callers decide whether that is an error event or a silent
   * denial.
   *
   * @param {string|undefined} identityHash Hex hash of the peer's verified
   *   identity; without one the resolution denies closed.
   * @param {any} [context] The context the resolution serves — a link when
   *   one exists, so context-mapped policies resolve correctly.
   * @returns {Promise<number>} The granted capability mask.
   */
  async resolveCapabilities(identityHash, context) {
    if (identityHash === undefined) {
      // Fail closed: a peer without a verified identity has no grants.
      return 0;
    }
    const mask = await this.capabilityPolicy(identityHash, context);
    // The effective mask is the grant filtered through what this runtime
    // technically is: a capability the server did not advertise cannot be
    // exercised no matter what the authorization plane says. The auth
    // response and the per-frame enforcement both see the intersection.
    return mask & this.capabilityMask;
  }

  /**
   * Unilaterally send the `0x02 CMD_AUTH_RESPONSE` to one client context —
   * the mask the authorization plane grants the identified peer — filtered
   * through the advertised surface. The mask
   * is enforced per context from here on; the transport evicts the entry
   * when the context dies (forgetContext).
   *
   * @param {any} context
   * @param {string} [identityHash] Hex hash of the peer's verified identity;
   *   without one the context stays denied everything until it is
   *   authorized with one.
   * @returns {Promise<void>}
   */
  async authorize(context, identityHash) {
    let mask = 0;
    if (identityHash !== undefined) {
      try {
        mask = await this.resolveCapabilities(identityHash, context);
      } catch (error) {
        // A failing authorization plane denies closed: the peer gets no
        // capabilities until the plane answers again.
        this.#emit("error", { error, context });
      }
    }
    // Enforcement is per context from here on; the transport evicts the
    // entry when the context dies (forgetContext).
    this.#contextCapabilities.set(context, mask);
    this.send(
      encodeAuthResponse({
        protocolVersion: this.protocolVersion,
        capabilityMask: mask,
        limitationCode: this.limitationCode,
      }),
      context,
    );
  }

  /**
   * Drop a context's resolved capability mask — the transport calls this
   * when the context dies (a Reticulum link closes), keeping the store
   * from growing with every link. A forgotten context is denied
   * everything until it is authorized again.
   *
   * @param {any} context
   * @returns {void}
   */
  forgetContext(context) {
    this.#contextCapabilities.delete(context);
  }

  /**
   * The capability mask resolved for one context: the mask `authorize`
   * stored for it, or zero when the context was never authorized. A
   * transport uses this to keep unauthorized contexts out of fan-outs.
   *
   * @param {any} context
   * @returns {number}
   */
  grantedFor(context) {
    return this.#contextCapabilities.get(context) ?? 0;
  }

  /**
   * Whether a context may receive a runtime→client command: commands with
   * an outbound capability requirement are deliverable only to contexts
   * whose granted mask covers it. Transports consult this per broadcast
   * recipient, so a denied peer on a live link never sees operation
   * streams it was not granted.
   *
   * @param {any} context
   * @param {number|undefined} opcode Command code of the outbound frame.
   * @returns {boolean}
   */
  canReceive(context, opcode) {
    const required = OUTBOUND_CAPABILITY[/** @type {number} */ (opcode)];
    if (required === undefined) {
      return true;
    }
    const granted = this.grantedFor(context);
    return (granted & required) === required;
  }

  /**
   * Handle one inbound link frame: decode by leading opcode, check the
   * command's capability requirement against the context's granted mask, and
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
      // The raw hostile bytes stay out of the event detail beyond a
      // diagnostic prefix: transports log these events, and a peer must
      // not be able to amplify its way into the operator's log files.
      this.#emit("undecodable", {
        bytes: bytes.length > 256 ? bytes.slice(0, 256) : bytes,
        context,
        error,
      });
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
    // Fail closed: a context the transport never authorized has no
    // capabilities, whatever the authorization plane would say. The
    // pre-identification window of a link is attacker-controlled, so the
    // default mask must never be granted implicitly — only an explicit
    // authorize() resolves it for the context.
    const granted = this.#contextCapabilities.get(context) ?? 0;
    if (required !== undefined && (granted & required) !== required) {
      // The peer was not granted this capability: it is violating what its
      // auth response told it. Drop the frame.
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
