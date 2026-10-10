/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module telemetry
 * @description Live streaming telemetry codecs (work document #4 §7):
 *   pub/sub subscriptions (`0x30`) and buffered, delta-encoded flowtrace
 *   chunks (`0x32`). Event storms never hit the wire raw: events buffer
 *   into chunks, each event carrying a uint32 millisecond delta from the
 *   chunk's base timestamp. Flush cadence is the runtime's physical-policy
 *   decision — the requested interval is a client wish, never a constant.
 */
/* @ts-self-types="./telemetry.d.ts" */

import { MsgPack } from "@reticulum/core";
import { CMD_FLOWTRACE_CHUNK, CMD_PUBSUB_SUB } from "./constants.js";
import { ProtocolError } from "./errors.js";

/**
 * A single flowtrace event as an application-level object: an absolute
 * event type and its payload, offset by a millisecond delta from the chunk
 * base.
 *
 * @typedef {object} FlowtraceEvent
 * @property {number} timeDeltaMs uint32 offset from the chunk's base_timestamp_ms.
 * @property {number} eventType One of {@link EVENT_TYPE}.
 * @property {any} payload Event-type-specific value.
 */

/**
 * An event with an absolute timestamp, as the engine emits it; converted to
 * deltas by {@link flowtraceChunk}.
 *
 * @typedef {object} TimestampedEvent
 * @property {number} timestampMs Absolute event time in epoch milliseconds.
 * @property {number} eventType One of {@link EVENT_TYPE}.
 * @property {any} payload Event-type-specific value.
 */

/**
 * Encode a `0x30 CMD_PUBSUB_SUB`:
 * `[0x30, sub_id, target_type, target_id, requested_flush_interval_ms]`.
 *
 * @param {object} sub
 * @param {string|number} sub.subId Client-chosen subscription identifier.
 * @param {string} sub.targetType What is subscribed to (e.g. a graph or network).
 * @param {string} sub.targetId Identifier of the target.
 * @param {number} sub.requestedFlushIntervalMs Client-requested flush cadence in milliseconds.
 * @returns {Uint8Array}
 */
export function encodePubsubSub({
  subId,
  targetType,
  targetId,
  requestedFlushIntervalMs,
}) {
  assertFlushInterval(requestedFlushIntervalMs);
  if (typeof targetType !== "string" || targetType.length === 0) {
    throw new ProtocolError(
      "target_type must be a non-empty string",
      CMD_PUBSUB_SUB,
    );
  }
  if (typeof targetId !== "string" || targetId.length === 0) {
    throw new ProtocolError(
      "target_id must be a non-empty string",
      CMD_PUBSUB_SUB,
    );
  }
  return MsgPack.encode([
    CMD_PUBSUB_SUB,
    subId,
    targetType,
    targetId,
    requestedFlushIntervalMs,
  ]);
}

/**
 * Decode a `0x30 CMD_PUBSUB_SUB`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, subId: string|number, targetType: string, targetId: string, requestedFlushIntervalMs: number }}
 */
export function decodePubsubSub(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_PUBSUB_SUB, 5);
  const [, subId, targetType, targetId, requestedFlushIntervalMs] = frame;
  if (typeof targetType !== "string" || targetType.length === 0) {
    throw new ProtocolError(
      "target_type must be a non-empty string",
      CMD_PUBSUB_SUB,
    );
  }
  if (typeof targetId !== "string" || targetId.length === 0) {
    throw new ProtocolError(
      "target_id must be a non-empty string",
      CMD_PUBSUB_SUB,
    );
  }
  assertFlushInterval(requestedFlushIntervalMs);
  return {
    cmd: CMD_PUBSUB_SUB,
    subId,
    targetType,
    targetId,
    requestedFlushIntervalMs,
  };
}

/**
 * Encode a `0x32 CMD_FLOWTRACE_CHUNK`:
 * `[0x32, sub_id, base_timestamp_ms, [trace_events_array]]` where each
 * event is the positional tuple `[time_delta_ms, event_type, payload]`.
 *
 * @param {object} chunk
 * @param {string|number} chunk.subId Subscription the chunk belongs to.
 * @param {number} chunk.baseTimestampMs Epoch milliseconds of delta zero.
 * @param {FlowtraceEvent[]} chunk.events Delta-encoded events in order.
 * @returns {Uint8Array}
 */
