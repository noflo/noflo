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
  CMD_BREAKPOINT_CLEAR,
  CMD_BREAKPOINT_SET,
  CMD_HWM_SET,
  CMD_PACKET_SEND,
  CMD_PROCESS_CTRL,
  CMD_RUN_CTRL,
  decodeAnnounceAppData,
  decodeAuthResponse,
  decodeCompManifest,
  decodeCompSourceRes,
  decodeCrdtStaleEpoch,
  decodeCrdtUpdate,
  decodeCrdtUpToDate,
  decodeFlowtraceChunk,
  decodeFrame,
  decodeGetStatusRes,
  decodeOpRejected,
  decodePlaneListRes,
  decodeProcessList,
  encodeCompSourceReq,
  encodeCompSyncReq,
  encodeCompWrite,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  encodeGetStatus,
  encodePlaneList,
  PROTOCOL_VERSION,
} from "@noflo/fbp-protocol";
import { GraphModel } from "@noflo/graph";
import { Destination, Packet, PacketType } from "@reticulum/core";
import { ExecutionClient } from "./execution.js";
import { RegistryCache } from "./registry-cache.js";

export {
  ANNOUNCE_ASPECT,
  decodeAnnounceAppData,
  decodeAuthResponse,
  decodeCompManifest,
  decodeCrdtStaleEpoch,
  decodeCrdtUpdate,
  decodeCrdtUpToDate,
  decodeFlowtraceChunk,
  decodeGetStatusRes,
  decodeOpRejected,
  decodePlaneListRes,
  encodeCompManifest,
  encodeCompSourceRes,
  encodeCompSyncReq,
  encodeCrdtStaleEpoch,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  encodeCrdtUpToDate,
  encodeGetStatus,
  encodeGetStatusRes,
  encodePlaneList,
  encodePlaneListRes,
  encodePubsubSub,
  OP_TYPE,
  PROTOCOL_VERSION,
  RUN_STATE,
} from "@noflo/fbp-protocol";
export { ExecutionClient, PROCESS_ACTIONS, RUN_ACTIONS } from "./execution.js";

/**
 * The execution-control commands (`0x40`–`0x47`) the runtime may push to
 * clients; inbound frames of this family are re-emitted as typed
 * `execution` events.
 *
 * @type {Set<number>}
 */
const EXECUTION_CMDS = new Set([
  CMD_RUN_CTRL,
  CMD_BREAKPOINT_SET,
  CMD_BREAKPOINT_CLEAR,
  CMD_PROCESS_CTRL,
  CMD_HWM_SET,
  CMD_PACKET_SEND,
]);

/** @typedef {import("./registry-cache.js").CachedComponent} CachedComponent */
/** @typedef {import("./registry-cache.js").RegistryCatalog} RegistryCatalog */
export { RegistryCache } from "./registry-cache.js";
export { TelemetryClient } from "./telemetry.js";
export { UiEventSurface } from "./ui-events.js";

/**
 * Recall a previously learned runtime from the transport's known-destination
 * cache: announces do not reliably echo to late-joining clients within a
 * shared rnsd instance, so a client whose transport state persists (a
 * storage adapter) must be able to rediscover without waiting for the next
 * announce. The cache entries carry the announce app_data.
 *
 * @param {import("@reticulum/core").Reticulum} reticulum
 * @param {string|null} nodeName - Pin to one runtime name; nil accepts the first FBP runtime
 * @returns {{ destinationHash: Uint8Array, nodeName: string }|null}
 */
