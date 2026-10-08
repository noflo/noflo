/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/telemetry.js
 * @description Streaming telemetry codecs: subscriptions, delta-encoded
 *   flowtrace chunks, and the absolute-timestamp builder.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  CMD_FLOWTRACE_CHUNK,
  CMD_PUBSUB_SUB,
  decodeFlowtraceChunk,
  decodePubsubSub,
  EVENT_TYPE,
  encodeFlowtraceChunk,
  encodeFlowtraceChunkFromTimestamps,
  encodePubsubSub,
  LIFECYCLE_CODE,
  ProtocolError,
} from "../src/index.js";

describe("0x30 CMD_PUBSUB_SUB", () => {
  it("round-trips a subscription", () => {
    const decoded = decodePubsubSub(
      encodePubsubSub({
        subId: "sub-1",
        targetType: "graph",
        targetId: "graph-7",
        requestedFlushIntervalMs: 5000,
      }),
    );
    assert.equal(decoded.cmd, CMD_PUBSUB_SUB);
    assert.equal(decoded.subId, "sub-1");
    assert.equal(decoded.targetType, "graph");
    assert.equal(decoded.targetId, "graph-7");
    assert.equal(decoded.requestedFlushIntervalMs, 5000);
  });

  it("allows a zero flush interval (synchronous request)", () => {
    const decoded = decodePubsubSub(
      encodePubsubSub({
        subId: 1,
        targetType: "network",
        targetId: "main",
        requestedFlushIntervalMs: 0,
      }),
    );
    assert.equal(decoded.requestedFlushIntervalMs, 0);
  });

  it("rejects negative flush intervals", () => {
    assert.throws(
      () =>
        encodePubsubSub({
          subId: "s",
          targetType: "graph",
          targetId: "g",
          requestedFlushIntervalMs: -1,
        }),
      ProtocolError,
    );
  });

  it("rejects empty targets", () => {
    assert.throws(
      () =>
        encodePubsubSub({
          subId: "s",
          targetType: "",
          targetId: "g",
          requestedFlushIntervalMs: 100,
        }),
      ProtocolError,
    );
  });
});

