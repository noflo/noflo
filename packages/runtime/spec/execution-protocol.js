/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/execution-protocol.js
 * @description Execution control against a real engine: start/stop drive
 *   the network lifecycle and reach subscribers as lifecycle events; a
 *   rejected start is an honest FAILED transition; pause/resume/step,
 *   breakpoints, and per-process disable surface as unsupported — no
 *   faked semantics.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import { asComponent } from "@noflo/as-component";
import {
  CMD_AUTH_RESPONSE,
  CMD_FLOWTRACE_CHUNK,
  decodeFlowtraceChunk,
  EVENT_TYPE,
  encodeBreakpointClear,
  encodeBreakpointSet,
  encodeHwmSet,
  encodeProcessCtrl,
  encodePubsubSub,
  encodeRunCtrl,
  LIFECYCLE_CODE,
  RUN_ACTION,
} from "@noflo/fbp-protocol";
import { GraphModel } from "@noflo/graph";
import { ComponentLoader } from "@noflo/noflo";
import {
  ExecutionProtocol,
  NetworkHost,
  RuntimeServer,
  TelemetryProtocol,
} from "../src/index.js";

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

/**
 * A runtime wired with the execution protocol against a real engine host.
 * Subscribed to its own telemetry so control outcomes come back as
 * flowtrace events. The builder wires the graph and registers components.
 *
 * @param {(graph: GraphModel, loader: ComponentLoader) => void} builder
 */
async function wiredServer(builder) {
  const transport = capture();
  const server = new RuntimeServer({
    send: transport.send,
    capabilities: ["LIFECYCLE_CTRL", "TELEMETRY_READ", "COMPONENT_WRITE"],
  });
  const graph = new GraphModel({ name: "main" });
  const loader = new ComponentLoader();
  builder(graph, loader);
  const host = new NetworkHost({ graph, componentLoader: loader });
  const telemetry = new TelemetryProtocol({ host, flushFloorMs: 0 });
  const execution = new ExecutionProtocol({ host, telemetry });
  telemetry.register(server);
  execution.register(server);
  // Fail closed: contexts must be authorized before their frames count.
  server.authorize("link-1");
  server.handleFrame(
    encodePubsubSub({
      subId: "sub-1",
      targetType: "network",
      targetId: "main",
      requestedFlushIntervalMs: 0,
    }),
    "link-1",
  );
  return { server, telemetry, execution, transport, host, graph };
}

/**
 * A component that runs until shutdown: its process promise resolves when
 * the component's tearDown runs, so `stop()` completes instead of hanging
 * on in-flight processes.
 *
 * @param {ComponentLoader} loader
 * @returns {Promise<void>}
 */
async function registerWaitComponent(loader) {
  await loader.registerComponent("runtime", "Wait", () => {
    /** @type {(() => void) | undefined} */
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const component = asComponent((input) => {
      // The parameter names the inport; the payload is irrelevant — the
      // process only needs to keep the network running until shutdown.
      void input;
      return pending;
    });
    const baseTearDown =
      /** @type {(() => any) | undefined} */
      (component.tearDown?.bind(component));
    component.tearDown = () => {
      release?.();
      return baseTearDown?.();
    };
    return component;
  });
}

/** Drain the telemetry stream into decoded flowtrace events. */
function drain(transport) {
  return transport.log.sent
    .filter((sent) => sent.bytes[1] !== CMD_AUTH_RESPONSE)
    .flatMap((sent) => decodeFlowtraceChunk(sent.bytes).events);
}

