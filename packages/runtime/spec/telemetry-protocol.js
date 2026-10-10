/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/telemetry-protocol.js
 * @description Live streaming telemetry: `0x30` subscriptions, the
 *   network-event-to-flowtrace mapping (data, groups, lifecycle, error
 *   classification), payload frugalization, and subscription lifetime —
 *   driven end-to-end through the runtime core, plus a real-engine
 *   integration through NetworkHost.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import { asComponent } from "@noflo/as-component";
import {
  CMD_AUTH_RESPONSE,
  CMD_FLOWTRACE_CHUNK,
  decodeFlowtraceChunk,
  EVENT_TYPE,
  encodePubsubSub,
  LIFECYCLE_CODE,
} from "@noflo/fbp-protocol";
import { GraphModel } from "@noflo/graph";
import { ComponentLoader } from "@noflo/noflo";
import { NetworkHost, RuntimeServer, TelemetryProtocol } from "../src/index.js";
import { staticPolicy } from "./policy.js";

/** Capture transport. */
function capture() {
  /** @type {{sent: {bytes: Uint8Array, context: any}[]}} */
  const log = { sent: [] };
  return {
    log,
    send(bytes, context) {
      log.sent.push({ bytes, context });
    },
    broadcast() {},
  };
}

/** An EventTarget standing in for the network host, for unit-level tests. */
class FakeHost extends EventTarget {
  /**
   * @param {string} type
   * @param {any} detail
   * @returns {void}
   */
  emit(type, detail) {
    this.dispatchEvent(new globalThis.CustomEvent(type, { detail }));
  }
}

class StubNotImplementedError extends Error {
  constructor(message) {
    super(message);
    this.name = "StubNotImplementedError";
  }
}

/** Server + telemetry wired against a fake host. */
async function wiredServer() {
  const transport = capture();
  const serverPolicy = staticPolicy();
  const server = new RuntimeServer({
    capabilityPolicy: serverPolicy,
    send: transport.send,
    capabilities: ["TELEMETRY_READ", "GRAPH_READ"],
  });
  const host = new FakeHost();
  const telemetry = new TelemetryProtocol({ host, flushFloorMs: 0 });
  telemetry.register(server);
  // Fail closed: contexts must be authorized before their frames count.
  await server.authorize("link-1", "test-identity");
  await server.authorize("link-2", "test-identity");
  return { server, telemetry, transport, host };
}

/** Subscribe and return nothing; the sub id is fixed for assertions. */
function subscribe(server, subId = "sub-1", context = "link-1") {
  server.handleFrame(
    encodePubsubSub({
      subId,
      targetType: "network",
      targetId: "main",
      requestedFlushIntervalMs: 0,
    }),
    context,
  );
}

/** Outbound frames with the unilateral auth responses excluded. */
function wire(transport) {
  return transport.log.sent.filter(
    (entry) => entry.bytes[1] !== CMD_AUTH_RESPONSE,
  );
}

