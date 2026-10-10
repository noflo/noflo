/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module constants
 * @description Wire constants of FBP Protocol 2.0 over Reticulum (work
 *   document #4): command codes, capability mask bits, limitation codes,
 *   graph op types, flowtrace event types, and visual-state formats. All
 *   messages are flat positional MsgPack arrays — keyed dictionaries are
 *   banned on the wire to preserve radio airtime.
 */
/* @ts-self-types="./constants.d.ts" */

import { ProtocolError } from "./errors.js";

/**
 * Protocol generation advertised in the announce app_data and in the `0x02`
 * auth response (work document #4 updates #6 and #7). A single version
 * integer, bumped only on breaking wire changes; additive evolution (new
 * event enums, new commands) does not bump it. A runtime serves exactly its
 * current generation.
 *
 * @type {number}
 */
export const PROTOCOL_VERSION = 2;

/**
 * The destination aspect runtimes announce under: `fbp.runtime` (work
 * document #4 §3). A stable discovery filter — the aspect name is never
 * versioned, announce app_data is the version advertisement — and it is
 * named for the protocol, not any single runtime: NoFlo, MicroFlo, and
 * other FBP runtimes share one discovery namespace.
 *
 * @type {string}
 */
export const ANNOUNCE_ASPECT = "fbp.runtime";

// --- Transport & identity (0x00 - 0x0F) ---

/**
 * Auth response, sent unilaterally by the runtime after Reticulum fires
 * `link_established` with a verified identity. Layout per update #6:
 * `[0x02, protocol_version, capability_mask, limitation_code]` — the version
 * byte slots in ahead of the capability mask so stale or cached announces
 * surface a mismatch at link time.
 *
 * @type {number}
 */
export const CMD_AUTH_RESPONSE = 0x02;

/**
 * Capability mask bits carried in the auth response. The runtime maps the
 * verified Reticulum identity against its local DACAR capability store.
 *
 * @type {Record<string, number>}
 */
export const CAPABILITY = {
  GRAPH_READ: 0x01,
  GRAPH_EDIT: 0x02,
  METADATA_SYNC: 0x04,
  TELEMETRY_READ: 0x08,
  COMPONENT_READ: 0x10,
  COMPONENT_WRITE: 0x20,
  LIFECYCLE_CTRL: 0x40,
  ADMIN: 0x80,
};

/**
 * Limitation codes carried in the auth response.
 *
 * @type {Record<string, number>}
 */
export const LIMITATION = {
  FULL_ACCESS: 0x00,
  HARDWARE_CONSTRAINED: 0x01,
  PERMISSION_DENIED: 0x02,
  LINK_SATURATED: 0x03,
  CONCURRENCY_LOCK: 0x04,
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

// --- CRDT graph synchronization (0x10 - 0x1F) ---

/**
 * Client requests state sync: `[0x10, epoch_id, { "client_a": 15 }]`.
 *
 * @type {number}
 */
export const CMD_CRDT_SYNC_REQ = 0x10;

/**
 * Epochs match; no delta transfer needed: `[0x11]`.
 *
 * @type {number}
 */
export const CMD_CRDT_UP_TO_DATE = 0x11;

/**
 * Forces the client to fetch a baseline snapshot via the Reticulum Resource
 * API: `[0x12, new_epoch_id, rns_resource_hash]`.
 *
 * @type {number}
 */
export const CMD_CRDT_STALE_EPOCH = 0x12;

/**
 * CRDT-style positional graph operation, flowing both directions so
 * runtime-initiated changes converge to connected clients:
 * `[0x14, client_id, logical_clock, op_type, entity_id, payload]`.
 *
 * @type {number}
 */
export const CMD_CRDT_UPDATE = 0x14;

/**
 * Drop an ephemeral graph plane:
 * `[0x15, plane_id]` (work document #4 update #27). Stops the plane's
 * network if one is running and discards its state wholesale — the fbp-spec
 * runner's one-command fixture teardown. The main plane is not droppable:
 * nil is rejected, and subgraph planes follow their component's presence in
 * the graph (update #28's lifecycle matrix). Requires `LIFECYCLE_CTRL`.
 *
 * @type {number}
 */
export const CMD_PLANE_DROP = 0x15;

/**
 * List the runtime's graph planes: request `[0x16]`; the runtime answers
 * on the same opcode with
 * `[0x16, [[plane_id, kind, parent_plane, node_id, component_name, name], ...]]`
 * (work document #4 updates #30/#33). Every running graph instance is a
 * plane — the main graph, each subgraph instance anchored to its node id,
 * and client-minted ephemera — and this listing is the one map of the tree:
 * `{ plane_id, kind, parent_plane, node_id, component_name, name }` tuples,
 * with the component name resolving the plane to its catalog definition and
 * `name` carrying the client-minted label for ephemera. Requires
 * `GRAPH_READ`.
 *
 * @type {number}
 */
export const CMD_PLANE_LIST = 0x16;

/**
 * Reject a command or operation:
 * `[0x17, rejected_cmd, plane_id, detail]` (work document #4 updates
 * #34/#35). The runtime's explicit "no" — permission denials per plane,
 * Dacar-evaluation rejections, and structurally-rejected graph operations
 * alike, because silence never carries semantics (the `0x21` rationale).
 * `detail` is a MsgPack value: for rejected `0x14` operations it carries
 * `{ client_id, logical_clock, entity_id, reason }` so the client can
 * revert the op in its mirror and the changeset model holds; for other
 * commands it carries `{ reason, ... }`. Requires nothing: rejections are
 * always deliverable.
 *
 * @type {number}
 */
export const CMD_OP_REJECTED = 0x17;

/**
 * Kinds of graph planes in the `0x16` listing (work document #4 update
 * #28): the running main graph, subgraph instances anchored to their node
 * ids, and client-minted ephemeral fixtures.
 *
 * @type {Record<string, string>}
 */
export const PLANE_KIND = {
  MAIN: "main",
  SUBGRAPH: "subgraph",
  EPHEMERAL: "ephemeral",
};

/**
 * `0x14` op types. Per update #8 this block is an explicitly-mapped
 * projection of the changeset reference model owned by noflo-ui #43; modify
 * is encoded as tombstone + insert at the wire level, never as the semantic
 * unit. `UI_METADATA` operations are dropped by constrained nodes. The
 * insert vocabulary covers every structural entity kind of the graph
 * model — node `0x01`, edge `0x02`, IIP `0x03`, export `0x06`, group `0x07`
 * — so the projection table is total: every changeset op maps to a wire op.
 *
 * The `0x14` payload is the entity definition without its id — `entity_id`
 * carries it:
 *
 * - `INSERT_NODE`: `{ component, metadata? }`
 * - `INSERT_EDGE`: `{ from: { node, port, index? }, to: { node, port, index? }, metadata? }`
 * - `INSERT_IIP`: `{ to: { node, port, index? }, data, metadata? }`
 * - `INSERT_EXPORT`: `{ direction, public, internal: { node, port, index? }, metadata? }`
 * - `INSERT_GROUP`: `{ name, nodes: [nodeId...], metadata? }`
 * - `TOMBSTONE`: nil — the entity kind is resolved from the entity's
 *   registration at the receiver
 * - `UI_METADATA`: the metadata map; a nil `entity_id` addresses graph-level
 *   metadata
 *
 * @type {Record<string, number>}
 */
export const OP_TYPE = {
  INSERT_NODE: 0x01,
  INSERT_EDGE: 0x02,
  INSERT_IIP: 0x03,
  TOMBSTONE: 0x04,
  UI_METADATA: 0x05,
  INSERT_EXPORT: 0x06,
  INSERT_GROUP: 0x07,
};

// --- Component registry & code management (0x20 - 0x2F) ---

/**
 * Client requests registry sync: `[0x20, local_registry_hash]`.
 *
 * @type {number}
 */
export const CMD_COMP_SYNC_REQ = 0x20;

/**
 * Registry sync short-circuit: the client's `local_registry_hash` matches
 * the runtime's; no manifest follows (work document #4 §6). Mirrors the
 * graph block's `0x11`: the runtime always answers a `0x20` request —
 * silence never carries semantics, so the request/response pairing stays
 * unambiguous even on an otherwise-quiet link.
 *
 * @type {number}
 */
export const CMD_COMP_UP_TO_DATE = 0x21;

/**
 * Registry manifest of the Two-Step Cache:
 * `[0x22, new_registry_hash, { "math/Add": ["sig_hash_1", "elementary"], ... }]`.
 * Entries are valid with a signature and no source (work document #4 update
 * #8) and travel as `[sig_hash, kind]` tuples so the declared component
 * kind reaches clients without a details round-trip (#4 updates #9/#11).
 *
 * @type {number}
 */
export const CMD_COMP_MANIFEST = 0x22;

/**
 * Client requests only the unknown definitions:
 * `[0x23, ["math/Add"]]`.
 *
 * @type {number}
 */
export const CMD_COMP_DETAIL_REQ = 0x23;

/**
 * Component definitions from the registry:
 * `[0x24, { "math/Add": { "in": [...], "out": [...] } }]`. Succeeds for
 * stubs from the signature (update #8), carries the full #25 port field set
 * and the component type (updates #10 and #11).
 *
 * @type {number}
 */
export const CMD_COMP_DETAIL_RES = 0x24;

/**
 * Atomic full-source update:
 * `[0x25, component_name, source_string_or_rns_hash]`. For sources over 500
 * bytes clients SHOULD pass a Reticulum Resource hash instead of a raw
 * string. Writing source to a previously stub-only entry implements it while
 * the signature stays unchanged (update #10 item 4).
 *
 * @type {number}
 */
export const CMD_COMP_WRITE = 0x25;

/**
 * Dynamic ES module injection via HTTP, npm, or RNS: `[0x27, package_uri]`.
 * Third-party libraries MUST be compatible with EUPL-1.2. With the ecosystem
 * catalog (work document #26) the URI resolves through the catalog's
 * npm/JSR/version/hash provenance fields (update #10 item 3).
 *
 * @type {number}
 */
/**
 * Read a component's source from the runtime:
 * request `[0x26, component_name]`; the runtime answers on the same opcode
 * with `[0x26, component_name, source]` — nil source when the runtime holds
 * no source for the component (external review, update #35: the read
 * counterpart of `0x25`; pulls source from embedded devices, syncs a
 * project back). Requires `COMPONENT_READ`.
 *
 * @type {number}
 */
export const CMD_COMP_SOURCE = 0x26;

export const CMD_COMP_INSTALL_REQ = 0x27;

/**
 * Component kinds shared across the publish-time manifests (work document
 * #25), the loader's sidecar declarations (#24), and this protocol's
 * registry entries, detail responses, and process listings (#4 updates #9
 * and #11). The kind is declared data — clients never infer it from absence
 * of source or file layout. noflo-ui's fourth `ComponentSignature.type`
 * value, `inferred`, is client-side state for a runtime-advertised component
 * with no declared signature and never appears on the wire.
 *
 * @type {Record<string, string>}
 */
export const COMPONENT_TYPE = {
  ELEMENTARY: "elementary",
  SUBGRAPH: "subgraph",
  STUB: "stub",
};

// --- Live streaming telemetry (0x30 - 0x3F) ---

/**
 * Subscribe to a telemetry stream:
 * `[0x30, sub_id, target_type, target_id, requested_flush_interval_ms]`.
 * The flush interval is a request — execution frequency is the runtime's
 * physical-policy decision, never a protocol constant.
 *
 * @type {number}
 */
export const CMD_PUBSUB_SUB = 0x30;

/**
 * Buffered, delta-encoded execution trace chunk:
 * `[0x32, sub_id, base_timestamp_ms, [trace_events_array]]`. Each event is a
 * `[time_delta_ms, event_type, payload]` tuple.
 *
 * @type {number}
 */
export const CMD_FLOWTRACE_CHUNK = 0x32;

/**
 * Unified flowtrace event types carried in `0x32` chunks and reusable across
 * telemetry surfaces.
 *
 * @type {Record<string, number>}
 */
export const EVENT_TYPE = {
  DATA: 0x01,
  BEGIN_GROUP: 0x02,
  END_GROUP: 0x03,
  ERROR: 0x04,
  CONSOLE: 0x05,
  LIFECYCLE: 0x06,
  VISUAL_STATE: 0x07,
  /**
   * A data breakpoint fired: the payload is the positional tuple
   * `[breakpoint_id, node_id, port]`. The runtime is paused when this event
   * is emitted (a `0x05 PAUSED` lifecycle event accompanies it); the packet
   * itself travels as its own `0x01 DATA` event.
   */
  BREAKPOINT_HIT: 0x08,
  /**
   * An error raised by a stub component — the `StubNotImplementedError` of
   * the StubComponent contract (work document #19) — when a data packet
   * reaches a component with no implementation. The payload is the
   * exception string, exactly as in `0x04 ERROR`; the event type itself
   * classifies the error as *unimplemented* rather than a genuine component
   * failure (work document #4 update #9), with no string-parsing
   * convention.
   */
  STUB_ERROR: 0x09,
  /**
   * A backpressure sample: one event per edge per flush, the payload the
   * positional tuple `[edge_id, in_flight, desired_size]` — the number of
   * admitted in-flight packets and the live remaining capacity
   * (`desiredSize()`), nil when the edge is unbounded. Sampling rides the
   * subscription's flush cadence (the runtime's physical-policy decision)
   * and the sample's delta places it at flush time. Backpressure is normal
   * operation, not a fault: this is a data-channel observation, never an
   * error (work document #4 update #9).
   */
  EDGE_CAPACITY: 0x0a,
  /**
   * A connection opened: packets may now flow on the edge — the framing
   * 1.x UIs animate edge activity with (external review, update #35 point:
   * connection events). The payload is the positional tuple
   * `[src_node, src_port, tgt_node, tgt_port]`.
   */
  CONNECTION_OPEN: 0x0b,
  /**
   * A connection closed: the edge no longer carries packets. Payload as in
   * `0x0b CONNECTION_OPEN`.
   */
  CONNECTION_CLOSE: 0x0c,
};

/**
 * Lifecycle transition codes for `0x06 LIFECYCLE` event payloads. Pinned
 * per work document #4 §7 and update #1: a `FAILED` code encodes a failed
 * transition — a rejected `start()` leaves the runtime an honest message to
 * send. UIs render the transition as errored from the code itself, without
 * parsing exception strings; the detail travels in an accompanying `0x04
 * ERROR` flowtrace event, frugalized per local policy.
 *
 * `PAUSED` and `RESUMED` announce run-state changes of the execution
 * control block (§8): client-requested run control and breakpoint hits
 * alike, so every telemetry subscriber learns the state change, not only
 * the client that caused it.
 *
 * @type {Record<string, number>}
 */
export const LIFECYCLE_CODE = {
  START: 0x01,
  STOP: 0x02,
  SAFE_MODE: 0x03,
  FAILED: 0x04,
  PAUSED: 0x05,
  RESUMED: 0x06,
};

/**
 * Visual-state formats for `0x07 VISUAL_STATE` event payloads:
 * `[format_type, binary_pixels]`.
 *
 * @type {Record<string, number>}
 */
export const VISUAL_FORMAT = {
  FONTAWESOME: 0x01,
  NETPBM_MONO_84: 0x02,
  NETPBM_RGB_18: 0x03,
};

// --- Execution control & debugging (0x40 - 0x4F) ---

/**
 * Run control — pause, resume, or step the network:
 * `[0x40, action]` (work document #4 §8, noflo/noflo-ui #243).
 *
 * @type {number}
 */
export const CMD_RUN_CTRL = 0x40;

/**
 * Set a data breakpoint:
 * `[0x41, breakpoint_id, node_id, port]` (noflo/noflo-ui #245). The runtime
 * pauses when a packet arrives at the node's triggering inport (`port` nil
 * matches any) and emits `0x05 PAUSED` plus a `0x08 BREAKPOINT_HIT` event.
 *
 * @type {number}
 */
export const CMD_BREAKPOINT_SET = 0x41;

/**
 * Clear breakpoints: `[0x42, breakpoint_id]`. A nil id clears every
 * breakpoint.
 *
 * @type {number}
 */
export const CMD_BREAKPOINT_CLEAR = 0x42;

/**
 * Per-process execution control:
 * `[0x43, node_id, action]` (noflo/noflo-ui #317). Disabled state is
 * runtime-side execution state, not graph state — it does not travel the
 * CRDT op log.
 *
 * @type {number}
 */
export const CMD_PROCESS_CTRL = 0x43;

/**
 * Actions of `0x40 CMD_RUN_CTRL`. `STEP` processes exactly one queued event
 * and then remains paused; pause stops the processing of queued events while
 * in-flight packets complete and further packets keep buffering under the
 * runtime's backpressure policy. `START` and `STOP` drive the network's
 * lifecycle: a rejected start surfaces as a `0x04 FAILED` lifecycle event
 * with the detail in an accompanying `0x04 ERROR` event (work document #4
 * updates #1 and #20).
 *
 * @type {Record<string, number>}
 */
export const RUN_ACTION = {
  PAUSE: 0x01,
  RESUME: 0x02,
  STEP: 0x03,
  START: 0x04,
  STOP: 0x05,
};

/**
 * Actions of `0x43 CMD_PROCESS_CTRL`. A disabled node stops activating;
 * queued packets are kept, not dropped, and resume processing when the node
 * is enabled again.
 *
 * @type {Record<string, number>}
 */
export const PROCESS_ACTION = {
  DISABLE: 0x01,
  ENABLE: 0x02,
};

/**
 * Request the live process listing: `[0x44]` (work document #4 §8, update
 * #9). The runtime answers with the authoritative view of its current graph
 * epoch — clients never infer stub-ness by joining component names against
 * their own registries.
 *
 * @type {number}
 */
export const CMD_PROCESS_LIST_REQ = 0x44;

/**
 * The live process listing:
 * `[0x45, epoch_id, { "node-1": ["math/Add", "elementary", 0x01], ... }]`.
 * Each node carries the component it resolves to, that component's declared
 * kind (the shared vocabulary of {@link COMPONENT_TYPE}), and its execution
 * state ({@link EXECUTION_STATE}). The epoch correlates with the CRDT sync
 * handshake (`0x10`).
 *
 * @type {number}
 */
export const CMD_PROCESS_LIST = 0x45;

/**
 * Execution states of `0x45` process-list entries, mirroring the
 * `0x43 CMD_PROCESS_CTRL` actions: a disabled node stops activating while
 * its queued packets are kept.
 *
 * @type {Record<string, number>}
 */
export const EXECUTION_STATE = {
  ENABLED: 0x01,
  DISABLED: 0x02,
};

/**
 * Set the runtime-global high-water mark:
 * `[0x46, high_water_mark]` (work document #4 §8, update #9). The value is
 * a non-negative integer — `0` synchronous, `n` up to `n` admitted
 * in-flight packets — or nil (unbounded). It is the global default in the
 * backpressure hierarchy: edge metadata overrides it, port defaults sit
 * between. Runtime configuration, not graph state — it does not travel the
 * CRDT op log; clients observe the effective per-edge outcome through
 * `0x0a EDGE_CAPACITY` samples.
 *
 * @type {number}
 */
export const CMD_HWM_SET = 0x46;

/**
 * Send one packet into a running network's inport:
 * `[0x47, plane_id, port, payload]`. The plane addresses the graph instance
 * (nil = the main graph); the port is an inport name — an exported port of
 * the main plane, or an inport of an ephemeral plane's fixture. The same
 * command serves interactive packet injection and the remote fbp-spec
 * runner's sequenced case inputs, and makes a runtime usable as a remote
 * component in another network (work document #4 update #36). Requires
 * `LIFECYCLE_CTRL`.
 *
 * @type {number}
 */
export const CMD_PACKET_SEND = 0x47;

/**
 * Query the runtime's current run state:
 * request `[0x48]`; the runtime answers on the same opcode with
 * `[0x48, epoch_id, run_state, uptime_ms, advertised_mask]` — the epoch of
 * the main plane, the {@link RUN_STATE}, the network's uptime in
 * milliseconds, and the runtime's full advertised capability surface (the
 * ceiling the peer's `0x02` granted mask was filtered through; the
 * external-review `allCapabilities` vs `capabilities` distinction).
 * Requires `GRAPH_READ`.
 *
 * @type {number}
 */
export const CMD_GET_STATUS = 0x48;

/**
 * Run states of the `0x48` status reply, in `LIFECYCLE_CODE` vocabulary:
 * a network that never started is `STOPPED`; a rejected start reports
 * `FAILED` until the next attempt.
 *
 * @type {Record<string, number>}
 */
export const RUN_STATE = {
  STOPPED: 0x00,
  RUNNING: 0x01,
  PAUSED: 0x02,
  FAILED: 0x03,
};

// --- Streamable trace file format ---

/**
 * First frame of the streamable trace file: the topology snapshot
 * `[0xF0, format_ver, timestamp_ms, runtime_metadata, complete_graph_definition]`.
 * Frames 2..N are raw `0x32` chunk byte arrays appended sequentially.
 *
 * @type {number}
 */
export const TRACE_SNAPSHOT = 0xf0;
