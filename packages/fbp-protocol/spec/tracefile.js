/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/tracefile.js
 * @description The streamable trace file format: snapshot golden vector,
 *   multi-chunk assembly and parse-back, and the frame-splitting walker the
 *   append-only format depends on.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import { MsgPack } from "@reticulum/core";

import {
  assembleTraceFile,
  CMD_FLOWTRACE_CHUNK,
  decodeFlowtraceChunk,
  EVENT_TYPE,
  encodeFlowtraceChunk,
  encodeTraceSnapshot,
  ProtocolError,
  readTraceFile,
  TRACE_SNAPSHOT,
} from "../src/index.js";
import {
  msgpackValueLength,
  splitMsgpackFrames,
} from "../src/msgpack-frames.js";

describe("frame splitting", () => {
  it("walks concatenated msgpack values of every shape", () => {
    const values = [
      MsgPack.encode(0),
      MsgPack.encode(-1),
      MsgPack.encode(300),
      MsgPack.encode(70000),
      MsgPack.encode("hello"),
      MsgPack.encode("x".repeat(300)),
      MsgPack.encode(new Uint8Array(300).fill(7)),
      MsgPack.encode(1.5),
      MsgPack.encode(true),
      MsgPack.encode(null),
      MsgPack.encode([1, [2, [3]]]),
      MsgPack.encode({ a: { b: { c: [1, "two", 3.5] } } }),
      MsgPack.encode(new Map([[1, "one"]])),
    ];
    const all = values.reduce((acc, value) => {
      const out = new Uint8Array(acc.byteLength + value.byteLength);
      out.set(acc, 0);
      out.set(value, acc.byteLength);
      return out;
    }, new Uint8Array(0));
    const frames = splitMsgpackFrames(all);
    assert.equal(frames.length, values.length);
    frames.forEach((frame, i) => {
      assert.deepEqual(MsgPack.decode(frame), MsgPack.decode(values[i]));
    });
  });

  it("reports consumed length from an arbitrary offset", () => {
    const first = MsgPack.encode([1, 2, 3]);
    const second = MsgPack.encode("tail");
    const bytes = new Uint8Array(first.byteLength + second.byteLength);
    bytes.set(first, 0);
    bytes.set(second, first.byteLength);
    assert.equal(msgpackValueLength(bytes, 0), first.byteLength);
    assert.equal(
      msgpackValueLength(bytes, first.byteLength),
      second.byteLength,
    );
  });

  it("rejects truncated values", () => {
    // fixarray(3) with only two elements present
    assert.throws(
      () => msgpackValueLength(new Uint8Array([0x93, 0x01, 0x02])),
      ProtocolError,
    );
  });
});

describe("trace snapshot frame", () => {
  it("encodes the 0xF0 layout of work document #4 §9", () => {
    const bytes = encodeTraceSnapshot({
      timestampMs: 1000,
      runtimeMetadata: { name: "solar-runtime" },
      graphDefinition: { nodes: [], edges: [] },
    });
    const frame = MsgPack.decode(bytes);
    assert.equal(frame[0], TRACE_SNAPSHOT);
    // 0xF0 exceeds the fixint range, so it must travel as uint8; the frame
    // itself is fixarray(5).
    assert.deepEqual([...bytes.slice(0, 2)], [0x95, 0xcc]);
    assert.equal(frame[1], 1); // default format_ver
    assert.equal(frame[2], 1000);
    assert.deepEqual(frame[3], { name: "solar-runtime" });
    assert.deepEqual(frame[4], { nodes: [], edges: [] });
  });

  it("rejects non-integer timestamps", () => {
    assert.throws(
      () => encodeTraceSnapshot({ timestampMs: 1.5, graphDefinition: {} }),
      ProtocolError,
    );
  });
});