function recallRuntimeFromCache(reticulum, nodeName) {
  const cache = /** @type {any} */ (reticulum.transport)?.caches
    ?.knownDestinations;
  if (!cache) {
    return null;
  }
  /** @type {{ destinationHash: Uint8Array, nodeName: string }|null} */
  let firstMatch = null;
  for (const [hashHex, entry] of /** @type {any} */ (cache).entries()) {
    if (!entry?.appData) {
      continue;
    }
    try {
      const decoded = decodeAnnounceAppData(new Uint8Array(entry.appData));
      if (decoded.protocolVersion !== PROTOCOL_VERSION) {
        continue;
      }
      if (nodeName && decoded.nodeName !== nodeName) {
        continue;
      }
      const destinationHash = /** @type {any} */ (Uint8Array).fromHex(hashHex);
      // Prefer a destination whose path is still live: the cache may hold
      // several runs of the same runtime name under different identities,
      // and a dead one would waste the connect attempt
      if (reticulum.transport.nextHop?.(destinationHash)) {
        return { destinationHash, nodeName: decoded.nodeName };
      }
      firstMatch ??= { destinationHash, nodeName: decoded.nodeName };
    } catch {
      // Not an FBP announce; ignore.
    }
  }
  return firstMatch;
}

/**
 * Subscribe to announce events on a Reticulum instance and resolve with
 * the first FBP Protocol 2.0 runtime announcement (the §3 app_data decode
 * of work document #28). A runtime already known to the transport's
 * destination cache resolves immediately without waiting for an announce
 * echo — within a shared rnsd instance those do not reliably reach
 * late-joining clients.
 *
 * @param {Object} options
 * @param {import("@reticulum/core").Reticulum} options.reticulum - The local Reticulum instance
 * @param {number} [options.timeoutMs] - Reject after this long without a matching announce (default 30s)
 * @param {string} [options.nodeName] - Optionally pin the discovery to one runtime name
 * @param {boolean} [options.solicit] - Skip the cache and solicit a fresh announce (path
 *   request when the destination is known) — used when a cached path turned out stale
 * @returns {Promise<{ destinationHash: Uint8Array, nodeName: string }>} The discovered runtime
 */
export async function discoverRuntime(options) {
  const {
    reticulum,
    timeoutMs = 30_000,
    nodeName = null,
    solicit = false,
  } = options;
  // The destination cache hydrates asynchronously from the storage
  // adapter: recall only after the load promise settles
  await /** @type {any} */ (reticulum).persistorLoadPromise?.catch?.(() => {});
  const cached = solicit ? null : recallRuntimeFromCache(reticulum, nodeName);
  if (cached && reticulum.transport.nextHop?.(cached.destinationHash)) {
    // Known destination with a live path: connect straight away
    return cached;
  }
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
    if (cached) {
      // Known destination on a stale path: solicit a fresh announce via
      // a path request — the transport node answers with the runtime's
      // current announce, which the listener above catches
      reticulum.transport.requestPath(cached.destinationHash).catch(() => {
        // Best effort: a periodic announce may still arrive
      });
    }
  });
}

/**
 * A decoded `0x17` rejection: the runtime's explicit "no" to a command
 * (work document #4 updates #34/#35). For refused `0x14` operations the
 * detail carries `{ client_id, logical_clock, entity_id, reason }` so the
 * client can match the rejection to the op it sent and learn why it was
 * refused; for other commands it carries `{ reason, message? }`.
 *
 * @typedef {Object} OpRejection
 * @property {number} rejectedCmd - The command code that was refused
 * @property {number|string|null} planeId - The plane the refused command targeted
 * @property {any} detail - The rejection detail payload
 */

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
 * changes incrementally; inbound execution-control frames (`0x40`–`0x47`
 * family) as typed `execution` events.
 *
 * @extends EventTarget
 */
