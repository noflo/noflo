/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module reticulum-binding
 * @description The Reticulum transport binding (work document #28 phase 6):
 *   binds a {@link import("./runtime-server.js").RuntimeServer} to the mesh.
 *   The binding owns the announce side of the RNS bootstrap (work document
 *   #4 §3) and the link lifecycle (§4); the runtime core owns everything
 *   else.
 *
 *   - A single-purpose IN destination announces under a stable aspect, its
 *     app_data the positional `msgpack([ protocol_version,
 *     destination_hash_raw16, node_name ])` of work document #4 §3 — a
 *     scanning client learns compatibility before spending link
 *     establishment airtime and Proof-of-Work.
 *   - Incoming LINKREQUESTs are answered; on each established link, the
 *     peer's verified identity (Reticulum's `link.identify()`, zero-trust)
 *     triggers the unilateral `0x02` auth response, and every decrypted
 *     DATA packet feeds the server's frame router with the link as context.
 *   - Epoch baselines for `0x12` stale-epoch replies are served through the
 *     link REQUEST/RESPONSE API: the resource token is the truncated SHA-256
 *     of the canonical graph bytes (content-addressed, like the epoch id
 *     itself), registered as the request path so a client can call
 *     `link.request(token)` with the token the wire carried.
 *
 *   Isomorphic: the binding never constructs interfaces — the application
 *   brings its own `Reticulum` instance (TCP on servers, WebSocket/WebRTC in
 *   browsers). The destination is injectable for testing.
 */

import {
  ANNOUNCE_ASPECT,
  decodeFrame,
  encodeAnnounceAppData,
} from "@noflo/fbp-protocol";
import {
  Destination,
  DestType,
  Identity,
  LinkStatus,
  Packet,
  PacketType,
} from "@reticulum/core";

/**
 * The default destination aspect runtimes announce under: the protocol's
 * {@link ANNOUNCE_ASPECT} (`fbp.runtime`) — a stable discovery filter named
 * for the protocol, not any single runtime.
 *
 * @type {string}
 */
export const DEFAULT_ASPECT = ANNOUNCE_ASPECT;

/**
 * @typedef {object} ReticulumBindingOptions
 * @property {import("./runtime-server.js").RuntimeServer} options.server
 * @property {import("@reticulum/core").Reticulum} options.reticulum The
 *   application's RNS instance, with its interfaces already attached.
 * @property {import("@reticulum/core").Identity} options.identity The
 *   runtime's long-term identity.
 * @property {string} options.nodeName Human-readable runtime node name,
 *   carried in the announce app_data.
 * @property {string} [options.aspect] Destination aspect; defaults to
 *   {@link DEFAULT_ASPECT}.
 * @property {number} [options.announceIntervalMs] Announce cadence — the
 *   runtime's physical-policy decision; defaults to the RNS library floor.
 * @property {boolean} [options.authorizeUnidentified] Grant the
 *   permissions store's default mask to peers that never identify, by
 *   authorizing each link at establishment. Off by default: an
 *   unidentified — and therefore unverified — peer is denied everything
 *   until it identifies, closing the attacker-controlled window between
 *   link establishment and identification.
 * @property {number} [options.maxResources] Budget for concurrently served
 *   baseline resources. Each `0x12` stale-epoch reply registers the
 *   current baseline under its content hash; without a cap a long-lived,
 *   heavily edited runtime would accumulate one full serialization per
 *   distinct graph state. Oldest-served baselines are evicted first.
 *   Defaults to 16.
 * @property {(binding: ReticulumBinding) => Promise<import("@reticulum/core").Destination>} [options.createDestination] Injectable
 *   destination factory for tests; the default builds the real IN
 *   destination from the binding's aspect, identity, and RNS instance.
 */
export class ReticulumBinding extends EventTarget {
  /**
   * @param {ReticulumBindingOptions} options
   */
  constructor(options) {
    super();
    this.server = options.server;
    this.reticulum = options.reticulum;
    this.identity = options.identity;
    this.nodeName = options.nodeName;
    this.aspect = options.aspect ?? DEFAULT_ASPECT;
    this.announceIntervalMs = options.announceIntervalMs;
    this.authorizeUnidentified = options.authorizeUnidentified ?? false;
    this.maxResources = options.maxResources ?? 16;
    this.createDestination =
      options.createDestination ??
      (async (binding) =>
        await Destination.IN(
          binding.aspect,
          DestType.SINGLE,
          binding.identity,
          binding.reticulum,
        ));
    /** @type {import("@reticulum/core").Destination|null} */
    this.destination = null;
    /** @type {Set<import("@reticulum/core").Link>} Live links, for broadcast. */
    this.links = new Set();
    /** @type {Map<string, Uint8Array>} Served baseline resources, token → bytes. */
    this.resources = new Map();
  }

  /**
   * Create the destination, encode the announce app_data, and start
   * announcing. Idempotent.
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (this.destination) {
      return;
    }
    const destination = await this.createDestination(this);
    destination.appData = encodeAnnounceAppData({
      destinationHash: destination.destinationHash,
      nodeName: this.nodeName,
    });
    // Bind the destination to the transport: without registration, inbound
    // LINKREQUESTs addressed to its hash are dropped as "not addressed to
    // us". Test fakes have no RNS instance to register with.
    this.reticulum.registerDestination?.(destination);
    destination.addEventListener("link_request", (/** @type {any} */ event) => {
      this.#onLinkRequest(event.detail).catch((error) => {
        this.#emit("error", { error, detail: event.detail });
      });
    });
    this.destination = destination;
    // The binding is the transport: from here on, the server's send and
    // broadcast deliver frames over links.
    this.server.send = (bytes, context) => this.deliver(bytes, context);
    this.server.broadcast = (bytes, exceptContext) =>
      this.broadcast(bytes, exceptContext);
    destination.startAnnouncing(
      this.announceIntervalMs === undefined
        ? {}
        : { intervalMs: this.announceIntervalMs },
    );
  }

  /**
   * Stop announcing; established links keep running.
   *
   * @returns {void}
   */
  stop() {
    this.destination?.stopAnnouncing();
  }

  /**
   * Serve bytes as a baseline resource for `0x12` stale-epoch replies.
   * Returns the resource token: the truncated SHA-256 of the bytes,
   * content-addressed like the epoch id. A client fetches it with
   * `link.request(token)`.
   *
   * @param {Uint8Array} bytes
   * @returns {Promise<string>}
   */
  async serveResource(bytes) {
    const token = toHex(await Identity.truncatedHash(bytes));
    this.resources.set(token, bytes);
    await this.destination?.registerRequestHandler(token, {
      responseGenerator: () => this.resources.get(token),
    });
    // Bound the served baselines: evict the oldest-served one and drop its
    // request handler, so graph churn cannot accumulate unbounded state.
    if (this.resources.size > this.maxResources) {
      const oldest = /** @type {string} */ (this.resources.keys().next().value);
      this.resources.delete(oldest);
      await this.destination?.removeRequestHandler?.(oldest);
    }
    return token;
  }

  /**
   * @param {{ packet: any, transport: any }} detail
   * @returns {Promise<void>}
   */
  async #onLinkRequest(detail) {
    const link = await this.destination?.respondToLinkRequest(detail.packet);
    if (!link) {
      return;
    }
    this.links.add(link);
    this.#wireLink(link);
  }

  /**
   * Deliver one frame to one link context.
   *
   * @param {Uint8Array} bytes
   * @param {any} context The link the frame is bound for.
   * @returns {void}
   */
  deliver(bytes, context) {
    if (typeof context?.send !== "function") {
      // Not a link context: frames only travel over links.
      this.#emit("error", {
        error: new Error("cannot deliver: context is not a link"),
        detail: { bytes },
      });
      return;
    }
    this.#transmit(context, bytes);
  }

  /**
   * Deliver one frame to every live link except the given one — but only
   * to links whose granted capabilities cover the frame's outbound
   * requirement: a peer the runtime denied must not receive operation
   * streams it was not granted, even though the link itself stays open.
   *
   * @param {Uint8Array} bytes
   * @param {any} [exceptContext]
   * @returns {void}
   */
  broadcast(bytes, exceptContext) {
    let opcode;
    try {
      opcode = decodeFrame(bytes).cmd;
    } catch {
      // The runtime's own frames decode; if one ever does not, deliver it
      // rather than silently dropping it.
      opcode = undefined;
    }
    for (const link of this.links) {
      if (link !== exceptContext && this.server.canReceive(link, opcode)) {
        this.#transmit(link, bytes);
      }
    }
  }

  /**
   * @param {import("@reticulum/core").Link} link
   * @param {Uint8Array} bytes
   * @returns {void}
   */
  #transmit(link, bytes) {
    // The link outbound path overrides the destination; the Packet typedef
    // marks destinationHash required regardless.
    const packet = new Packet(
      /** @type {any} */ ({ packetType: PacketType.DATA, payload: bytes }),
    );
    link.send(packet).catch((error) => {
      this.#emit("error", { error, detail: { link, bytes } });
    });
  }

  /**
   * @param {import("@reticulum/core").Link} link
   * @returns {void}
   */
  #wireLink(link) {
    // Fail closed by default: the link is denied everything until the peer
    // identifies. Deployments that affirmatively want open monitoring can
    // authorize unidentified links with the store's default mask; identify
    // then re-authorizes with the identity-specific mask.
    if (this.authorizeUnidentified) {
      this.server.authorize(link);
    }
    // Zero-trust auth: the link handshake verified cryptography; the peer's
    // `link.identify()` gives us its long-term identity. On verification,
    // unilaterally advertise what the identified peer may do (work document
    // #4 §4). Per-link DACAR capability narrowing is the application's
    // concern; the binding advertises the server's mask.
    link.addEventListener("identify", (/** @type {any} */ event) => {
      // The peer proved who it is: resolve its mask from the DACAR store
      // and enforce per context from here on.
      const identityHash = event.detail?.identity
        ? toHex(event.detail.identity.identityHash)
        : undefined;
      this.server.authorize(link, identityHash);
    });
    link.addEventListener("data", (/** @type {any} */ event) => {
      this.server.handleFrame(event.detail.packet.payload, link);
    });
    link.addEventListener("statuschange", (/** @type {any} */ event) => {
      if (event.detail.status === LinkStatus.CLOSED) {
        // Subscriptions and other per-link state live with the link.
        this.links.delete(link);
        this.server.forgetContext(link);
        this.#emit("linkclosed", { link });
      }
    });
    this.#emit("linkestablished", { link });
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

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
