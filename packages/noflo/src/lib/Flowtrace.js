//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     NoFlo may be freely distributed under the MIT license

/**
 * @module Flowtrace
 * @description The native trace recorder for NoFlo networks (work document
 *   #23). Replaces the third-party `flowtrace` devDependency: the recorder
 *   captures network execution as delta-encoded event tuples in the FBP
 *   Protocol 2.0 telemetry vocabulary (work document #4 §7), and exports it
 *   as the JSON rendering of the streamable trace file format (§10).
 *
 *   The recorder owns the event model as data; the *binary* trace-file
 *   encoding lives in `@noflo/fbp-protocol` (`assembleTraceFileFromRecorder`),
 *   which consumes the `toJSON()` state. Neither package depends on the
 *   other: `fbp-protocol` must stay usable by non-NoFlo runtimes, and core
 *   must not drag MsgPack and the Reticulum stack into every consumer. The
 *   two representations are pinned together by a round-trip spec in
 *   `@noflo/runtime`.
 *
 *   Networks consume the recorder through the duck-typed `setFlowtrace`
 *   contract: `mainGraph`, `addGraph`, `addNetworkPacket`,
 *   `addNetworkStarted`, `addNetworkStopped`. External implementations of
 *   that contract keep working — this class is the shipped default, not a
 *   new coupling.
 */
/* @ts-self-types="./Flowtrace.d.ts" */

/**
 * Unified flowtrace event types carried in `0x32` chunks (work document
 * #4 §7). Mirrors `EVENT_TYPE` from `@noflo/fbp-protocol` — the values are
 * pinned to equality by the round-trip spec in `@noflo/runtime`, so the two
 * definitions cannot drift. `VISUAL_STATE` and the execution-control event
 * types (`BREAKPOINT_HIT`, `STUB_ERROR`, `EDGE_CAPACITY`) are protocol/UI
 * territory and are not recorded by the engine-side recorder. Process
 * activation events (`ACTIVATION_BEGIN`, `ACTIVATION_END`) *are* recorded
 * (work document #43): they are what makes trace replay answer "why didn't
 * the network finish" — the last activation that never deactivated is the
 * hung process. Boundary stream lifecycle (`CONNECTION_OPEN`,
 * `CONNECTION_CLOSE`) is recorded too (work documents #40, #45): the
 * client-driven streams' open and end-of-transmission are part of the
 * network's story.
 *
 * @type {Record<string, number>}
 */
export const EVENT_TYPE = {
  DATA: 0x01,
  BEGIN_BRACKET: 0x02,
  END_BRACKET: 0x03,
  ERROR: 0x04,
  CONSOLE: 0x05,
  LIFECYCLE: 0x06,
  CONNECTION_OPEN: 0x0b,
  CONNECTION_CLOSE: 0x0c,
  ACTIVATION_BEGIN: 0x0d,
  ACTIVATION_END: 0x0e,
  STRANDED: 0x0f,
};

/**
 * Lifecycle transition codes for `0x06 LIFECYCLE` event payloads. Mirrors
 * `LIFECYCLE_CODE` from `@noflo/fbp-protocol` (pinned by the same
 * round-trip spec). The engine recorder emits START and STOP; the full
 * vocabulary is defined here so failed transitions and run-control states
 * encode identically when a producer needs them.
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
 * Trace file format version. 1 is provisional pending the wire-format
 * freeze (work document #4).
 *
 * @type {number}
 */
export const TRACE_FORMAT_VERSION = 1;

/**
 * @typedef {Object} FlowtracePacketPort
 * @property {string} node
 * @property {string} port
 */

/**
 * Metadata envelope carried as the optional fourth element of a JSON event
 * tuple. The binary `0x32` projection (payload = raw value) drops it; the
 * JSON state keeps the full fidelity needed for sequence charts and
 * subgraph-aware replay. IP events carry all keys; activation events carry
 * `graph` and `subgraph` (work document #43); other event kinds carry
 * `graph` only.
 *
 * @typedef {Object} FlowtraceEventMeta
 * @property {string} graph Name the network is recorded under.
 * @property {string[]|null} [subgraph] Subgraph path of the event.
 * @property {FlowtracePacketPort|null} [src] Source node and port.
 * @property {FlowtracePacketPort|null} [tgt] Target node and port.
 * @property {string|null} [datatype] IP datatype.
 * @property {string|null} [schema] IP schema name.
 */

/**
 * @typedef {Object} FlowtraceSnapshot
 * @property {number} formatVersion
 * @property {number} timestampMs Epoch milliseconds of the recording start.
 * @property {any} runtimeMetadata Free-form runtime identifying information.
 * @property {any} graphDefinition The main graph's definition.
 * @property {Record<string, any>} graphs All registered graph definitions,
 *   including subgraphs.
 * @property {string|null} main Name of the main graph.
 */

/**
 * @typedef {Object} FlowtraceJson
 * @property {FlowtraceSnapshot} snapshot
 * @property {Array<[number, number, any, FlowtraceEventMeta|null]>} chunks
 *   Delta-encoded event tuples `[time_delta_ms, event_type, payload, meta]`.
 *   The first three elements are exactly what a binary `0x32` chunk carries;
 *   `meta` is the JSON-level enrichment envelope.
 */

