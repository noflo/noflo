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
 * `0x14` op types. Per update #8 this block is an explicitly-mapped
 * projection of the changeset reference model owned by noflo-ui #43; modify
 * is encoded as tombstone + insert at the wire level, never as the semantic
 * unit. `UI_METADATA` operations are dropped by constrained nodes.
 *
 * @type {Record<string, number>}
 */
export const OP_TYPE = {
  INSERT_NODE: 0x01,
  INSERT_EDGE: 0x02,
  INSERT_IIP: 0x03,
  TOMBSTONE: 0x04,
  UI_METADATA: 0x05,
};

// --- Component registry & code management (0x20 - 0x2F) ---

/**
 * Client requests registry sync: `[0x20, local_registry_hash]`.
 *
 * @type {number}
 */
export const CMD_COMP_SYNC_REQ = 0x20;

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
 * runtime's backpressure policy.
 *
 * @type {Record<string, number>}
 */
export const RUN_ACTION = {
  PAUSE: 0x01,
  RESUME: 0x02,
  STEP: 0x03,
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

// --- Streamable trace file format ---

/**
 * First frame of the streamable trace file: the topology snapshot
 * `[0xF0, format_ver, timestamp_ms, runtime_metadata, complete_graph_definition]`.
 * Frames 2..N are raw `0x32` chunk byte arrays appended sequentially.
 *
 * @type {number}
 */
export const TRACE_SNAPSHOT = 0xf0;
