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
 * The transport-neutral FBP Protocol 2.0 runtime core.
 *
 * @extends {EventTarget}
 */
export class RuntimeServer extends EventTarget {
  /** @type {Map<any, number>} Per-context capability mask, set at authorize. */
  #contextCapabilities = new Map();

  /**
   * @param {object} [options]
   * @param {string[]|number} [options.capabilities] Capability names or a
   *   precomputed mask — the *default* mask, used for peers the DACAR store
   *   does not know; defaults to the full read surface a monitoring client
   *   needs (graph, telemetry, components read-only).
   * @param {{ default?: string[]|number, identities?: Record<string, string[]|number> }} [options.permissions]
   *   The built-in static capability store: identity hash (hex) to the
   *   capability mask that peer is granted, plus the mask for peers without
   *   an entry and for links that never identify. Mutable — changes take
   *   effect on the peer's next link. Ignored when `capabilityPolicy` is
   *   set.
   * @param {(identityHash: string, context: any) => number|Promise<number>} [options.capabilityPolicy]
   *   Pluggable capability resolution for identified peers — the seam for
   *   real authorization planes (DACAR is the native one, see the `./dacar`
   *   subpath). Receives the peer's verified identity hash and the link
   *   context; returns the granted capability mask. Consulted in place of
   *   the static store; a rejection denies the peer entirely and surfaces
   *   as an `error` event.
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
    /** @type {{ default: number, identities: Map<string, number> }} */
    this.permissions = this.#normalizePermissions(options.permissions);
    this.limitationCode = options.limitationCode ?? LIMITATION.FULL_ACCESS;
    this.capabilityPolicy = options.capabilityPolicy ?? null;
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
   * @param {{ default?: string[]|number, identities?: Record<string, string[]|number> }} [permissions]
   * @returns {{ default: number, identities: Map<string, number> }}
   */
  #normalizePermissions(permissions) {
    if (!permissions) {
      return { default: this.capabilityMask, identities: new Map() };
    }
    const asMask = (/** @type {string[]|number|undefined} */ value) =>
      value === undefined
        ? undefined
        : typeof value === "number"
          ? value
          : capabilitiesMask(value);
    const identities = new Map();
    for (const [hash, granted] of Object.entries(
      permissions.identities ?? {},
    )) {
      identities.set(hash, /** @type {number} */ (asMask(granted)));
    }
    return {
      default: asMask(permissions.default) ?? this.capabilityMask,
      identities,
    };
  }

  /**
   * Grant a capability set to one identity: the DACAR store's mutable face.
   * Takes effect on the peer's next link — the mask resolves at identify
   * time.
   *
   * @param {string} identityHash Hex identity hash of the peer.
   * @param {string[]|number} capabilities Capability names or a mask.
   * @returns {void}
   */
  grant(identityHash, capabilities) {
    this.permissions.identities.set(
      identityHash,
      typeof capabilities === "number"
        ? capabilities
        : capabilitiesMask(capabilities),
    );
  }

  /**
   * Remove an identity's entry: the peer falls back to the store's default
   * mask on its next link.
   *
   * @param {string} identityHash
   * @returns {void}
   */
  revoke(identityHash) {
    this.permissions.identities.delete(identityHash);
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
   * Unilaterally send the `0x02 CMD_AUTH_RESPONSE` to one client context —
   * the mask the identified peer is granted. Resolution order: the
   * pluggable `capabilityPolicy` when set (DACAR is the native one), then
   * the static store's identity entry, then the store's default. The mask
   * is enforced per context from here on; the transport evicts the entry
   * when the context dies (forgetContext).
   *
   * @param {any} context
   * @param {string} [identityHash] Hex hash of the peer's verified identity;
   *   without it the store's default mask applies and the context stays at
   *   that default for enforcement.
   * @returns {Promise<void>}
   */
  async authorize(context, identityHash) {
    let mask;
    if (identityHash !== undefined && this.capabilityPolicy) {
      try {
        mask = await this.capabilityPolicy(identityHash, context);
      } catch (error) {
        // A failing authorization plane denies closed: the peer gets no
        // capabilities until the plane answers again.
        this.#emit("error", { error, context });
        mask = 0;
      }
    } else {
      mask =
        (identityHash !== undefined
          ? this.permissions.identities.get(identityHash)
          : undefined) ?? this.permissions.default;
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
   * from growing with every link.
   *
   * @param {any} context
   * @returns {void}
   */
  forgetContext(context) {
    this.#contextCapabilities.delete(context);
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
    const granted =
      this.#contextCapabilities.get(context) ?? this.permissions.default;
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
