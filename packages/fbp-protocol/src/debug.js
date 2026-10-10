/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module debug
 * @description Execution control and debugging codecs (work document #4 §8):
 *   the `0x40` block. Run control — pause, resume, step (noflo/noflo-ui
 *   #243), data breakpoints (#245), per-process execution control (#317),
 *   and the live process listing (work document #4 update #9). All commands
 *   except the read-only listing require the `LIFECYCLE_CTRL` capability;
 *   notifications ride the existing telemetry stream as `0x06 LIFECYCLE`
 *   events (`0x05 PAUSED`, `0x06 RESUMED`) and `0x08 BREAKPOINT_HIT`
 *   flowtrace events; there are no dedicated ack frames, consistent with
 *   the rest of the protocol.
 */
/* @ts-self-types="./debug.d.ts" */

import { MsgPack } from "@reticulum/core";
import {
  CMD_BREAKPOINT_CLEAR,
  CMD_BREAKPOINT_SET,
  CMD_GET_STATUS,
  CMD_HWM_SET,
  CMD_PACKET_SEND,
  CMD_PROCESS_CTRL,
  CMD_PROCESS_LIST,
  CMD_PROCESS_LIST_REQ,
  CMD_RUN_CTRL,
  COMPONENT_TYPE,
  EXECUTION_STATE,
  PROCESS_ACTION,
  RUN_ACTION,
  RUN_STATE,
} from "./constants.js";
import { ProtocolError } from "./errors.js";

/**
 * A client-chosen identifier for a breakpoint: a non-empty string or a
 * non-negative integer, scoped to the link.
 *
 * @typedef {string|number} BreakpointId
 */

/**
 * Encode a `0x40 CMD_RUN_CTRL`: `[0x40, action]`. Pause stops the processing
 * of queued events — in-flight packets complete and further packets keep
 * buffering under the runtime's backpressure policy. Step processes exactly
 * one queued event and then remains paused.
 *
 * @param {number} action One of {@link RUN_ACTION}.
 * @returns {Uint8Array}
 */
export function encodeRunCtrl(action, planeId = undefined) {
  assertRunAction(action);
  return MsgPack.encode([CMD_RUN_CTRL, action, planeId ?? null]);
}

/**
 * Decode a `0x40 CMD_RUN_CTRL`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, action: number }}
 */
export function decodeRunCtrl(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_RUN_CTRL, 3);
  assertRunAction(frame[1], CMD_RUN_CTRL);
  return { cmd: CMD_RUN_CTRL, action: frame[1], planeId: frame[2] ?? null };
}

/**
 * Encode a `0x41 CMD_BREAKPOINT_SET`: `[0x41, breakpoint_id, node_id,
 * port]`. The runtime pauses when a packet arrives at the node's triggering
 * inport — any of them when `port` is null, otherwise the named one — and
 * emits `0x05 PAUSED` plus a `0x08 BREAKPOINT_HIT` flowtrace event.
 *
 * @param {object} breakpoint
 * @param {BreakpointId} breakpoint.breakpointId Client-chosen, scoped to the link.
 * @param {string} breakpoint.nodeId
 * @param {string|null} [breakpoint.port] Null matches any triggering inport.
 * @returns {Uint8Array}
 */
export function encodeBreakpointSet({ breakpointId, nodeId, port = null }) {
  assertId(breakpointId, CMD_BREAKPOINT_SET, "breakpoint_id");
  assertName(nodeId, CMD_BREAKPOINT_SET, "node_id");
  if (port !== null && (typeof port !== "string" || port.length === 0)) {
    throw new ProtocolError(
      "port must be a non-empty string or null (any triggering inport)",
      CMD_BREAKPOINT_SET,
    );
  }
  return MsgPack.encode([CMD_BREAKPOINT_SET, breakpointId, nodeId, port]);
}

/**
 * Decode a `0x41 CMD_BREAKPOINT_SET`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, breakpointId: BreakpointId, nodeId: string, port: string|null }}
 */
export function decodeBreakpointSet(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_BREAKPOINT_SET, 4);
  const [cmd, breakpointId, nodeId, port] = frame;
  assertId(breakpointId, cmd, "breakpoint_id");
  assertName(nodeId, cmd, "node_id");
  if (port !== null && (typeof port !== "string" || port.length === 0)) {
    throw new ProtocolError(
      "port must be a non-empty string or null (any triggering inport)",
      cmd,
    );
  }
  return { cmd, breakpointId, nodeId, port };
}

/**
 * Encode a `0x42 CMD_BREAKPOINT_CLEAR`: `[0x42, breakpoint_id]`. A null id
 * clears every breakpoint.
 *
 * @param {BreakpointId|null} breakpointId Null clears all breakpoints.
 * @returns {Uint8Array}
 */
export function encodeBreakpointClear(breakpointId) {
  if (breakpointId !== null) {
    assertId(breakpointId, CMD_BREAKPOINT_CLEAR, "breakpoint_id");
  }
  return MsgPack.encode([CMD_BREAKPOINT_CLEAR, breakpointId]);
}

/**
 * Decode a `0x42 CMD_BREAKPOINT_CLEAR`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, breakpointId: BreakpointId|null }}
 */
export function decodeBreakpointClear(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_BREAKPOINT_CLEAR, 2);
  if (frame[1] !== null) {
    assertId(frame[1], CMD_BREAKPOINT_CLEAR, "breakpoint_id");
  }
  return { cmd: CMD_BREAKPOINT_CLEAR, breakpointId: frame[1] };
}