describe("trace file assembly and parsing", () => {
  function chunk(subId, deltas) {
    return encodeFlowtraceChunk({
      subId,
      baseTimestampMs: 1000,
      events: deltas.map(([timeDeltaMs, eventType, payload]) => ({
        timeDeltaMs,
        eventType,
        payload,
      })),
    });
  }

  it("assembles snapshot plus chunks and reads them back in order", () => {
    const chunks = [
      chunk("sub-1", [
        [0, EVENT_TYPE.LIFECYCLE, 1],
        [5, EVENT_TYPE.DATA, "hello"],
      ]),
      chunk("sub-1", [
        [0, EVENT_TYPE.DATA, "world"],
        [9, EVENT_TYPE.ERROR, "boom"],
      ]),
      chunk("sub-1", [[0, EVENT_TYPE.END_GROUP, "g"]]),
    ];
    const file = assembleTraceFile({
      runtimeMetadata: { name: "mesh-runtime", kind: "noflo-nodejs" },
      graphDefinition: { nodes: [{ id: "a" }], edges: [] },
      chunks,
      timestampMs: 1000,
    });
    const parsed = readTraceFile(file);
    assert.equal(parsed.snapshot.formatVersion, 1);
    assert.equal(parsed.snapshot.timestampMs, 1000);
    assert.deepEqual(parsed.snapshot.runtimeMetadata, {
      name: "mesh-runtime",
      kind: "noflo-nodejs",
    });
    assert.equal(parsed.chunks.length, 3);
    assert.deepEqual(
      parsed.chunks.map((c) => c.events.length),
      [2, 2, 1],
    );
    // Chunk order is preserved: the first event of the second chunk decodes
    // to the DATA event it was assembled with.
    assert.equal(parsed.chunks[1].events[0].payload, "world");
    // Every parsed chunk is a genuine 0x32 frame.
    for (const decoded of parsed.chunks) {
      assert.equal(decoded.cmd, CMD_FLOWTRACE_CHUNK);
    }
  });

  it("parses a file assembled from raw concatenation, the append-only way", () => {
    // Simulate an incremental writer: snapshot written first, chunks
    // appended as they flush — then read back with no separator bytes.
    const snapshot = encodeTraceSnapshot({
      timestampMs: 42,
      runtimeMetadata: null,
      graphDefinition: {},
    });
    const chunkFrame = encodeFlowtraceChunk({
      subId: "s",
      baseTimestampMs: 42,
      events: [{ timeDeltaMs: 1, eventType: EVENT_TYPE.DATA, payload: 7 }],
    });
    const file = new Uint8Array(snapshot.byteLength + chunkFrame.byteLength);
    file.set(snapshot, 0);
    file.set(chunkFrame, snapshot.byteLength);
    const parsed = readTraceFile(file);
    assert.equal(parsed.snapshot.timestampMs, 42);
    assert.equal(parsed.chunks.length, 1);
    assert.equal(parsed.chunks[0].events[0].payload, 7);
  });

  it("rejects a file whose first frame is not the snapshot", () => {
    const chunk = encodeFlowtraceChunk({
      subId: "s",
      baseTimestampMs: 0,
      events: [{ timeDeltaMs: 0, eventType: EVENT_TYPE.DATA, payload: null }],
    });
    assert.throws(() => readTraceFile(chunk), ProtocolError);
  });

  it("rejects a file with a non-chunk frame after the snapshot", () => {
    const snapshot = encodeTraceSnapshot({
      timestampMs: 0,
      graphDefinition: {},
    });
    const impostor = MsgPack.encode([0x99, "not a chunk"]);
    const file = new Uint8Array(snapshot.byteLength + impostor.byteLength);
    file.set(snapshot, 0);
    file.set(impostor, snapshot.byteLength);
    assert.throws(() => readTraceFile(file), ProtocolError);
  });

  it("keeps decoded chunks equal to their standalone decoding", () => {
    const chunk = encodeFlowtraceChunk({
      subId: "s",
      baseTimestampMs: 1000,
      events: [{ timeDeltaMs: 3, eventType: EVENT_TYPE.DATA, payload: "x" }],
    });
    const file = assembleTraceFile({
      runtimeMetadata: null,
      graphDefinition: {},
      chunks: [chunk],
      timestampMs: 1000,
    });
    const parsed = readTraceFile(file);
    assert.deepEqual(parsed.chunks[0], decodeFlowtraceChunk(chunk));
  });
});
