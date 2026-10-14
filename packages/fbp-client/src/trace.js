//     @noflo/fbp-client - Command-line tool for FBP Protocol 2.0
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @file trace module
 * @description The telemetry command functions (work document #34 phase
 *   3): live `watch` over the `0x30`/`0x32` stream, `capture` into a
 *   `0xF0` tracefile, and offline `replay` of a stored tracefile through
 *   the same decode path. The capture-and-replay round-trip is the
 *   reusable verification: both sides of the same decode path, no live
 *   runtime required.
 */

import {
  assembleTraceFile,
  encodeFlowtraceChunk,
  readTraceFile,
} from "@noflo/fbp-protocol";
import { TelemetryClient } from "@noflo/runtime-client";

/**
 * @typedef {import("./index.js").Session} Session
 */
/**
 * A decoded telemetry chunk (delta-applied, filtered).
 *
 * @typedef {import("@noflo/runtime-client").TelemetryClient} TelemetryClientType
 */
/**
 * @typedef {Object} TelemetryChunk
 * @property {string|number} subId
 * @property {number|string|null} planeId
 * @property {number} baseTimestampMs
 * @property {Array<{ timestampMs: number, timeDeltaMs: number, eventType: number, payload: any }>} events
 */

/**
 * `watch`: subscribe to the runtime's telemetry stream and deliver
 * decoded, filtered chunks to the callback. Runs until the link closes
 * (the protocol has no unsubscribe); `stop()` detaches the listener.
 *
 * @param {Session} session
 * @param {Object} [options]
 * @param {(chunk: TelemetryChunk) => void} [options.onChunk] - Chunk callback (default: none; attach later via the returned handle)
 * @param {number[]} [options.filtersTypes] - Event types to keep
 * @param {string} [options.subId] - Subscription id
 * @returns {Promise<{ stop: () => void, setOnChunk: (cb: (chunk: TelemetryChunk) => void) => void }>}
 */
export async function watch(session, options = {}) {
  const { onChunk, filtersTypes = [], subId } = options;
  const telemetry = new TelemetryClient({
    send: (payload) => session.client.send(payload),
    subId,
    filters: { types: filtersTypes },
  });
  if (onChunk) {
    telemetry.onChunk(onChunk);
  }
  const listener = (/** @type {any} */ event) => {
    telemetry.handleDecoded(event.detail);
  };
  session.client.addEventListener("telemetry", listener);
  await telemetry.subscribe();
  return {
    stop() {
      session.client.removeEventListener("telemetry", listener);
    },
    setOnChunk(cb) {
      telemetry.onChunk(cb);
    },
  };
}

/**
 * `trace`: watch and capture the `0x32` stream into a `0xF0` tracefile.
 * The recording is the snapshot frame (the mirror's canonical graph
 * definition) followed by every chunk in flush order.
 *
 * @param {Session} session
 * @param {Object} [options]
 * @param {number} [options.durationMs] - Capture window (default 5000ms)
 * @param {number[]} [options.filtersTypes] - Event types to keep
 * @param {any} [options.runtimeMetadata] - Free-form runtime identification embedded in the snapshot
 * @returns {Promise<Uint8Array>} The complete tracefile bytes
 */
export async function capture(session, options = {}) {
  const {
    durationMs = 5_000,
    filtersTypes = [],
    runtimeMetadata = null,
  } = options;
  /** @type {Uint8Array[]} */
  const chunks = [];
  const handle = await watch(session, {
    filtersTypes,
    onChunk: (chunk) => {
      // Re-encode the decoded chunk: the tracefile carries raw 0x32
      // frames; re-encoding from the delta-applied shape keeps the file
      // decodable by any readTraceFile consumer
      chunks.push(reencodeChunk(chunk));
    },
  });
  // The snapshot needs the canonical graph definition: sync the mirror
  const sync = await session.client.syncGraph();
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  handle.stop();
  return assembleTraceFile({
    runtimeMetadata,
    graphDefinition: sync.graph.serialize(),
    chunks,
    timestampMs: Date.now() - durationMs,
  });
}

/**
 * `replay <file>`: parse a stored tracefile and feed its chunks through
 * the same decode path as live watch — the offline half of the
 * capture-and-replay round-trip.
 *
 * @param {Uint8Array} bytes - The tracefile bytes
 * @param {Object} [options]
 * @param {(chunk: TelemetryChunk) => void} [options.onChunk] - Decoded, delta-applied chunk callback
 * @returns {{ snapshot: { formatVersion: number, timestampMs: number, runtimeMetadata: any, graphDefinition: any }, chunkCount: number }}
 */
export function replayTraceFile(bytes, options = {}) {
  const { onChunk } = options;
  const file = readTraceFile(bytes);
  const telemetry = new TelemetryClient({
    send: async () => {},
  });
  if (onChunk) {
    telemetry.onChunk(onChunk);
  }
  for (const chunk of file.chunks) {
    telemetry.handleDecoded(chunk);
  }
  return { snapshot: file.snapshot, chunkCount: file.chunks.length };
}

/**
 * Re-encode a decoded, delta-applied chunk into a raw `0x32` frame.
 *
 * @param {TelemetryChunk} chunk
 * @returns {Uint8Array}
 */
function reencodeChunk(chunk) {
  const base = chunk.baseTimestampMs;
  const events = chunk.events.map((event) => ({
    timeDeltaMs: event.timestampMs - base,
    eventType: event.eventType,
    payload: event.payload,
  }));
  return encodeFlowtraceChunk({
    subId: chunk.subId,
    planeId: chunk.planeId,
    baseTimestampMs: base,
    events,
  });
}