/**
 * Encode a `0x43 CMD_PROCESS_CTRL`: `[0x43, node_id, action]`. A disabled
 * node stops activating; queued packets are kept, not dropped, and resume
 * processing when the node is enabled again.
 *
 * @param {object} control
 * @param {string} control.nodeId
 * @param {number} control.action One of {@link PROCESS_ACTION}.
 * @returns {Uint8Array}
 */
export function encodeProcessCtrl({ nodeId, action }) {
  assertName(nodeId, CMD_PROCESS_CTRL, "node_id");
  assertProcessAction(action);
  return MsgPack.encode([CMD_PROCESS_CTRL, nodeId, action]);
}

/**
 * Decode a `0x43 CMD_PROCESS_CTRL`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, nodeId: string, action: number }}
 */
export function decodeProcessCtrl(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_PROCESS_CTRL, 3);
  const [cmd, nodeId, action] = frame;
  assertName(nodeId, cmd, "node_id");
  assertProcessAction(action, cmd);
  return { cmd, nodeId, action };
}

/**
 * A process in the runtime's live graph: the component it resolves to, that
 * component's declared kind, and its execution state. The kind is declared
 * data — clients never infer stub-ness by joining component names against
 * their own registries (work document #4 update #9).
 *
 * @typedef {object} ProcessEntry
 * @property {string} component Library-namespaced component name.
 * @property {string} type One of {@link COMPONENT_TYPE}.
 * @property {number} state One of {@link EXECUTION_STATE}.
 */

/**
 * Process entries keyed by node id.
 *
 * @typedef {Record<string, ProcessEntry>} ProcessEntries
 */

/**
 * Encode a `0x44 CMD_PROCESS_LIST_REQ`: `[0x44]` — request the live process
 * listing of the runtime's current graph epoch.
 *
 * @returns {Uint8Array}
 */
export function encodeProcessListReq() {
  return MsgPack.encode([CMD_PROCESS_LIST_REQ]);
}

/**
 * Decode a `0x44 CMD_PROCESS_LIST_REQ`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number }}
 */
export function decodeProcessListReq(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_PROCESS_LIST_REQ, 1);
  return { cmd: CMD_PROCESS_LIST_REQ };
}