describe("0x32 CMD_FLOWTRACE_CHUNK", () => {
  it("round-trips delta-encoded events", () => {
    const bytes = encodeFlowtraceChunk({
      subId: "sub-1",
      baseTimestampMs: 1000,
      events: [
        {
          timeDeltaMs: 0,
          eventType: EVENT_TYPE.BEGIN_GROUP,
          payload: "batch-1",
        },
        { timeDeltaMs: 12, eventType: EVENT_TYPE.DATA, payload: "hello" },
        {
          timeDeltaMs: 20,
          eventType: EVENT_TYPE.END_GROUP,
          payload: "batch-1",
        },
      ],
    });
    const decoded = decodeFlowtraceChunk(bytes);
    assert.equal(decoded.cmd, CMD_FLOWTRACE_CHUNK);
    assert.equal(decoded.subId, "sub-1");
    assert.equal(decoded.baseTimestampMs, 1000);
    assert.equal(decoded.events.length, 3);
    assert.deepEqual(decoded.events[1], {
      timeDeltaMs: 12,
      eventType: EVENT_TYPE.DATA,
      payload: "hello",
    });
  });

  it("encodes the documented tuple shape positionally", () => {
    const bytes = encodeFlowtraceChunk({
      subId: 1,
      baseTimestampMs: 0,
      events: [{ timeDeltaMs: 0, eventType: EVENT_TYPE.DATA, payload: null }],
    });
    // fixarray(4), opcode, sub, base, fixarray(1) events, fixarray(3) tuple
    assert.equal(bytes[0], 0x94);
    assert.equal(bytes[1], CMD_FLOWTRACE_CHUNK);
  });

  it("rejects deltas beyond uint32", () => {
    assert.throws(
      () =>
        encodeFlowtraceChunk({
          subId: "s",
          baseTimestampMs: 0,
          events: [
            {
              timeDeltaMs: 0x100000000,
              eventType: EVENT_TYPE.DATA,
              payload: null,
            },
          ],
        }),
      ProtocolError,
    );
  });

  it("rejects malformed event tuples on decode", () => {
    // fixarray(4) with a 2-element event tuple instead of 3
    const bytes = new Uint8Array([
      0x94, 0x32, 0xa1, 0x73, 0x00, 0x91, 0x92, 0x00, 0x01,
    ]);
    assert.throws(() => decodeFlowtraceChunk(bytes), ProtocolError);
  });

  it("rejects negative timestamps", () => {
    assert.throws(
      () =>
        encodeFlowtraceChunk({ subId: "s", baseTimestampMs: -1, events: [] }),
      ProtocolError,
    );
  });

  it("samples edge capacity per flush, bounded and unbounded (update #9)", () => {
    // One event per edge per flush; desired_size nil means the edge is
    // unbounded. Backpressure is normal operation — a data-channel
    // observation, never an error.
    const bytes = encodeFlowtraceChunk({
      subId: "sub-1",
      baseTimestampMs: 3000,
      events: [
        {
          timeDeltaMs: 0,
          eventType: EVENT_TYPE.EDGE_CAPACITY,
          payload: ["edge-1", 3, 60],
        },
        {
          timeDeltaMs: 0,
          eventType: EVENT_TYPE.EDGE_CAPACITY,
          payload: ["edge-2", 1, null],
        },
      ],
    });
    const decoded = decodeFlowtraceChunk(bytes);
    assert.deepEqual(decoded.events[0].payload, ["edge-1", 3, 60]);
    assert.deepEqual(decoded.events[1].payload, ["edge-2", 1, null]);
  });

  it("classifies stub-raised errors as unimplemented by event type (update #9)", () => {
    // The payload is the exception string, exactly as in ERROR; the event
    // type itself is the classification — no string-parsing convention.
    const bytes = encodeFlowtraceChunk({
      subId: "sub-1",
      baseTimestampMs: 2000,
      events: [
        {
          timeDeltaMs: 0,
          eventType: EVENT_TYPE.DATA,
          payload: 21,
        },
        {
          timeDeltaMs: 3,
          eventType: EVENT_TYPE.STUB_ERROR,
          payload: "math/Divide is not implemented yet",
        },
      ],
    });
    const decoded = decodeFlowtraceChunk(bytes);
    assert.equal(decoded.events[1].eventType, EVENT_TYPE.STUB_ERROR);
    assert.equal(
      decoded.events[1].payload,
      "math/Divide is not implemented yet",
    );
  });

  it("carries a failed transition with its accompanying error detail (update #1)", () => {
    // A rejected start() leaves the runtime an honest message to send: the
    // 0x06 LIFECYCLE code renders the transition as errored without parsing
    // exception strings; the detail travels in an accompanying 0x04 ERROR.
    const bytes = encodeFlowtraceChunk({
      subId: "sub-1",
      baseTimestampMs: 1000,
      events: [
        {
          timeDeltaMs: 0,
          eventType: EVENT_TYPE.LIFECYCLE,
          payload: LIFECYCLE_CODE.FAILED,
        },
        {
          timeDeltaMs: 5,
          eventType: EVENT_TYPE.ERROR,
          payload: "start rejected: component math/Add threw",
        },
      ],
    });
    const decoded = decodeFlowtraceChunk(bytes);
    assert.equal(decoded.events[0].eventType, EVENT_TYPE.LIFECYCLE);
    assert.equal(decoded.events[0].payload, LIFECYCLE_CODE.FAILED);
    assert.equal(decoded.events[1].eventType, EVENT_TYPE.ERROR);
    assert.equal(
      decoded.events[1].payload,
      "start rejected: component math/Add threw",
    );
  });
});

describe("absolute-timestamp builder", () => {
  it("computes deltas from the earliest event", () => {
    const bytes = encodeFlowtraceChunkFromTimestamps({
      subId: "sub-1",
      events: [
        { timestampMs: 5000, eventType: EVENT_TYPE.BEGIN_GROUP, payload: "g" },
        { timestampMs: 5010, eventType: EVENT_TYPE.DATA, payload: "x" },
        { timestampMs: 5020, eventType: EVENT_TYPE.ERROR, payload: "boom" },
      ],
    });
    const decoded = decodeFlowtraceChunk(bytes);
    assert.equal(decoded.baseTimestampMs, 5000);
    assert.deepEqual(
      decoded.events.map((event) => event.timeDeltaMs),
      [0, 10, 20],
    );
    assert.equal(decoded.events[2].eventType, EVENT_TYPE.ERROR);
  });

  it("rejects out-of-order events", () => {
    assert.throws(
      () =>
        encodeFlowtraceChunkFromTimestamps({
          subId: "s",
          events: [
            { timestampMs: 2000, eventType: EVENT_TYPE.DATA, payload: 1 },
            { timestampMs: 1000, eventType: EVENT_TYPE.DATA, payload: 2 },
          ],
        }),
      ProtocolError,
    );
  });

  it("rejects an empty event list", () => {
    assert.throws(
      () => encodeFlowtraceChunkFromTimestamps({ subId: "s", events: [] }),
      ProtocolError,
    );
  });
});
