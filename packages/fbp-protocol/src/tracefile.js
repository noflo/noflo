/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module tracefile
 * @description The streamable trace file format (work document #4 §10): a
 *   fully self-contained, append-only recording where frame 1 is the `0xF0`
 *   topology snapshot and frames 2..N are raw `0x32` flowtrace chunk frames
 *   appended sequentially as they flush from the engine. Frames are
 *   self-delimiting MsgPack values, so a recording can be parsed
 *   incrementally — including while it is still being written.
 */
/* @ts-self-types="./tracefile.d.ts" */

import { MsgPack } from "@reticulum/core";
import { TRACE_SNAPSHOT } from "./constants.js";
import { ProtocolError } from "./errors.js";
import { splitMsgpackFrames } from "./msgpack-frames.js";
import { decodeFlowtraceChunk, encodeFlowtraceChunk } from "./telemetry.js";

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
 * Assemble a complete trace file from the JSON state of the NoFlo core trace
 * recorder — the `toJSON()` output of `Flowtrace` from `@noflo/noflo` (work
 * document #23). The recorder owns the event model as data; this function
 * is the binary encoding: the snapshot state is MsgPack-framed as the
 * `0xF0` snapshot frame and the delta-encoded event tuples are projected to
 * a single `0x32` chunk frame (the recorder's tuples carry an optional
 * fourth metadata element, which the wire projection drops — payload stays
 * the raw value per work document #4 §7).
 *
 * This module deliberately has no dependency on `@noflo/noflo`; the state
 * is consumed duck-typed, and a round-trip spec in `@noflo/runtime` pins
 * the two representations together.
 *
 * @param {object} state The recorder's `toJSON()` output.
 * @param {{ formatVersion: number, timestampMs: number, runtimeMetadata: any,
 *   graphDefinition: any }} state.snapshot
 * @param {Array<[number, number, any, any?]>} state.chunks Delta-encoded
 *   event tuples; any fourth metadata element is projection-dropped.
 * @returns {Uint8Array} The complete trace file.
 * @throws {ProtocolError} When the state is malformed.
 */
export function assembleTraceFileFromRecorder(state) {
  const snapshot = state?.snapshot;
  if (!snapshot) {
    throw new ProtocolError("recorder state needs a snapshot", TRACE_SNAPSHOT);
  }
  if (!Array.isArray(state.chunks)) {
    throw new ProtocolError(
      "recorder state needs a chunks array",
      TRACE_SNAPSHOT,
    );
  }
  const chunks = [];
  if (state.chunks.length > 0) {
    chunks.push(
      encodeFlowtraceChunk({
        subId: 0,
        baseTimestampMs: snapshot.timestampMs,
        events: state.chunks.map((tuple) => ({
          timeDeltaMs: tuple[0],
          eventType: tuple[1],
          payload: tuple[2],
        })),
      }),
    );
  }
  return assembleTraceFile({
    runtimeMetadata: snapshot.runtimeMetadata,
    graphDefinition: snapshot.graphDefinition,
    chunks,
    timestampMs: snapshot.timestampMs,
    formatVersion: snapshot.formatVersion,
  });
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
