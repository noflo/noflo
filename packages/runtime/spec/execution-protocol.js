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
  CMD_PROCESS_LIST,
  COMPONENT_TYPE,
  decodeFlowtraceChunk,
  decodeOpRejected,
  decodeProcessList,
  EVENT_TYPE,
  EXECUTION_STATE,
  encodeBreakpointClear,
  encodeBreakpointSet,
  encodeHwmSet,
  encodeProcessCtrl,
  encodeProcessListReq,
  encodePubsubSub,
  encodeRunCtrl,
  LIFECYCLE_CODE,
  REASON,
  RUN_ACTION,
} from "@noflo/fbp-protocol";
import { GraphModel } from "@noflo/graph";
import { ComponentLoader } from "@noflo/noflo";
import {
  ExecutionProtocol,
  GraphProtocol,
  NetworkHost,
  RuntimeServer,
  TelemetryProtocol,
} from "../src/index.js";
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

/**
 * A runtime wired with the execution protocol against a real engine host.
 * Subscribed to its own telemetry so control outcomes come back as
 * flowtrace events. The builder wires the graph and registers components.
 *
 * @param {(graph: GraphModel, loader: ComponentLoader) => void} builder
 */
async function wiredServer(builder) {
  const transport = capture();
  const serverPolicy = staticPolicy();
  const server = new RuntimeServer({
    capabilityPolicy: serverPolicy,
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
  await server.authorize("link-1", "test-identity");
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
    .flatMap((sent) => {
      try {
        return decodeFlowtraceChunk(sent.bytes).events;
      } catch {
        // Non-chunk frames (0x17 rejections, replies) are not telemetry.
        return [];
      }
    });
}

/** Decode the 0x17 rejection frames a transport captured. */
function rejections(transport) {
  return transport.log.sent
    .map((sent) => {
      try {
        return decodeOpRejected(sent.bytes);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Wait until the predicate holds, polling on the macrotask queue. Fixed
 * sleeps race real async work — component loading, WebCrypto digests,
 * CI load — so conditions are waited on, not timed.
 *
 * @param {() => boolean} predicate
 * @param {string} what
 * @returns {Promise<void>}
 */
async function waitFor(predicate, what) {
  for (let attempts = 0; attempts < 200; attempts += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${what}`);
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
    // The START lifecycle record lands on the wire at flush time, so the
    // wait covers both the transition and its telemetry
    await waitFor(() => {
      telemetry.flushAll();
      return (
        host.running &&
        drain(transport).some(
          (e) =>
            e.eventType === EVENT_TYPE.LIFECYCLE &&
            e.payload === LIFECYCLE_CODE.START,
        )
      );
    }, "the network to start and report START");

    server.handleFrame(encodeRunCtrl(RUN_ACTION.STOP), "link-1");
    await waitFor(() => {
      telemetry.flushAll();
      return (
        !host.started &&
        drain(transport).some(
          (e) =>
            e.eventType === EVENT_TYPE.LIFECYCLE &&
            e.payload === LIFECYCLE_CODE.STOP,
        )
      );
    }, "the network to stop and report STOP");
  });

  it("reports a rejected start as a FAILED transition with detail", async () => {
    const { server, telemetry, transport } = await wiredServer((graph) => {
      graph.addNode({ entity_id: "broken", component: "nothere/Missing" });
    });
    server.handleFrame(encodeRunCtrl(RUN_ACTION.START), "link-1");
    await waitFor(() => {
      telemetry.flushAll();
      return drain(transport).some(
        (e) =>
          e.eventType === EVENT_TYPE.LIFECYCLE &&
          e.payload === LIFECYCLE_CODE.FAILED,
      );
    }, "the FAILED lifecycle event");
    const events = drain(transport);
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
    // The requesting context gets the explicit 0x17 with the reason code
    // (update #43): "this runtime cannot do this" is wire-visibility, not
    // silence.
    const rejection = rejections(transport).at(-1);
    assert.equal(rejection?.rejectedCmd, 0x40);
    assert.equal(rejection?.detail.reason, REASON.UNSUPPORTED);
    assert.match(rejection?.detail.message, /pause is not supported/);
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
    const { server, telemetry, transport, host } = await wiredServer((graph) =>
      graph.addNode({ entity_id: "echo", component: "runtime/Echo" }),
    );
    server.handleFrame(encodeRunCtrl(RUN_ACTION.START), "link-1");
    // The deferral is signaled when a network has been built — the host
    // defers high-water-mark changes to the next build once a network
    // exists, whether or not processes are active
    await waitFor(() => host.network != null, "the network to build");
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

describe("process listing (0x44 CMD_PROCESS_LIST_REQ)", () => {
  /**
   * A runtime wired with the graph protocol and a declared catalog, so the
   * listing reports the catalog's kinds. The graph carries a
   * catalog-declared component, plus one the catalog does not know unless
   * `withUnknown` is false — an unresolvable component cannot build a
   * network, so the running-state test omits it — and a placeholder node
   * unless `withPlaceholder` is false, whose absence of component must not
   * take the listing down.
   *
   * @param {boolean} [withUnknown]
   * @param {boolean} [withPlaceholder]
   */
  async function listingServer(withUnknown = true, withPlaceholder = true) {
    const transport = capture();
    const server = new RuntimeServer({
      capabilityPolicy: staticPolicy(),
      send: transport.send,
      capabilities: ["GRAPH_READ", "LIFECYCLE_CTRL", "TELEMETRY_READ"],
    });
    const graph = new GraphModel({ name: "main" });
    graph.addNode({ entity_id: "known", component: "runtime/Wait" });
    // The Wait process stays in-flight only once an IP activates it: the
    // IIP is what keeps the started network running
    graph.addIIP({
      entity_id: "iip-1",
      data: "go",
      to: { node: "known", port: "input" },
    });
    if (withUnknown) {
      graph.addNode({ entity_id: "unknown", component: "missing/Thing" });
    }
    if (withPlaceholder) {
      // Placeholder nodes carry no component (entities.js): the listing
      // must stay answerable with one present — wire silence over a
      // sketched node would be the failure mode the protocol forbids
      graph.addNode({ entity_id: "placeholder" });
    }
    const loader = new ComponentLoader();
    await registerWaitComponent(loader);
    const host = new NetworkHost({ graph, componentLoader: loader });
    const telemetry = new TelemetryProtocol({ host, flushFloorMs: 0 });
    const graphProtocol = new GraphProtocol({ graph, clientId: "runtime" });
    const execution = new ExecutionProtocol({
      host,
      telemetry,
      graphProtocol,
      componentDetails: () => ({
        "runtime/Wait": { type: "elementary", in: [], out: [] },
      }),
    });
    telemetry.register(server);
    graphProtocol.register(server);
    execution.register(server);
    await server.authorize("link-1", "test-identity");
    return { server, transport, host, graph, graphProtocol };
  }

  /** The 0x45 reply to a 0x44 request, decoded. A started network's
   * lifecycle telemetry may interleave; the listing is the one 0x45.
   *
   * The listing handler awaits the graph epoch hash — a WebCrypto digest
   * resolving on its own event-loop turn — so the reply's arrival time is
   * not one tick. Poll until a decodable reply shows up instead of
   * assuming one macrotask (this was a CI flake under load). */
  async function requestListing(server, transport) {
    const before = transport.log.sent.length;
    server.handleFrame(encodeProcessListReq(), "link-1");
    for (let attempts = 0; attempts < 100; attempts += 1) {
      const replies = transport.log.sent
        .slice(before)
        .map((sent) => {
          try {
            return decodeProcessList(sent.bytes);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      if (replies.length > 0) {
        return replies[0];
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("No PROCESS_LIST reply arrived");
  }

  it("lists the graph's nodes with declared kinds and the stopped state", async () => {
    const { server, transport, graphProtocol } = await listingServer();
    const listing = await requestListing(server, transport);
    assert.equal(listing.cmd, CMD_PROCESS_LIST);
    assert.equal(listing.epochId, await graphProtocol.epoch());
    assert.deepEqual(listing.entries.known, {
      component: "runtime/Wait",
      type: COMPONENT_TYPE.ELEMENTARY,
      state: EXECUTION_STATE.DISABLED,
    });
    // A component the catalog does not know lists as the unimplemented
    // marker: the kind vocabulary is declared data, never inferred
    assert.equal(listing.entries.unknown.type, COMPONENT_TYPE.STUB);
    // A placeholder node has no process to list: it is skipped, and the
    // listing still answers — one component-less node must not take the
    // whole listing into wire silence
    assert.equal(listing.entries.placeholder, undefined);
  });

  it("reports the enabled state once the network runs", async () => {
    const { server, transport, host } = await listingServer(false);
    await host.start();
    try {
      const listing = await requestListing(server, transport);
      assert.equal(listing.entries.known.state, EXECUTION_STATE.ENABLED);
    } finally {
      await host.stop();
    }
  });
});