export class RuntimeClient extends EventTarget {
  /**
   * @param {Object} options
   * @param {import("@reticulum/core").Link} options.link - The established protocol link
   * @param {{ protocolVersion: number, capabilityMask: number }} options.auth - The decoded auth response
   * @param {string} [options.clientId] - This client's identity in the CRDT op stream; required before `sendGraphOp`
   */
  constructor({ link, auth, clientId }) {
    super();
    this.link = link;
    this.auth = auth;
    /**
     * This client's identity in the CRDT op stream, stamped onto every
     * outgoing `0x14` op. Set by the caller (work document #34 phase 4:
     * the CLI derives it from its persisted Reticulum identity) — ops
     * without a client id cannot be sent.
     *
     * @type {string|null}
     */
    this.clientId = clientId ?? null;
    /**
     * This client's logical clock, incremented per emitted op (work
     * document #4 §5). Monotonic within the process; persisting it
     * across sessions is not required — the runtime takes the max of
     * learned clocks.
     *
     * @type {number}
     */
    this.logicalClock = 0;
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

    /**
     * The Two-Step Cache registry client (work document #29 phase 3):
     * local-hash sync, sig-hash-keyed detail caching.
     *
     * @type {RegistryCache}
     */
    this.registry = new RegistryCache({
      requestReply: async (payload) => {
        const reply = this.nextFrame();
        await this.send(payload);
        return reply;
      },
    });

    /**
     * The execution-control sender (work document #29 phase 4):
     * run control, breakpoints, process control, packet injection.
     *
     * @type {import("./execution.js").ExecutionClient}
     */
    this.execution = new ExecutionClient({
      send: (payload) => this.send(payload),
    });

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
        // Not a 0x14 frame; try the rejection.
      }
      try {
        const rejection = /** @type {any} */ (decodeOpRejected(payload));
        if (rejection.cmd === 0x17) {
          this.dispatchEvent(
            new CustomEvent("oprejected", {
              detail: {
                rejectedCmd: rejection.rejectedCmd,
                planeId: rejection.planeId,
                detail: rejection.detail,
              },
            }),
          );
        }
      } catch {
        // Not a 0x17 frame; try the process listing.
      }
      try {
        const listing = /** @type {any} */ (decodeProcessList(payload));
        if (listing.cmd === 0x45) {
          this.dispatchEvent(
            new CustomEvent("processlist", {
              detail: { epochId: listing.epochId, entries: listing.entries },
            }),
          );
        }
      } catch {
        // Not a 0x45 frame; try the telemetry chunk.
      }
      try {
        const chunk = decodeFlowtraceChunk(payload);
        if (chunk.cmd === 0x32) {
          this.dispatchEvent(
            new CustomEvent("telemetry", {
              detail: /** @type {any} */ (chunk),
            }),
          );
        }
      } catch {
        // Not a 0x32 frame; try the execution-control family.
      }
      try {
        const execution = decodeFrame(payload);
        if (EXECUTION_CMDS.has(execution.cmd)) {
          this.dispatchEvent(
            new CustomEvent("execution", {
              detail: /** @type {any} */ (execution),
            }),
          );
        }
      } catch {
        // Not a decodable frame; surface as a generic frame event.
      }
      this.dispatchEvent(new CustomEvent("frame", { detail: { payload } }));
      // Reply queue: each frame goes to exactly one waiter, in arrival
      // order — concurrent requesters (the UI surface's parallel graph
      // and registry syncs) each get the reply addressed to them
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(payload);
      } else {
        // No waiter armed: buffer the frame for a later `nextFrame()`.
        // Bounded so an unread stream cannot grow without limit
        this.pending.push(payload);
        if (this.pending.length > 256) {
          this.pending.shift();
        }
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
   * Take the next inbound frame payload: a FIFO reply queue where each
   * frame is delivered to exactly one waiter, in arrival order. Frames
   * that arrived while no waiter was armed are served from the buffer.
   * The returned promise carries a `cancel()` — an abandoned waiter (the
   * sync loop re-arms per frame) must never reject into the void after
   * its consumer left.
   *
   * @param {number} [timeoutMs]
   * @returns {Promise<Uint8Array> & { cancel: () => void }}
   */
  nextFrame(timeoutMs = 15_000) {
    const existing = this.pending.shift();
    if (existing) {
      const resolved = /** @type {any} */ (Promise.resolve(existing));
      resolved.cancel = () => {};
      return resolved;
    }
    /** @type {(value: any) => void} */
    let waiter;
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    const promise = /** @type {any} */ (
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          const i = this.waiters.indexOf(waiter);
          if (i !== -1) {
            this.waiters.splice(i, 1);
          }
          reject(new Error("timed out waiting for a frame"));
        }, timeoutMs);
        waiter = (payload) => {
          clearTimeout(timer);
          resolve(payload);
        };
        this.waiters.push(waiter);
      })
    );
    promise.cancel = () => {
      clearTimeout(timer);
      const i = this.waiters.indexOf(waiter);
      if (i !== -1) {
        this.waiters.splice(i, 1);
      }
    };
    return promise;
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
   * Run the Two-Step Cache sync: compute the local registry hash from
   * the known catalog, request the manifest, fetch details for new or
   * changed components, and return the full catalog with signatures.
   *
   * @returns {Promise<RegistryCatalog>}
   */
  syncComponents() {
    return this.registry.sync();
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
   * Ask the runtime for its status (`0x48`): the main plane's epoch,
   * run state, uptime, and the full advertised capability mask.
   *
   * @returns {Promise<{ cmd: number, epochId: number|string, runState: number, uptimeMs: number, advertisedMask: number }>}
   */
  async status() {
    const reply = this.nextFrame();
    await this.send(encodeGetStatus());
    return decodeGetStatusRes(await reply);
  }

  /**
   * Read a component's source from the runtime (`0x26`): nil when the
   * runtime holds no source for the component.
   *
   * @param {string} componentName - Library-namespaced component name
   * @returns {Promise<{ cmd: number, componentName: string, source: string|null }>}
   */
  async getSource(componentName) {
    const reply = this.nextFrame();
    await this.send(encodeCompSourceReq(componentName));
    return decodeCompSourceRes(await reply);
  }

  /**
   * Write a component's full source to the runtime (`0x25`, atomic):
   * for sources over 500 bytes callers SHOULD pass a Reticulum Resource
   * hash instead of the raw string. The registry hash changes; the next
   * Two-Step sync picks up the new signature.
   *
   * @param {string} componentName - Library-namespaced component name
   * @param {string} source - Full source string or RNS resource hash
   * @returns {Promise<void>}
   */
  setSource(componentName, source) {
    return this.send(encodeCompWrite(componentName, source));
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
      } catch {
        // Neither an UP_TO_DATE nor a STALE_EPOCH frame: keep waiting
        // for the handshake reply
        reply = this.nextFrame(Math.max(1000, deadline - Date.now()));
        continue;
      }
      if (stale.cmd !== 0x12) {
        reply = this.nextFrame(Math.max(1000, deadline - Date.now()));
        continue;
      }
      this.epoch = stale.newEpochId;
      // Fetch the baseline; frames landing while the resource transfer is
      // in flight buffer in `pending` for the next `nextFrame()` caller
      const baseline = await this.link.request(stale.rnsResourceHash);
      // The runtime serves the canonical serialization (the epoch is its
      // content hash), not FBP JSON
      const canonical = JSON.parse(new TextDecoder().decode(baseline));
      this.graph = GraphModel.fromCanonical(canonical);
      return {
        upToDate: false,
        epochId: /** @type {string} */ (stale.newEpochId),
        graph: /** @type {GraphModel} */ (this.graph),
      };
    }
  }

  /**
   * Emit a `0x14` graph op to the runtime. The client id and logical
   * clock default to the client's own (`clientId`, `logicalClock`
   * incremented per emission) so callers send semantic ops without
   * touching CRDT bookkeeping.
   *
   * @param {Object} op
   * @param {number|string} [op.planeId] - the plane id (per the codec d.ts, non-nil)
   * @param {string} [op.clientId] - Defaults to the client's own id
   * @param {number} [op.logicalClock] - Defaults to the next clock tick
   * @param {number} op.opType
   * @param {string} op.entityId
   * @param {any} op.payload
   * @returns {Promise<void>}
   */
  async sendGraphOp(op) {
    const clientId = op.clientId ?? this.clientId;
    if (!clientId) {
      throw new Error(
        "the client has no CRDT identity: set clientId before emitting graph ops",
      );
    }
    let logicalClock = op.logicalClock;
    if (logicalClock === undefined) {
      this.logicalClock += 1;
      logicalClock = this.logicalClock;
    }
    await this.send(
      encodeCrdtUpdate({
        ...op,
        planeId: op.planeId ?? null,
        clientId,
        logicalClock,
      }),
    );
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
