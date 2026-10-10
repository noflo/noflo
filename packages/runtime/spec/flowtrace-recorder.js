/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/flowtrace-recorder.js
 * @description The round-trip pin between the NoFlo core trace recorder's
 *   JSON state and the binary streamable trace file encoding (work document
 *   #23 update #2): the recorder's `toJSON()` output, projected through
 *   `assembleTraceFileFromRecorder`, must decode back to the same event
 *   tuples — and the event vocabulary constants duplicated in the two
 *   packages must stay equal, so neither can drift.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  assembleTraceFileFromRecorder,
  EVENT_TYPE as PROTOCOL_EVENT_TYPE,
  LIFECYCLE_CODE as PROTOCOL_LIFECYCLE_CODE,
  readTraceFile,
} from "@noflo/fbp-protocol";
import {
  Flowtrace,
  EVENT_TYPE as RECORDER_EVENT_TYPE,
  LIFECYCLE_CODE as RECORDER_LIFECYCLE_CODE,
} from "@noflo/noflo";

describe("Flowtrace recorder <-> trace file round trip", () => {
  it("pins the duplicated event vocabulary to equality", () => {
    for (const [key, value] of Object.entries(RECORDER_EVENT_TYPE)) {
      assert.equal(
        PROTOCOL_EVENT_TYPE[key],
        value,
        `EVENT_TYPE.${key} drifted between @noflo/noflo and @noflo/fbp-protocol`,
      );
    }
    for (const [key, value] of Object.entries(RECORDER_LIFECYCLE_CODE)) {
      assert.equal(
        PROTOCOL_LIFECYCLE_CODE[key],
        value,
        `LIFECYCLE_CODE.${key} drifted between @noflo/noflo and @noflo/fbp-protocol`,
      );
    }
  });

  it("round-trips recorder state through the binary trace file", () => {
    const trace = new Flowtrace({
      runtimeMetadata: { name: "test-runtime", type: "noflo-nodejs" },
    });
    trace.addGraph(
      "main",
      {
        properties: { name: "main" },
        nodes: [{ id: "a", component: "test/Upper" }],
        edges: [],
      },
      true,
    );
    trace.addNetworkStarted("main");
    trace.addNetworkPacket(
      "network:begingroup",
      null,
      { node: "a", port: "in" },
      "main",
      { data: "grp", subgraph: null, datatype: "string", schema: null },
    );
    trace.addNetworkPacket(
      "network:data",
      null,
      { node: "a", port: "in" },
      "main",
      { data: "hello", subgraph: ["Sub"], datatype: "string", schema: null },
    );
    trace.addNetworkPacket(
      "network:data",
      { node: "a", port: "out" },
      null,
      "main",
      { data: "HELLO", subgraph: null, datatype: "string", schema: null },
    );
    trace.addNetworkPacket(
      "network:endgroup",
      { node: "a", port: "out" },
      null,
      "main",
      { data: "grp" },
    );
    trace.addNetworkError("main", new Error("boom"));
    trace.addNetworkOutput("main", { stream: "output", message: "log line" });
    trace.addNetworkStopped("main");

    const state = trace.toJSON();
    assert.equal(state.snapshot.main, "main");
    assert.equal(typeof state.snapshot.timestampMs, "number");
    assert.deepEqual(state.snapshot.runtimeMetadata, {
      name: "test-runtime",
      type: "noflo-nodejs",
    });
    assert.equal(Object.keys(state.snapshot.graphs).length, 1);
    assert.deepEqual(
      state.snapshot.graphDefinition,
      state.snapshot.graphs.main,
    );

    const bytes = assembleTraceFileFromRecorder(state);
    const decoded = readTraceFile(bytes);
    assert.equal(decoded.snapshot.formatVersion, state.snapshot.formatVersion);
    assert.equal(decoded.snapshot.timestampMs, state.snapshot.timestampMs);
    assert.deepEqual(
      decoded.snapshot.runtimeMetadata,
      state.snapshot.runtimeMetadata,
    );
    assert.deepEqual(
      decoded.snapshot.graphDefinition,
      state.snapshot.graphDefinition,
    );

    // One chunk frame carrying all events, deltas measured from the
    // snapshot timestamp.
    assert.equal(decoded.chunks.length, 1);
    const chunk = decoded.chunks[0];
    assert.equal(chunk.subId, 0);
    assert.equal(chunk.baseTimestampMs, state.snapshot.timestampMs);
    assert.equal(chunk.events.length, state.chunks.length);
    chunk.events.forEach((event, index) => {
      const [timeDeltaMs, eventType, payload] = state.chunks[index];
      assert.equal(event.timeDeltaMs, timeDeltaMs, `delta ${index}`);
      assert.equal(event.eventType, eventType, `type ${index}`);
      assert.deepEqual(event.payload, payload, `payload ${index}`);
    });
  });

  it("round-trips a recording with no events as a snapshot-only file", () => {
    const trace = new Flowtrace();
    trace.addGraph("main", { nodes: [], edges: [] }, true);
    const bytes = assembleTraceFileFromRecorder(trace.toJSON());
    const decoded = readTraceFile(bytes);
    assert.equal(decoded.chunks.length, 0);
    assert.deepEqual(decoded.snapshot.graphDefinition, {
      nodes: [],
      edges: [],
    });
  });

  it("rejects malformed recorder state", () => {
    assert.throws(() => assembleTraceFileFromRecorder({}));
    assert.throws(() =>
      assembleTraceFileFromRecorder({ snapshot: { timestampMs: 1 } }),
    );
    assert.throws(() =>
      assembleTraceFileFromRecorder({
        snapshot: { timestampMs: -1, formatVersion: 1 },
        chunks: [],
      }),
    );
  });
});
