//     @noflo/runtime-client - FBP Protocol 2.0 client over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @file index module
 * @description The client side of FBP Protocol 2.0 (work document #29):
 *   discovery through announce app_data, zero-trust link establishment,
 *   the graph mirror (epoch handshake, baseline fetch, `0x14` op
 *   consumption), the Two-Step Cache registry client, and plane listing.
 *
 *   Isomorphic: plain ESM over `@reticulum/core` primitives — a Reticulum
 *   instance is injected by the caller, so browsers and server-side
 *   runners share the library. Transports (TCP, BLE, pipes) are provided
 *   by platform packages such as `@reticulum/node`.
 *
 *   Seeded from the runtime's `spec/integration-rnsd.js` hand-rolled
 *   client (work document #28).
 */

import {
  ANNOUNCE_ASPECT,
  CMD_AUTH_RESPONSE,
  CMD_COMP_MANIFEST,
  CMD_CRDT_STALE_EPOCH,
  CMD_CRDT_UP_TO_DATE,
  decodeAnnounceAppData,
  decodeAuthResponse,
  decodeCompManifest,
  decodeCrdtStaleEpoch,
  decodeCrdtUpdate,
  decodeCrdtUpToDate,
  decodePlaneListRes,
  encodeCompManifest,
  encodeCompSyncReq,
  encodeCrdtStaleEpoch,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  encodeCrdtUpToDate,
  encodePlaneList,
  encodePlaneListRes,
  PROTOCOL_VERSION,
} from "@noflo/fbp-protocol";
import { GraphModel, importFbpJson } from "@noflo/graph";
import { Destination, Packet, PacketType } from "@reticulum/core";

export {
  ANNOUNCE_ASPECT,
  decodeAnnounceAppData,
  decodeAuthResponse,
  decodeCompManifest,
  decodeCrdtStaleEpoch,
  decodeCrdtUpdate,
  decodeCrdtUpToDate,
  decodeFlowtraceChunk,
  decodePlaneListRes,
  encodeCompManifest,
  encodeCompSyncReq,
  encodeCrdtStaleEpoch,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  encodeCrdtUpToDate,
  encodePlaneList,
  encodePlaneListRes,
  encodePubsubSub,
  PROTOCOL_VERSION,
} from "@noflo/fbp-protocol";
export { ExecutionClient, PROCESS_ACTIONS, RUN_ACTIONS } from "./execution.js";
export { RegistryCache } from "./registry-cache.js";
export { TelemetryClient } from "./telemetry.js";

/**
 * Subscribe to announce events on a Reticulum instance and resolve with
 * the first FBP Protocol 2.0 runtime announcement (the §3 app_data decode
 * of work document #28).
 *
 * @param {Object} options
 * @param {import("@reticulum/core").Reticulum} options.reticulum - The local Reticulum instance
 * @param {number} [options.timeoutMs] - Reject after this long without a matching announce (default 30s)
 * @param {string} [options.nodeName] - Optionally pin the discovery to one runtime name
 * @returns {Promise<{ destinationHash: Uint8Array, nodeName: string }>} The discovered runtime
 */
export function discoverRuntime(options) {
  const { reticulum, timeoutMs = 30_000, nodeName = null } = options;
  return new Promise((resolve, reject) => {
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    const listener = (/** @type {any} */ event) => {
      if (!event.detail?.appData) {
        return;
      }
      try {
        const decoded = decodeAnnounceAppData(event.detail.appData);
        if (decoded.protocolVersion !== PROTOCOL_VERSION) {
          return;
        }
        if (nodeName && decoded.nodeName !== nodeName) {
          return;
        }
        cleanup();
        resolve({
          destinationHash: decoded.destinationHash,
          nodeName: decoded.nodeName,
        });
      } catch {
        // Not an FBP announce; ignore.
      }
    };
    function cleanup() {
      clearTimeout(timer);
      reticulum.transport.removeEventListener("announce", listener);
    }
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for a runtime announce"));
    }, timeoutMs);
    reticulum.transport.addEventListener("announce", listener);
  });
}