export function encodeFlowtraceChunk({ subId, baseTimestampMs, events }) {
  assertTimestamp(baseTimestampMs);
  return MsgPack.encode([
    CMD_FLOWTRACE_CHUNK,
    subId,
    baseTimestampMs,
    events.map(eventTuple),
  ]);
}

/**
 * Convenience builder: absolute-timestamped events in, a complete chunk
 * out. The base timestamp is the earliest event time; deltas are computed
 * from it. Events must arrive in chronological order.
 *
 * @param {object} chunk
 * @param {string|number} chunk.subId
 * @param {TimestampedEvent[]} chunk.events Chronologically ordered events.
 * @returns {Uint8Array}
 */
export function encodeFlowtraceChunkFromTimestamps({ subId, events }) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new ProtocolError(
      "a flowtrace chunk needs at least one event",
      CMD_FLOWTRACE_CHUNK,
    );
  }
  const baseTimestampMs = events[0].timestampMs;
  for (const event of events) {
    assertTimestamp(event.timestampMs);
    if (event.timestampMs < baseTimestampMs) {
      throw new ProtocolError(
        "events must arrive in chronological order",
        CMD_FLOWTRACE_CHUNK,
      );
    }
  }
  return encodeFlowtraceChunk({
    subId,
    baseTimestampMs,
    events: events.map((event) => ({
      timeDeltaMs: event.timestampMs - baseTimestampMs,
      eventType: event.eventType,
      payload: event.payload,
    })),
  });
}

/**
 * Decode a `0x32 CMD_FLOWTRACE_CHUNK`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, subId: string|number, baseTimestampMs: number, events: FlowtraceEvent[] }}
 */
export function decodeFlowtraceChunk(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_FLOWTRACE_CHUNK, 4);
  const [cmd, subId, baseTimestampMs, tuples] = frame;
  assertTimestamp(baseTimestampMs, cmd);
  if (!Array.isArray(tuples)) {
    throw new ProtocolError("trace_events_array must be an array", cmd);
  }
  /** @type {FlowtraceEvent[]} */
  const events = tuples.map((tuple) => {
    if (!Array.isArray(tuple) || tuple.length !== 3) {
      throw new ProtocolError(
        "each trace event must be a [time_delta_ms, event_type, payload] tuple",
        cmd,
      );
    }
    const [timeDeltaMs, eventType, payload] = tuple;
    if (
      !Number.isInteger(timeDeltaMs) ||
      timeDeltaMs < 0 ||
      timeDeltaMs > 0xffffffff
    ) {
      throw new ProtocolError("time_delta_ms must be a uint32", cmd);
    }
    return { timeDeltaMs, eventType, payload };
  });
  return { cmd, subId, baseTimestampMs, events };
}

/**
 * @param {FlowtraceEvent} event
 * @returns {any[]}
 */
function eventTuple(event) {
  if (event === null || typeof event !== "object") {
    throw new ProtocolError(
      "each trace event must be a [time_delta_ms, event_type, payload] tuple",
      CMD_FLOWTRACE_CHUNK,
    );
  }
  const { timeDeltaMs, eventType, payload } = event;
  if (
    !Number.isInteger(timeDeltaMs) ||
    timeDeltaMs < 0 ||
    timeDeltaMs > 0xffffffff
  ) {
    throw new ProtocolError(
      "time_delta_ms must be a uint32",
      CMD_FLOWTRACE_CHUNK,
    );
  }
  return [timeDeltaMs, eventType, payload];
}

/**
 * @param {number} timestamp
 * @param {number} [opcode]
 * @returns {void}
 */
function assertTimestamp(timestamp, opcode) {
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    throw new ProtocolError(
      "timestamps must be non-negative epoch milliseconds",
      opcode,
    );
  }
}

/**
 * @param {number} interval
 * @param {number} [opcode]
 * @returns {void}
 */
function assertFlushInterval(interval, opcode) {
  if (!Number.isInteger(interval) || interval < 0) {
    throw new ProtocolError(
      "requested_flush_interval_ms must be a non-negative integer",
      opcode,
    );
  }
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