describe("telemetry: subscriptions", () => {
  it("registers subscriptions from 0x30 frames", async () => {
    const { telemetry, server } = await wiredServer();
    subscribe(server);
    assert.equal(telemetry.subscriptions.size, 1);
    assert.equal(telemetry.subscriptions.get("sub-1").targetType, "network");
  });

  it("drops subscriptions with their link context", async () => {
    const { telemetry, server } = await wiredServer();
    subscribe(server, "sub-1", "link-1");
    subscribe(server, "sub-2", "link-2");
    telemetry.dropContext("link-1");
    assert.deepEqual([...telemetry.subscriptions.keys()], ["sub-2"]);
  });

  it("enforces the per-context subscription budget", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: ["TELEMETRY_READ"],
    });
    const host = new FakeHost();
    const telemetry = new TelemetryProtocol({
      host,
      maxSubscriptionsPerContext: 2,
    });
    telemetry.register(server);
    await server.authorize("link-1", "test-identity");
    subscribe(server, "sub-1", "link-1");
    subscribe(server, "sub-2", "link-1");
    /** @type {any[]} */
    const limited = [];
    server.addEventListener("subscriptionlimit", (event) =>
      limited.push(event.detail),
    );
    subscribe(server, "sub-3", "link-1");
    assert.equal(limited.length, 1);
    assert.equal(limited[0].subId, "sub-3");
    assert.deepEqual([...telemetry.subscriptions.keys()], ["sub-1", "sub-2"]);
    // Another context has its own budget.
    await server.authorize("link-2", "test-identity");
    subscribe(server, "sub-3", "link-2");
    assert.equal(limited.length, 1);
    assert.ok(telemetry.subscriptions.has("sub-3"));
  });

  it("ceilings the client's requested flush interval", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: ["TELEMETRY_READ"],
    });
    const host = new FakeHost();
    const telemetry = new TelemetryProtocol({
      host,
      flushCeilingMs: 20,
    });
    telemetry.register(server);
    await server.authorize("link-1", "test-identity");
    // The client asks for a 24-day buffer; the runtime refuses to retain
    // events that long.
    server.handleFrame(
      encodePubsubSub({
        subId: "sub-1",
        targetType: "network",
        targetId: "main",
        requestedFlushIntervalMs: 2 ** 31,
      }),
      "link-1",
    );
    host.emit("ip", { type: "data", data: 1 });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(wire(transport).length, 1, "flushed at the ceiling");
  });
});

describe("telemetry: event mapping", () => {
  it("maps data packets to DATA events with raw payloads", async () => {
    const { server, telemetry, transport, host } = await wiredServer();
    subscribe(server);
    host.emit("ip", { id: "DATA -> ECHO()", type: "data", data: 42 });
    telemetry.flushAll();
    assert.equal(wire(transport).length, 1);
    const decoded = decodeFlowtraceChunk(wire(transport)[0].bytes);
    assert.equal(decoded.cmd, CMD_FLOWTRACE_CHUNK);
    assert.equal(decoded.subId, "sub-1");
    assert.equal(decoded.events[0].eventType, EVENT_TYPE.DATA);
    assert.equal(decoded.events[0].payload, 42);
  });

  it("maps brackets to group boundaries", async () => {
    const { server, telemetry, transport, host } = await wiredServer();
    subscribe(server);
    host.emit("ip", { type: "openBracket", data: "math" });
    host.emit("ip", { type: "data", data: 1 });
    host.emit("ip", { type: "closeBracket", data: "math" });
    telemetry.flushAll();
    const decoded = decodeFlowtraceChunk(wire(transport)[0].bytes);
    assert.deepEqual(
      decoded.events.map((event) => event.eventType),
      [EVENT_TYPE.BEGIN_GROUP, EVENT_TYPE.DATA, EVENT_TYPE.END_GROUP],
    );
    assert.deepEqual(
      decoded.events.map((event) => event.payload),
      ["math", 1, "math"],
    );
  });

  it("maps network lifecycle to START/STOP lifecycle codes", async () => {
    const { server, telemetry, transport, host } = await wiredServer();
    subscribe(server);
    host.emit("start", { start: 0 });
    host.emit("end", { uptime: 100 });
    telemetry.flushAll();
    const decoded = decodeFlowtraceChunk(wire(transport)[0].bytes);
    assert.deepEqual(
      decoded.events.map((event) => event.eventType),
      [EVENT_TYPE.LIFECYCLE, EVENT_TYPE.LIFECYCLE],
    );
    assert.deepEqual(
      decoded.events.map((event) => event.payload),
      [LIFECYCLE_CODE.START, LIFECYCLE_CODE.STOP],
    );
  });

  it("classifies stub-raised errors by event type (update #9)", async () => {
    const { server, telemetry, transport, host } = await wiredServer();
    subscribe(server);
    host.emit("process-error", {
      id: "node-1",
      error: new StubNotImplementedError("math/Divide is not implemented yet"),
    });
    host.emit("process-error", {
      id: "node-2",
      error: new Error("genuine failure"),
    });
    telemetry.flushAll();
    const decoded = decodeFlowtraceChunk(wire(transport)[0].bytes);
    assert.equal(decoded.events[0].eventType, EVENT_TYPE.STUB_ERROR);
    assert.equal(
      decoded.events[0].payload,
      "math/Divide is not implemented yet",
    );
    assert.equal(decoded.events[1].eventType, EVENT_TYPE.ERROR);
    assert.equal(decoded.events[1].payload, "genuine failure");
  });

  it("frugalizes payloads the wire cannot carry", async () => {
    const { server, telemetry, transport, host } = await wiredServer();
    subscribe(server);
    /** @type {any} */
    const cyclic = { label: "state" };
    cyclic.self = cyclic;
    host.emit("ip", { type: "data", data: cyclic });
    host.emit("ip", { type: "data", data: 7 });
    telemetry.flushAll();
    const decoded = decodeFlowtraceChunk(wire(transport)[0].bytes);
    assert.equal(decoded.events[0].payload, "<unserializable object>");
    assert.equal(decoded.events[1].payload, 7);
  });

  it("delivers chunks to the subscribing context only", async () => {
    const { server, telemetry, transport, host } = await wiredServer();
    subscribe(server, "sub-1", "link-1");
    subscribe(server, "sub-2", "link-2");
    host.emit("ip", { type: "data", data: 1 });
    telemetry.flushAll();
    assert.equal(wire(transport).length, 2);
    assert.equal(wire(transport)[0].context, "link-1");
    assert.equal(wire(transport)[1].context, "link-2");
  });

  it("does not flush empty buffers", async () => {
    const { telemetry, transport } = await wiredServer();
    telemetry.flushAll();
    assert.equal(wire(transport).length, 0);
  });

  it("drops events when nobody subscribes", async () => {
    const { host, telemetry, transport } = await wiredServer();
    host.emit("ip", { type: "data", data: 1 });
    telemetry.flushAll();
    assert.equal(wire(transport).length, 0);
  });

  it("flushes on the effective cadence: requested interval, floored", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
    });
    const host = new FakeHost();
    // 20ms floor: the client's zero request cannot storm the link.
    const telemetry = new TelemetryProtocol({
      host,
      flushFloorMs: 20,
    });
    telemetry.register(server);
    await server.authorize("link-1", "test-identity");
    subscribe(server);
    host.emit("ip", { type: "data", data: 1 });
    assert.equal(wire(transport).length, 0);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(wire(transport).length, 1);
    // The timer rearms for subsequent events.
    host.emit("ip", { type: "data", data: 2 });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(wire(transport).length, 2);
  });
});

