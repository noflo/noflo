import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodePubsubSub,
  encodeFlowtraceChunkFromTimestamps,
} from "@noflo/fbp-protocol";
import { TelemetryClient } from "../src/telemetry.js";

/** @type {Uint8Array[]} */
const sentFrames = [];
const client = new TelemetryClient({
  send: async (payload) => {
    sentFrames.push(payload);
  },
  filters: { types: [2] },
});

describe("TelemetryClient", () => {
  it("sends the 0x30 subscription frame", async () => {
    await client.subscribe({ flushIntervalMs: 50 });
    assert.equal(sentFrames.length, 1);
    const decoded = decodePubsubSub(sentFrames[0]);
    assert.equal(decoded.subId, "noflo-client-telemetry");
    assert.equal(decoded.targetType, "graph");
    assert.equal(decoded.requestedFlushIntervalMs, 50);
  });

  it("decodes chunks, applies deltas, and filters by type", () => {
    /** @type {any[]} */
    const chunks = [];
    client.onChunk((chunk) => chunks.push(chunk));
    // Event types: 1 (filtered out), 2 (kept), 2 (kept)
    const frame = encodeFlowtraceChunkFromTimestamps({
      subId: "sub-1",
      planeId: null,
      events: [
        { timestampMs: 1000, eventType: 1, payload: { node: "a" } },
        { timestampMs: 1050, eventType: 2, payload: { node: "a", data: "x" } },
        { timestampMs: 1100, eventType: 2, payload: { node: "b", data: "y" } },
      ],
    });
    client.handleChunkFrame(frame);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].subId, "sub-1");
    assert.equal(chunks[0].events.length, 2, "type-1 events filtered out");
    assert.equal(chunks[0].events[0].payload.data, "x");
    assert.equal(chunks[0].events[1].payload.data, "y");
    // Deltas applied to absolute timestamps
    assert.equal(chunks[0].events[0].timestampMs, 1050);
    assert.equal(chunks[0].events[1].timestampMs, 1100);
  });
});