/**
 * Establish a protocol link to a discovered runtime: recall the announce
 * destination, create the link, identify with the client identity, and
 * wait for the runtime's unilateral `0x02` auth response (§4 of work
 * document #28) carrying the capability mask.
 *
 * @param {Object} options
 * @param {import("@reticulum/core").Reticulum} options.reticulum
 * @param {Uint8Array} options.destinationHash - The runtime's announce destination hash
 * @param {import("@reticulum/core").Identity} options.identity - The client identity used for `link.identify()`
 * @param {number} [options.timeoutMs] - Auth response timeout (default 15s)
 * @returns {Promise<{ link: import("@reticulum/core").Link, auth: { protocolVersion: number, capabilityMask: number }, client: RuntimeClient }>}
 */
export async function connectRuntime(options) {
  const { reticulum, destinationHash, identity, timeoutMs = 15_000 } = options;
  const destination = await Destination.recalled(
    ANNOUNCE_ASPECT,
    destinationHash,
    reticulum,
  );
  const link = await destination.createLink();

  /** @type {Uint8Array[]} */
  const frames = [];
  const frameListener = (/** @type {any} */ event) => {
    frames.push(event.detail.packet.payload);
  };
  link.addEventListener("data", frameListener);

  await link.identify(identity);
  const deadline = Date.now() + timeoutMs;
  while (frames.length === 0) {
    if (Date.now() > deadline) {
      link.removeEventListener("data", frameListener);
      throw new Error("timed out waiting for the 0x02 auth response");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const auth = decodeAuthResponse(frames[0]);
  if (auth.protocolVersion !== PROTOCOL_VERSION) {
    link.removeEventListener("data", frameListener);
    throw new Error(
      `protocol version mismatch: runtime ${auth.protocolVersion}, client ${PROTOCOL_VERSION}`,
    );
  }

  const client = new RuntimeClient({ link, auth });
  return { link, auth, client };
}

/**
 * The protocol client over an established link: frame send/receive, the
 * registry Two-Step Cache client, the graph mirror (epoch handshake,
 * baseline fetch, `0x14` op consumption), and plane listing.
 *
 * Extends EventTarget and re-emits every decoded `0x14` graph op as an
 * `op` event ({ planeId, op }) so mirror consumers can apply remote
 * changes incrementally.
 *
 * @extends EventTarget
 */
export class RuntimeClient extends EventTarget {
  /**
   * @param {Object} options
   * @param {import("@reticulum/core").Link} options.link - The established protocol link
   * @param {{ protocolVersion: number, capabilityMask: number }} options.auth - The decoded auth response
   */
  constructor({ link, auth }) {
    super();
    this.link = link;
    this.auth = auth;
    /** @type {GraphModel|undefined} The graph mirror for the main plane */
    this.graph = undefined;
    /** @type {number|string|undefined} The epoch the mirror was baselined at */
    this.epoch = undefined;
    /** @type {(op: any) => void} Applied for each remote `0x14` op */
    this.onGraphOp = () => {};

    /** @type {Uint8Array[]} */
    this.pending = [];
    /** @type {Array<(value: any) => void>} */
    this.waiters = [];
    link.addEventListener("data", (/** @type {any} */ event) => {
      const payload = event.detail.packet.payload;
      try {
        const op = /** @type {any} */ (decodeCrdtUpdate(payload));
        if (op.cmd === 0x14) {
          this.dispatchEvent(
            new CustomEvent("op", { detail: { planeId: op.planeId, op } }),
          );
          this.onGraphOp(op);
        }
      } catch {
        // Not a 0x14 frame; surface as a generic frame event.
      }
      this.dispatchEvent(new CustomEvent("frame", { detail: { payload } }));
      for (const waiter of this.waiters.splice(0)) {
        waiter(payload);
      }
    });
  }

  /**
   * Send a raw protocol payload over the link.
   *
   * @param {Uint8Array} payload
   * @returns {Promise<void>}
   */
  async send(payload) {
    // The link is the packet's destination: a bare DATA datagram with no
    // destination hash (the same shape the runtime's integration client
    // uses over an established link)
    const packet = new /** @type {any} */ (Packet)({
      packetType: PacketType.DATA,
      payload,
    });
    await this.link.send(packet);
  }

  /**
   * Wait for the next inbound frame payload.
   *
   * @param {number} [timeoutMs]
   * @returns {Promise<Uint8Array>}
   */
  nextFrame(timeoutMs = 15_000) {
    console.log("[dbg] nextFrame armed");
    const existing = this.pending.shift();
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i !== -1) {
          this.waiters.splice(i, 1);
        }
        reject(new Error("timed out waiting for a frame"));
      }, timeoutMs);
      /** @type {(value: any) => void} */
      const waiter = (payload) => {
        clearTimeout(timer);
        console.log("[dbg] waiter resolved");
        resolve(payload);
      };
      this.waiters.push(waiter);
    });
  }

  /**
   * Registry Two-Step Cache, client side: request the manifest for a
   * registry hash and return the decoded entry list.
   *
   * @param {string} [registryHash] - The locally computed registry hash ("stale" forces a full manifest)
   * @returns {Promise<{ cmd: number, entries: Object<string, any> }>}
   */
  async syncRegistry(registryHash = "stale") {
    // Arm the receive path before the request goes out: the reply may
    // arrive in the same tick as the send
    const reply = this.nextFrame();
    await this.send(encodeCompSyncReq(registryHash));
    return decodeCompManifest(await reply);
  }

  /**
   * List the runtime's graph planes (`0x16`).
   *
   * @returns {Promise<{ cmd: number, entries: any[] }>}
   */
  async planes() {
    const reply = this.nextFrame();
    await this.send(encodePlaneList());
    return decodePlaneListRes(await reply);
  }

  /**
   * The graph mirror sync (§5 of work document #28): run the epoch
   * handshake for the main plane. On `0x11 UP_TO_DATE` the existing
   * mirror stands; on `0x12 STALE_EPOCH` the canonical baseline is
   * fetched via `link.request` and imported into the mirror.
   *
   * @param {Object} [options]
   * @param {string} [options.planeId] - Plane id (nil = main graph)
   * @param {string} [options.epochId] - The client's current epoch ("0000" = no mirror)
   * @param {Object<string, number>} [options.clocks] - Per-client logical clocks
   * @param {number} [options.timeoutMs] - Baseline fetch timeout
   * @returns {Promise<{ upToDate: boolean, epochId: string, graph: GraphModel }>} The mirror after sync
   */
  async syncGraph(options = {}) {
    /** @type {number|string|undefined} */
    const currentEpoch = this.epoch;
    const {
      planeId = null,
      epochId = currentEpoch ?? "0000",
      clocks = {},
      timeoutMs = 30_000,
    } = options;
    let deadline = Date.now() + timeoutMs;
    let reply = this.nextFrame(Math.max(1000, deadline - Date.now()));
    await this.send(encodeCrdtSyncReq(planeId, epochId, clocks));
    for (;;) {
      const frame = await reply;
      deadline = Date.now() + timeoutMs;
      reply = this.nextFrame(Math.max(1000, deadline - Date.now()));
      try {
        const upToDate = decodeCrdtUpToDate(frame);
        if (upToDate.cmd === 0x11 && upToDate.epochId === epochId) {
          this.epoch = epochId;
          return {
            upToDate: true,
            epochId: /** @type {string} */ (epochId),
            graph: /** @type {GraphModel} */ (this.graph ?? new GraphModel()),
          };
        }
      } catch {
        // Not an UP_TO_DATE frame; try STALE_EPOCH.
      }
      let stale;
      try {
        stale = decodeCrdtStaleEpoch(frame);
      } catch (err) {
        console.log(`[dbg] stale decode skipped: ${err.message}`);
        continue;
      }
      if (stale.cmd !== 0x12) {
        continue;
      }
      this.epoch = stale.newEpochId;
      const baseline = await this.link.request(stale.rnsResourceHash);
      const canonical = JSON.parse(new TextDecoder().decode(baseline));
      this.graph = importFbpJson(canonical);
      return {
        upToDate: false,
        epochId: /** @type {string} */ (stale.newEpochId),
        graph: /** @type {GraphModel} */ (this.graph),
      };
    }
  }

  /**
   * Emit a `0x14` graph op to the runtime.
   *
   * @param {Object} op
   * @param {number|string} [op.planeId] - the plane id (per the codec d.ts, non-nil)
   * @param {string} op.clientId
   * @param {number} op.logicalClock
   * @param {number} op.opType
   * @param {string} op.entityId
   * @param {any} op.payload
   * @returns {Promise<void>}
   */
  async sendGraphOp(op) {
    await this.send(encodeCrdtUpdate({ ...op, planeId: op.planeId ?? null }));
  }

  /**
   * Tear down the link.
   *
   * @returns {Promise<void>}
   */
  async close() {
    await this.link.teardown();
  }
}