/**
 * Encode a `0x45 CMD_PROCESS_LIST`: `[0x45, epoch_id, entries]` where each
 * entry is the positional `[component, kind, state]` tuple. The listing is
 * the authoritative runtime view — the kind travels as declared data.
 *
 * @param {number|string} epochId The graph epoch the listing reflects.
 * @param {ProcessEntries} entries Node id to {@link ProcessEntry}.
 * @returns {Uint8Array}
 */
export function encodeProcessList(epochId, entries) {
  assertEntries(entries);
  /** @type {Record<string, [string, string, number]>} */
  const wire = {};
  for (const [nodeId, entry] of Object.entries(entries)) {
    wire[nodeId] = [entry.component, entry.type, entry.state];
  }
  return MsgPack.encode([CMD_PROCESS_LIST, epochId, wire]);
}

/**
 * Decode a `0x45 CMD_PROCESS_LIST`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, epochId: number|string, entries: ProcessEntries }}
 */
export function decodeProcessList(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_PROCESS_LIST, 3);
  const [cmd, epochId, wireEntries] = frame;
  assertWireEntries(wireEntries, cmd);
  /** @type {ProcessEntries} */
  const entries = {};
  for (const [nodeId, [component, type, state]] of Object.entries(
    wireEntries,
  )) {
    entries[nodeId] = { component, type, state };
  }
  return { cmd, epochId, entries };
}

/**
 * Encode a `0x46 CMD_HWM_SET`: `[0x46, high_water_mark]` — the
 * runtime-global high-water mark, the global default in the backpressure
 * hierarchy (edge metadata overrides it, port defaults sit between). `0`
 * is synchronous, `n` admits up to `n` in-flight packets, nil is unbounded.
 * Runtime configuration, not graph state; there is no ack frame — clients
 * observe the effective per-edge outcome through `0x0a EDGE_CAPACITY`
 * samples.
 *
 * @param {number|null} highWaterMark Non-negative integer or null (unbounded).
 * @returns {Uint8Array}
 */
export function encodeHwmSet(highWaterMark) {
  assertHighWaterMark(highWaterMark, CMD_HWM_SET);
  return MsgPack.encode([CMD_HWM_SET, highWaterMark]);
}

/**
 * Decode a `0x46 CMD_HWM_SET`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, highWaterMark: number|null }}
 */
export function decodeHwmSet(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_HWM_SET, 2);
  assertHighWaterMark(frame[1], CMD_HWM_SET);
  return { cmd: CMD_HWM_SET, highWaterMark: frame[1] };
}

/**
 * @param {any} frame
 * @param {number} opcode
 * @param {number} arity
 * @returns {void}
 */
function expectFrame(frame, opcode, arity) {
  if (!Array.isArray(frame) || frame[0] !== opcode) {
    throw new ProtocolError("unexpected frame opcode", opcode);
  }
  if (frame.length !== arity) {
    throw new ProtocolError(
      `frame must carry exactly ${arity} elements`,
      opcode,
    );
  }
}

/**
 * @param {number} action
 * @param {number} [opcode]
 * @returns {void}
 */
function assertRunAction(action, opcode) {
  if (!Object.values(RUN_ACTION).includes(action)) {
    throw new ProtocolError("unknown run action", opcode ?? CMD_RUN_CTRL);
  }
}

/**
 * @param {number} action
 * @param {number} [opcode]
 * @returns {void}
 */
function assertProcessAction(action, opcode) {
  if (!Object.values(PROCESS_ACTION).includes(action)) {
    throw new ProtocolError(
      "unknown process action",
      opcode ?? CMD_PROCESS_CTRL,
    );
  }
}

/**
 * A client-chosen identifier: non-empty string or non-negative integer.
 *
 * @param {any} id
 * @param {number} opcode
 * @param {string} field
 * @returns {void}
 */
