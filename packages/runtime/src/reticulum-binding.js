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

import { encodeAnnounceAppData } from "@noflo/fbp-protocol";
import { Destination, DestType, Identity, LinkStatus } from "@reticulum/core";

/**
 * The default destination aspect runtimes announce under. A stable
 * discovery filter: the aspect name is never versioned (work document #4
 * §3); app_data is the version advertisement. Named for the protocol, not
 * any single runtime — NoFlo, MicroFlo, and other FBP runtimes share it.
 *
 * @type {string}
 */
export const DEFAULT_ASPECT = "fbp.runtime";

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
    destination.addEventListener("link_request", (/** @type {any} */ event) => {
      this.#onLinkRequest(event.detail).catch((error) => {
        this.#emit("error", { error, detail: event.detail });
      });
    });
    this.destination = destination;
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
    this.#wireLink(link);
  }

  /**
   * @param {import("@reticulum/core").Link} link
   * @returns {void}
   */
  #wireLink(link) {
    // Zero-trust auth: the link handshake verified cryptography; the peer's
    // `link.identify()` gives us its long-term identity. On verification,
    // unilaterally advertise what the identified peer may do (work document
    // #4 §4). Per-link DACAR capability narrowing is the application's
    // concern; the binding advertises the server's mask.
    link.addEventListener("identify", () => {
      this.server.authorize(link);
    });
    link.addEventListener("data", (/** @type {any} */ event) => {
      this.server.handleFrame(event.detail.packet.payload, link);
    });
    link.addEventListener("statuschange", (/** @type {any} */ event) => {
      if (event.detail.status === LinkStatus.CLOSED) {
        // Subscriptions and other per-link state live with the link.
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
