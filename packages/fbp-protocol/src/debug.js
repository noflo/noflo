/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module debug
 * @description Execution control and debugging codecs (work document #4 §8):
 *   the `0x40` block. Run control — pause, resume, step (noflo/noflo-ui
 *   #243), data breakpoints (#245), and per-process execution control (#317)
 *   — replaces the debugging surface 1.x never had. All commands require the
 *   `LIFECYCLE_CTRL` capability. Notifications ride the existing telemetry
 *   stream as `0x06 LIFECYCLE` events (`0x05 PAUSED`, `0x06 RESUMED`) and
 *   `0x08 BREAKPOINT_HIT` flowtrace events; there are no dedicated ack
 *   frames, consistent with the rest of the protocol.
 */

import { MsgPack } from "@reticulum/core";
import {
  CMD_BREAKPOINT_CLEAR,
  CMD_BREAKPOINT_SET,
  CMD_PROCESS_CTRL,
  CMD_RUN_CTRL,
  PROCESS_ACTION,
  RUN_ACTION,
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
export function encodeRunCtrl(action) {
  assertRunAction(action);
  return MsgPack.encode([CMD_RUN_CTRL, action]);
}

/**
 * Decode a `0x40 CMD_RUN_CTRL`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, action: number }}
 */
export function decodeRunCtrl(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_RUN_CTRL, 2);
  assertRunAction(frame[1], CMD_RUN_CTRL);
  return { cmd: CMD_RUN_CTRL, action: frame[1] };
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