describe("execution protocol: start and stop", () => {
  it("starts and stops the network for real", async () => {
    const { server, telemetry, transport, host } = await wiredServer(
      async (graph, loader) => {
        await registerWaitComponent(loader);
        graph.addNode({ entity_id: "wait", component: "runtime/Wait" });
        graph.addIIP({
          entity_id: "iip-1",
          data: "go",
          to: { node: "wait", port: "input" },
        });
      },
    );
    server.handleFrame(encodeRunCtrl(RUN_ACTION.START), "link-1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(host.running, true);
    telemetry.flushAll();
    const started = drain(transport).find(
      (e) =>
        e.eventType === EVENT_TYPE.LIFECYCLE &&
        e.payload === LIFECYCLE_CODE.START,
    );
    assert.ok(started, "a START lifecycle event reaches subscribers");

    server.handleFrame(encodeRunCtrl(RUN_ACTION.STOP), "link-1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(host.started, false);
    telemetry.flushAll();
    const stopped = drain(transport).find(
      (e) =>
        e.eventType === EVENT_TYPE.LIFECYCLE &&
        e.payload === LIFECYCLE_CODE.STOP,
    );
    assert.ok(stopped, "a STOP lifecycle event reaches subscribers");
  });

  it("reports a rejected start as a FAILED transition with detail", async () => {
    const { server, telemetry, transport } = await wiredServer((graph) => {
      graph.addNode({ entity_id: "broken", component: "nothere/Missing" });
    });
    server.handleFrame(encodeRunCtrl(RUN_ACTION.START), "link-1");
    // Let the rejected start settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
    telemetry.flushAll();
    const events = drain(transport);
    const failed = events.find(
      (e) =>
        e.eventType === EVENT_TYPE.LIFECYCLE &&
        e.payload === LIFECYCLE_CODE.FAILED,
    );
    assert.ok(failed, "a FAILED lifecycle event reaches subscribers");
    const error = events.find((e) => e.eventType === EVENT_TYPE.ERROR);
    assert.match(error?.payload ?? "", /start failed/);
  });
});

describe("execution protocol: engine gaps", () => {
  it("reports pause as unsupported, without faking it", async () => {
    const { server, telemetry, transport } = await wiredServer(
      (graph) => graph,
    );
    /** @type {any[]} */
    const unsupported = [];
    server.addEventListener("unsupported", (event) =>
      unsupported.push(event.detail),
    );
    server.handleFrame(encodeRunCtrl(RUN_ACTION.PAUSE), "link-1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    telemetry.flushAll();
    assert.equal(unsupported.length, 1);
    assert.equal(unsupported[0].hook, "pause");
    const error = drain(transport).pop();
    assert.equal(error?.eventType, EVENT_TYPE.ERROR);
    assert.match(error?.payload ?? "", /pause is not supported/);
  });

  it("reports resume and step as unsupported", async () => {
    const { server, telemetry, transport } = await wiredServer(
      (graph) => graph,
    );
    server.handleFrame(encodeRunCtrl(RUN_ACTION.RESUME), "link-1");
    server.handleFrame(encodeRunCtrl(RUN_ACTION.STEP), "link-1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    telemetry.flushAll();
    const errors = drain(transport).filter(
      (e) => e.eventType === EVENT_TYPE.ERROR,
    );
    assert.equal(errors.length, 2);
  });

  it("reports breakpoints and process disable as unsupported", async () => {
    const { server, telemetry, transport } = await wiredServer(
      (graph) => graph,
    );
    /** @type {any[]} */
    const unsupported = [];
    server.addEventListener("unsupported", (event) =>
      unsupported.push(event.detail),
    );
    server.handleFrame(
      encodeBreakpointSet({ breakpointId: "bp-1", nodeId: "node-1" }),
      "link-1",
    );
    server.handleFrame(encodeBreakpointClear(null), "link-1");
    server.handleFrame(
      encodeProcessCtrl({ nodeId: "node-1", action: 0x01 }),
      "link-1",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    telemetry.flushAll();
    assert.equal(unsupported.length, 3);
    const errors = drain(transport).filter(
      (e) => e.eventType === EVENT_TYPE.ERROR,
    );
    assert.equal(errors.length, 3);
  });
});

describe("execution protocol: high-water mark", () => {
  it("records the mark as pending configuration for the next build", async () => {
    const { server, telemetry, transport, host } = await wiredServer((graph) =>
      graph.addNode({ entity_id: "echo", component: "runtime/Echo" }),
    );
    server.handleFrame(encodeHwmSet(16), "link-1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(host.pendingHighWaterMark, 16);
    telemetry.flushAll();
    // Nothing on the stream: the network is not running, nothing is
    // deferred.
    assert.equal(drain(transport).length, 0);
  });

  it("signals deferral when the network already runs", async () => {
    const { server, telemetry, transport } = await wiredServer((graph) =>
      graph.addNode({ entity_id: "echo", component: "runtime/Echo" }),
    );
    server.handleFrame(encodeRunCtrl(RUN_ACTION.START), "link-1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    server.handleFrame(encodeHwmSet(16), "link-1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    telemetry.flushAll();
    const deferred = drain(transport).filter(
      (e) =>
        e.eventType === EVENT_TYPE.ERROR &&
        /high-water mark/.test(e.payload ?? ""),
    );
    assert.equal(deferred.length, 1);
  });
});