describe("telemetry: real-engine integration", () => {
  it("streams a real network run through NetworkHost", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: ["TELEMETRY_READ"],
    });
    const loader = new ComponentLoader();
    await loader.registerComponent("runtime", "Echo", () =>
      asComponent((input) => input),
    );
    const graph = new GraphModel({ name: "main" });
    graph.addNode({ entity_id: "echo", component: "runtime/Echo" });
    graph.addIIP({
      entity_id: "iip-1",
      data: "hello",
      to: { node: "echo", port: "input" },
    });
    const host = new NetworkHost({ graph, componentLoader: loader });
    const telemetry = new TelemetryProtocol({ host, flushFloorMs: 0 });
    telemetry.register(server);
    await server.authorize("link-1", "test-identity");
    subscribe(server);

    await host.start();
    // IIP delivery is asynchronous; give the network a beat.
    await new Promise((resolve) => setTimeout(resolve, 50));
    telemetry.flushAll();
    const events = wire(transport).flatMap(
      (sent) => decodeFlowtraceChunk(sent.bytes).events,
    );
    const started = events.find((e) => e.eventType === EVENT_TYPE.LIFECYCLE);
    assert.equal(started?.payload, LIFECYCLE_CODE.START);
    const data = events.find((e) => e.eventType === EVENT_TYPE.DATA);
    assert.equal(data?.payload, "hello");

    await host.stop();
    telemetry.flushAll();
    const stopped = decodeFlowtraceChunk(
      wire(transport)[wire(transport).length - 1].bytes,
    );
    assert.equal(stopped.events[0].eventType, EVENT_TYPE.LIFECYCLE);
    assert.equal(stopped.events[0].payload, LIFECYCLE_CODE.STOP);
  });
});
