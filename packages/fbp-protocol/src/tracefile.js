/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module tracefile
 * @description The streamable trace file format (work document #4 §9): a
 *   fully self-contained, append-only recording where frame 1 is the `0xF0`
 *   topology snapshot and frames 2..N are raw `0x32` flowtrace chunk frames
 *   appended sequentially as they flush from the engine. Frames are
 *   self-delimiting MsgPack values, so a recording can be parsed
 *   incrementally — including while it is still being written.
 */

import { MsgPack } from "@reticulum/core";
import { TRACE_SNAPSHOT } from "./constants.js";
import { ProtocolError } from "./errors.js";
import { splitMsgpackFrames } from "./msgpack-frames.js";
import { decodeFlowtraceChunk } from "./telemetry.js";

/**
 * Runtime metadata carried in the snapshot frame: free-form identifying
 * information (node name, runtime kind, firmware version, ...).
 *
 * @typedef {any} RuntimeMetadata
 */

/**
 * Encode the trace file's first frame — the topology snapshot:
 * `[0xF0, format_ver, timestamp_ms, runtime_metadata, complete_graph_definition]`.
 * Must be the first frame of a recording.
 *
 * @param {object} snapshot
 * @param {number} [snapshot.formatVersion] Trace file format version; defaults to 1 (provisional pending freeze).
 * @param {number} snapshot.timestampMs Epoch milliseconds of the recording start.
 * @param {RuntimeMetadata} snapshot.runtimeMetadata
 * @param {any} snapshot.graphDefinition Complete graph definition (the canonical graph serialization).
 * @returns {Uint8Array} The complete snapshot frame.
 */
export function encodeTraceSnapshot({
  formatVersion = 1,
  timestampMs,
  runtimeMetadata = null,
  graphDefinition,
}) {
  if (!Number.isInteger(timestampMs) || timestampMs < 0) {
    throw new ProtocolError(
      "timestamp_ms must be non-negative epoch milliseconds",
      TRACE_SNAPSHOT,
    );
  }
  if (!Number.isInteger(formatVersion) || formatVersion <= 0) {
    throw new ProtocolError(
      "format_ver must be a positive integer",
      TRACE_SNAPSHOT,
    );
  }
  return MsgPack.encode([
    TRACE_SNAPSHOT,
    formatVersion,
    timestampMs,
    runtimeMetadata,
    graphDefinition,
  ]);
}

/**
 * Assemble a complete trace file from a snapshot and already-encoded chunk
 * frames: snapshot frame first, then each raw `0x32` chunk in order.
 *
 * @param {object} options
 * @param {any} options.runtimeMetadata
 * @param {any} options.graphDefinition
 * @param {Uint8Array[]} options.chunks Encoded `0x32` chunk frames, in flush order.
 * @param {number} [options.timestampMs] Recording start; defaults to the current time.
 * @param {number} [options.formatVersion]
 * @returns {Uint8Array}
 */
export function assembleTraceFile({
  runtimeMetadata,
  graphDefinition,
  chunks,
  timestampMs = Date.now(),
  formatVersion = 1,
}) {
  if (!Array.isArray(chunks)) {
    throw new ProtocolError(
      "chunks must be an array of encoded 0x32 frames",
      TRACE_SNAPSHOT,
    );
  }
  for (const chunk of chunks) {
    // Validate now: a recording must never contain a non-chunk frame.
    decodeFlowtraceChunk(chunk);
  }
  const parts = [
    encodeTraceSnapshot({
      formatVersion,
      timestampMs,
      runtimeMetadata,
      graphDefinition,
    }),
    ...chunks,
  ];
  return concat(parts);
}

/**
 * Parse a complete trace file: the snapshot frame plus every appended chunk
 * in flush order.
 *
 * @param {Uint8Array} bytes
 * @returns {{ snapshot: { formatVersion: number, timestampMs: number, runtimeMetadata: RuntimeMetadata, graphDefinition: any }, chunks: ReturnType<typeof decodeFlowtraceChunk>[] }}
 * @throws {ProtocolError} When the first frame is not a snapshot or a later
 *   frame is not a chunk.
 */
export function readTraceFile(bytes) {
  const frames = splitMsgpackFrames(bytes);
  if (frames.length === 0) {
    throw new ProtocolError(
      "a trace file needs at least the snapshot frame",
      TRACE_SNAPSHOT,
    );
  }
  const snapshotFrame = MsgPack.decode(frames[0]);
  if (!Array.isArray(snapshotFrame) || snapshotFrame[0] !== TRACE_SNAPSHOT) {
    throw new ProtocolError(
      "the first frame of a trace file must be the 0xF0 snapshot",
      TRACE_SNAPSHOT,
    );
  }
  if (snapshotFrame.length !== 5) {
    throw new ProtocolError(
      "snapshot frame must carry opcode, format_ver, timestamp_ms, runtime_metadata, and graph_definition",
      TRACE_SNAPSHOT,
    );
  }
  const [, formatVersion, timestampMs, runtimeMetadata, graphDefinition] =
    snapshotFrame;
  if (!Number.isInteger(formatVersion) || formatVersion <= 0) {
    throw new ProtocolError(
      "format_ver must be a positive integer",
      TRACE_SNAPSHOT,
    );
  }
  if (!Number.isInteger(timestampMs) || timestampMs < 0) {
    throw new ProtocolError(
      "timestamp_ms must be non-negative epoch milliseconds",
      TRACE_SNAPSHOT,
    );
  }
  /** @type {ReturnType<typeof decodeFlowtraceChunk>[]} */
  const chunks = [];
  for (let i = 1; i < frames.length; i++) {
    const chunk = decodeFlowtraceChunk(frames[i]);
    chunks.push(chunk);
  }
  return {
    snapshot: { formatVersion, timestampMs, runtimeMetadata, graphDefinition },
    chunks,
  };
}

/**
 * @param {Uint8Array[]} parts
 * @returns {Uint8Array}
 */
function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}
