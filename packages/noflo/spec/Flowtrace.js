//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     SPDX-License-Identifier: MIT

// Flowtrace records send-time payload state: the recorder snapshots
// `network:data` payloads at record time instead of holding the reference,
// because a shared mutable object's final state would otherwise stand in
// for every event that carried it — the export would serialize history the
// network never produced. The noflo-jekyll content race was invisible in
// traces for exactly this reason (work document #48 update #2's observer
// notes; #49's ordering evidence relies on send-time state too).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Flowtrace } from "../src/lib/Flowtrace.js";
import { EVENT_TYPE } from "../src/lib/NoFlo.js";

/** @param {import("../src/lib/Flowtrace.js").Flowtrace} trace */
const dataChunks = (trace) =>
  trace
    .toJSON()
    .chunks.filter(([, type]) => type === EVENT_TYPE.DATA)
    .map(([, , payload]) => payload);

describe("Flowtrace record-time payload snapshots", () => {
  it("records the send-time state of a mutable payload, not its final state", () => {
    const trace = new Flowtrace();
    const payload = { value: "send-time", nested: { deep: true } };
    trace.addNetworkPacket(
      "network:data",
      { node: "sender", port: "out" },
      { node: "sink", port: "in" },
      "main",
      { data: payload },
    );
    // The sender keeps mutating the shared object after the send — the
    // network's real behavior for stateful payloads
    payload.value = "final-state";
    payload.nested.deep = false;
    const [recorded] = dataChunks(trace);
    assert.deepEqual(recorded, { value: "send-time", nested: { deep: true } });
  });

  it("keeps recording payloads structuredClone cannot handle", () => {
    const trace = new Flowtrace();
    const value = { data: "ok", handle: () => "host object" };
    trace.addNetworkPacket(
      "network:data",
      { node: "sender", port: "out" },
      { node: "sink", port: "in" },
      "main",
      { data: value },
    );
    // The reference survives where cloning cannot — the event is not
    // dropped and the export stays JSON-safe (frugalize omits the
    // function property)
    const [recorded] = dataChunks(trace);
    assert.strictEqual(recorded, value);
    assert.deepEqual(trace.toJSON().snapshot.graphs, {});
  });

  it("leaves primitive payloads untouched", () => {
    const trace = new Flowtrace();
    trace.addNetworkPacket(
      "network:data",
      null,
      { node: "sink", port: "in" },
      "main",
      { data: "plain string" },
    );
    assert.deepEqual(dataChunks(trace), ["plain string"]);
  });
});