/**
 * Make a value safe for the JSON export. Serialization failures must never
 * take down a recording: an unserializable DATA value is replaced with a
 * type-named placeholder, mirroring the protocol's frugalization policy
 * (work document #4 §7: frugalization is per local policy).
 *
 * @param {any} value
 * @returns {any}
 */
function frugalize(value) {
  if (value === null) {
    return null;
  }
  if (typeof value !== "object" && typeof value !== "function") {
    return value;
  }
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return `DATA ${typeof value}`;
  }
}

/**
 * The trace recorder. One instance records one execution: the main network
 * registers itself and its subgraphs, and the main network logs events from
 * the subgraphs with their subgraph paths (see `Network.setFlowtrace`).
 */
export class Flowtrace {
  /**
   * @param {object} [options]
   * @param {any} [options.runtimeMetadata] Free-form identifying
   *   information embedded in the snapshot (runtime name, host, version).
   * @param {number} [options.timestampMs] Recording start time; defaults to
   *   construction time.
   */
  constructor(options = {}) {
    const { runtimeMetadata = null, timestampMs = Date.now() } = options ?? {};
    /** @type {Record<string, any>} */
    this.graphs = {};
    /** @type {string|null} */
    this.mainGraphName = null;
    this.runtimeMetadata = runtimeMetadata;
    this.timestampMs = timestampMs;
    /** @type {{ timestampMs: number, eventType: number, payload: any, meta: FlowtraceEventMeta|null }[]} */
    this.events = [];
  }

  /**
   * Name of the main graph, as the duck-typed contract exposes it.
   *
   * @returns {string|null}
   */
  get mainGraph() {
    return this.mainGraphName;
  }

  /**
   * Register a graph definition with the recording. The main network passes
   * its definition with `main = true`; subgraph networks register under
   * their component names.
   *
   * @param {string} graphName
   * @param {any} graphDefinition
   * @param {boolean} [main]
   * @returns {void}
   */
  addGraph(graphName, graphDefinition, main = false) {
    this.graphs[graphName] = graphDefinition;
    if (main || this.mainGraphName === null) {
      this.mainGraphName = graphName;
    }
  }