function assertId(id, opcode, field) {
  const valid =
    (typeof id === "string" && id.length > 0) ||
    (typeof id === "number" && Number.isInteger(id) && id >= 0);
  if (!valid) {
    throw new ProtocolError(
      `${field} must be a non-empty string or a non-negative integer`,
      opcode,
    );
  }
}

/**
 * A high-water mark: non-negative integer (0 synchronous, n admitted
 * in-flight) or null (unbounded).
 *
 * @param {any} highWaterMark
 * @param {number} opcode
 * @returns {void}
 */
function assertHighWaterMark(highWaterMark, opcode) {
  if (
    highWaterMark !== null &&
    (typeof highWaterMark !== "number" ||
      !Number.isInteger(highWaterMark) ||
      highWaterMark < 0)
  ) {
    throw new ProtocolError(
      "high_water_mark must be a non-negative integer or null (unbounded)",
      opcode,
    );
  }
}

/**
 * @param {string} name
 * @param {number} opcode
 * @param {string} field
 * @returns {void}
 */
function assertName(name, opcode, field) {
  if (typeof name !== "string" || name.length === 0) {
    throw new ProtocolError(`${field} must be a non-empty string`, opcode);
  }
}

/**
 * @param {ProcessEntries} entries
 * @returns {void}
 */
function assertEntries(entries) {
  if (
    entries === null ||
    typeof entries !== "object" ||
    Array.isArray(entries)
  ) {
    throw new ProtocolError(
      "process entries must be a map of node id to process entry",
      CMD_PROCESS_LIST,
    );
  }
  for (const [nodeId, entry] of Object.entries(entries)) {
    assertName(nodeId, CMD_PROCESS_LIST, "node id");
    assertEntry(entry, nodeId);
  }
}

/**
 * @param {Record<string, any>} entries Raw wire entries: node id → [component, kind, state].
 * @param {number} opcode
 * @returns {void}
 */
function assertWireEntries(entries, opcode) {
  if (
    entries === null ||
    typeof entries !== "object" ||
    Array.isArray(entries)
  ) {
    throw new ProtocolError(
      "process entries must be a map of node id to [component, kind, state] tuple",
      opcode,
    );
  }
  for (const [nodeId, tuple] of Object.entries(entries)) {
    assertName(nodeId, opcode, "node id");
    if (
      !Array.isArray(tuple) ||
      tuple.length !== 3 ||
      typeof tuple[0] !== "string" ||
      tuple[0].length === 0 ||
      !Object.values(COMPONENT_TYPE).includes(tuple[1]) ||
      !Object.values(EXECUTION_STATE).includes(tuple[2])
    ) {
      throw new ProtocolError(
        `process entry for ${nodeId} must be a [component, kind, state] tuple carrying a declared component kind and execution state`,
        opcode,
      );
    }
  }
}

/**
 * @param {ProcessEntry} entry
 * @param {string} nodeId
 * @returns {void}
 */
function assertEntry(entry, nodeId) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new ProtocolError(
      `process entry for ${nodeId} must be a map with component, type, and state`,
      CMD_PROCESS_LIST,
    );
  }
  assertName(entry.component, CMD_PROCESS_LIST, "component");
  if (!Object.values(COMPONENT_TYPE).includes(entry.type)) {
    throw new ProtocolError(
      `process entry for ${nodeId} must declare a component kind from the shared vocabulary`,
      CMD_PROCESS_LIST,
    );
  }
  if (!Object.values(EXECUTION_STATE).includes(entry.state)) {
    throw new ProtocolError(
      `process entry for ${nodeId} must carry an execution state`,
      CMD_PROCESS_LIST,
    );
  }
}

/**
 * Encode a `0x47 CMD_PACKET_SEND`: send one packet into a running
 * network's inport — `[0x47, plane_id, port, payload]` (work document #4
 * update #36). The plane addresses the graph instance (nil = the main
 * graph); the port is an inport name — an exported port of the main plane,
 * or an inport of an ephemeral plane's fixture. One command serves
 * interactive packet injection and the remote fbp-spec runner's sequenced
 * case inputs, and makes a runtime usable as a remote component in another
 * network. Requires `LIFECYCLE_CTRL`.
 *
 * @param {object} packet
 * @param {number|string|null} packet.planeId nil addresses the main plane.
 * @param {string} packet.port Inport name.
 * @param {any} packet.payload
 * @returns {Uint8Array}
 */