  /**
   * Record a network packet event. Accepts the duck-typed event names the
   * network emits: `network:data`, `network:begingroup`,
   * `network:endgroup`.
   *
   * @param {string} event
   * @param {FlowtracePacketPort|null} src
   * @param {FlowtracePacketPort|null} tgt
   * @param {string} graph
   * @param {object} payload
   * @returns {void}
   */
  addNetworkPacket(event, src, tgt, graph, payload) {
    let eventType;
    let value;
    switch (event) {
      case "network:data": {
        eventType = EVENT_TYPE.DATA;
        // Snapshot at record time: a trace's contract is history, and
        // holding the payload reference fabricates it — the export
        // would carry the FINAL state of shared mutable objects for
        // every event carrying them, not the state at send (the
        // noflo-jekyll content race was invisible in traces for
        // exactly this reason). The recorder itself is already opt-in,
        // so the copy cost lands only on traced sessions; payloads
        // structuredClone cannot handle (functions, host objects) keep
        // the reference rather than dropping the event
        if (payload.data !== null && typeof payload.data === "object") {
          try {
            value = structuredClone(payload.data);
          } catch {
            value = payload.data;
          }
        } else {
          value = payload.data;
        }
        break;
      }
      case "network:begingroup": {
        eventType = EVENT_TYPE.BEGIN_BRACKET;
        value = payload.data ?? payload.group ?? "";
        break;
      }
      case "network:endgroup": {
        eventType = EVENT_TYPE.END_BRACKET;
        value = payload.data ?? payload.group ?? "";
        break;
      }
      default: {
        throw new Error(`Unknown network packet event ${event}`);
      }
    }
    this.#record(eventType, value, {
      graph,
      subgraph: payload.subgraph ?? null,
      src: src ?? null,
      tgt: tgt ?? null,
      datatype: payload.datatype ?? null,
      schema: payload.schema ?? null,
    });
  }

  /**
   * Record a network start as a `0x06 LIFECYCLE` START event.
   *
   * @param {string} graph
   * @returns {void}
   */
  addNetworkStarted(graph) {
    this.#record(EVENT_TYPE.LIFECYCLE, LIFECYCLE_CODE.START, { graph });
  }

  /**
   * Record a network stop as a `0x06 LIFECYCLE` STOP event.
   *
   * @param {string} graph
   * @returns {void}
   */
  addNetworkStopped(graph) {
    this.#record(EVENT_TYPE.LIFECYCLE, LIFECYCLE_CODE.STOP, { graph });
  }

  /**
   * Record a boundary stream lifecycle event: an external sender opened or
   * closed a stream into one of the graph's inports (`0x0b
   * CONNECTION_OPEN` / `0x0c CONNECTION_CLOSE`). The sender is outside the
   * graph, so only the receiving side is identified. Driver-attached
   * streams and IIP single-packet streams both surface here, making the
   * boundary end-of-transmission observable in the artifact (work
   * documents #40, #45).
   *
   * @param {string} graph
   * @param {{ node: string, port: string }|null} target
   * @param {boolean} open
   * @returns {void}
   */
  addNetworkConnection(graph, target, open) {
    this.#record(
      open ? EVENT_TYPE.CONNECTION_OPEN : EVENT_TYPE.CONNECTION_CLOSE,
      null,
      { graph, tgt: target ?? null },
    );
  }

  /**
   * Record a stranded-framing diagnostic as a `0x0f STRANDED` event:
   * bracket framing buffered on an input port whose senders have all
   * terminally disconnected — the framing can never pair with arriving
   * data. The residue is reported, not consumed; the payload is the flat
   * tuple `[node, port, scope|null, open_count, close_count]` (work
   * document #40 update #13).
   *
   * @param {string} graph
   * @param {string} node
   * @param {string} port
   * @param {string|null} scope
   * @param {number} open
   * @param {number} close
   * @returns {void}
   */
  addNetworkStranded(graph, node, port, scope, open, close) {
    this.#record(EVENT_TYPE.STRANDED, [node, port, scope, open, close], {
      graph,
    });
  }

  /**
   * Record a process error as a `0x04 ERROR` event. The payload is the
   * exception string, exactly as the wire carries it; the detail an
   * exception object would add is intentionally not preserved.
   *
   * @param {string} graph
   * @param {any} error
   * @returns {void}
   */
  addNetworkError(graph, error) {
    const err = error ?? "unknown error";
    const message =
      typeof err?.message === "string" ? err.message : String(err);
    this.#record(EVENT_TYPE.ERROR, message, { graph });
  }

  /**
   * Record process output as a `0x05 CONSOLE` event. The payload is the
   * positional tuple `[stream_id, log_string]`.
   *
   * @param {string} graph
   * @param {object} payload
   * @param {string} [payload.stream]
   * @param {any} [payload.message]
   * @returns {void}
   */
  addNetworkOutput(graph, payload) {
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : String(payload?.message ?? "");
    this.#record(EVENT_TYPE.CONSOLE, [payload?.stream ?? "output", message], {
      graph,
    });
  }

  /**
   * Record a process activation as an `0x0d ACTIVATION_BEGIN` event. The
   * payload is the positional tuple `[node_id, load]` — the load after the
   * increment (work document #43).
   *
   * @param {string} graph
   * @param {string} nodeId
   * @param {number} load
   * @param {string[]|null} [subgraph] Subgraph path of the event.
   * @returns {void}
   */
  addNetworkActivation(graph, nodeId, load, subgraph = null) {
    this.#record(EVENT_TYPE.ACTIVATION_BEGIN, [nodeId, load], {
      graph,
      subgraph: subgraph ?? null,
    });
  }

  /**
   * Record a process deactivation as an `0x0e ACTIVATION_END` event. The
   * payload is the positional tuple `[node_id, load]` — the load after the
   * decrement; `0` marks the node going idle (work document #43).
   *
   * @param {string} graph
   * @param {string} nodeId
   * @param {number} load
   * @param {string[]|null} [subgraph] Subgraph path of the event.
   * @returns {void}
   */
  addNetworkDeactivation(graph, nodeId, load, subgraph = null) {
    this.#record(EVENT_TYPE.ACTIVATION_END, [nodeId, load], {
      graph,
      subgraph: subgraph ?? null,
    });
  }

  /**
   * Append an event to the stream.
   *
   * @param {number} eventType
   * @param {any} payload
   * @param {FlowtraceEventMeta} meta
   * @returns {void}
   */
  #record(eventType, payload, meta) {
    this.events.push({
      timestampMs: Date.now(),
      eventType,
      payload,
      meta,
    });
  }

  /**
   * Export the recording as the JSON rendering of the streamable trace file
   * (work document #4 §10): the `0xF0` snapshot content first, then the
   * event stream as delta-encoded tuples. Payloads are frugalized lazily at
   * export time — an unserializable DATA value becomes a type-named
   * placeholder instead of failing the recording.
   *
   * The binary encoding of this state is
   * `assembleTraceFileFromRecorder` in `@noflo/fbp-protocol`; a round-trip
   * spec in `@noflo/runtime` pins the two representations together.
   *
   * @returns {FlowtraceJson}
   */
  toJSON() {
    return {
      snapshot: {
        formatVersion: TRACE_FORMAT_VERSION,
        timestampMs: this.timestampMs,
        runtimeMetadata: this.runtimeMetadata,
        graphDefinition: this.mainGraphName
          ? (this.graphs[this.mainGraphName] ?? null)
          : null,
        graphs: { ...this.graphs },
        main: this.mainGraphName,
      },
      chunks: this.events.map((event) => [
        Math.max(0, event.timestampMs - this.timestampMs),
        event.eventType,
        frugalize(event.payload),
        event.meta,
      ]),
    };
  }
}