export function encodePacketSend({ planeId, port, payload }) {
  if (typeof port !== "string" || port.length === 0) {
    throw new ProtocolError("port must be a non-empty string", CMD_PACKET_SEND);
  }
  return MsgPack.encode([CMD_PACKET_SEND, planeId, port, payload]);
}

/**
 * Decode a `0x47 CMD_PACKET_SEND`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, planeId: number|string|null, port: string, payload: any }}
 */
export function decodePacketSend(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_PACKET_SEND, 4);
  const [cmd, planeId, port, payload] = frame;
  if (typeof port !== "string" || port.length === 0) {
    throw new ProtocolError("port must be a non-empty string", cmd);
  }
  return { cmd: CMD_PACKET_SEND, planeId, port, payload };
}

/**
 * Encode a `0x48 CMD_GET_STATUS` request: `[0x48]` (external review,
 * update #35: the `getstatus` equivalent — late subscribers and monitors
 * ask for the run state instead of inferring it from lifecycle events they
 * never saw). Requires `GRAPH_READ`.
 *
 * @returns {Uint8Array}
 */
export function encodeGetStatus() {
  return MsgPack.encode([CMD_GET_STATUS]);
}

/**
 * Decode a `0x48 CMD_GET_STATUS` request.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number }}
 */
export function decodeGetStatus(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_GET_STATUS, 1);
  return { cmd: CMD_GET_STATUS };
}

/**
 * Encode a `0x48 CMD_GET_STATUS` reply:
 * `[0x48, epoch_id, run_state, uptime_ms, advertised_mask]` — the main
 * plane's epoch, the {@link RUN_STATE}, the network's uptime in
 * milliseconds, and the runtime's full advertised capability surface (the
 * ceiling the peer's `0x02` granted mask was filtered through; the
 * external review's `allCapabilities` vs `capabilities` distinction).
 *
 * @param {object} status
 * @param {number|string} status.epochId The main plane's current epoch.
 * @param {number} status.runState One of {@link RUN_STATE}.
 * @param {number} status.uptimeMs Non-negative integer.
 * @param {number} status.advertisedMask
 * @returns {Uint8Array}
 */
export function encodeGetStatusRes({
  epochId,
  runState,
  uptimeMs,
  advertisedMask,
}) {
  if (!Object.values(RUN_STATE).includes(runState)) {
    throw new ProtocolError(
      "run_state must be from the vocabulary",
      CMD_GET_STATUS,
    );
  }
  if (!Number.isInteger(uptimeMs) || uptimeMs < 0) {
    throw new ProtocolError(
      "uptime_ms must be a non-negative integer",
      CMD_GET_STATUS,
    );
  }
  return MsgPack.encode([
    CMD_GET_STATUS,
    epochId,
    runState,
    uptimeMs,
    advertisedMask,
  ]);
}

/**
 * Decode a `0x48 CMD_GET_STATUS` reply.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, epochId: number|string, runState: number, uptimeMs: number, advertisedMask: number }}
 */
export function decodeGetStatusRes(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_GET_STATUS, 5);
  const [cmd, epochId, runState, uptimeMs, advertisedMask] = frame;
  if (!Object.values(RUN_STATE).includes(runState)) {
    throw new ProtocolError("run_state must be from the vocabulary", cmd);
  }
  if (!Number.isInteger(uptimeMs) || uptimeMs < 0) {
    throw new ProtocolError("uptime_ms must be a non-negative integer", cmd);
  }
  return { cmd: CMD_GET_STATUS, epochId, runState, uptimeMs, advertisedMask };
}
