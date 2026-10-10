/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/fbp-spec-e2e.js
 * @description End-to-end: the remote fbp-spec interaction over the full
 *   protocol stack (work document #4 updates #24–#38). A spec runner
 *   connects to an assembled runtime, mints an ephemeral plane, builds a
 *   fixture graph via CRDT ops, starts the plane's network with `0x40`,
 *   sends sequenced case inputs through `0x47 CMD_PACKET_SEND`, observes
 *   results on the `0x32` telemetry stream, and tears the plane down with
 *   `0x15 CMD_PLANE_DROP`.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import {
  CMD_GET_STATUS,
  decodeFlowtraceChunk,
  decodeGetStatusRes,
  decodePlaneListRes,
  EVENT_TYPE,
  encodeCrdtUpdate,
  encodeGetStatus,
  encodePacketSend,
  encodePlaneDrop,
  encodePlaneList,
  encodePubsubSub,
  encodeRunCtrl,
  OP_TYPE,
  RUN_ACTION,
} from "@noflo/fbp-protocol";
import { GraphModel } from "@noflo/graph";
import { Component, ComponentLoader } from "@noflo/noflo";
import { assembleRuntime } from "../src/index.js";

/** Capture transport. */
function capture() {
  /** @type {{ sent: { bytes: Uint8Array, context: any }[] }} */
  const log = { sent: [] };
  return {
    log,
    send: (bytes, context) => log.sent.push({ bytes, context }),
  };
}

/** Collect decoded flowtrace events from the captured frames. */
function drainFlowtrace(log) {
  return log.sent
    .map((entry) => entry.bytes)
    .map((bytes) => {
      try {
        return decodeFlowtraceChunk(bytes);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .flatMap((chunk) => chunk.events);
}

describe("remote fbp-spec interaction over the full protocol stack", () => {
  it("mints a plane, builds a fixture, runs cases, and tears down", async () => {
    // --- Setup: a component + loader for the fixture ---
    class Pass extends Component {
      constructor() {
        super({
          description: "Passes data through",
          inPorts: { in: { datatype: "all" } },
          outPorts: { out: { datatype: "all" } },
        });
        this.process(function process(input, output) {
          if (!input.hasData("in")) {
            return;
          }
          output.sendDone({ out: input.getData("in") });
        });
      }
    }
    const loader = new ComponentLoader({
      registry: {
        list: () => ({ "test/Pass": { getComponent: () => new Pass() } }),
        get: (name) =>
          name === "test/Pass"
            ? Promise.resolve({ getComponent: () => new Pass() })
            : Promise.resolve(undefined),
      },
    });

    const transport = capture();
    const runtime = await assembleRuntime({
      graph: new GraphModel({ name: "main" }),
      catalog: { signatures: () => ({}) },
      componentLoader: loader,
      capabilityPolicy: () => 0xff,
      capabilities: [
        "GRAPH_READ",
        "GRAPH_EDIT",
        "TELEMETRY_READ",
        "LIFECYCLE_CTRL",
      ],
      send: (bytes, context) => transport.send(bytes, context),
      broadcast: (bytes, except) => transport.send(bytes, except),
      autostart: false,
    });
    await runtime.server.authorize("link-1", "test-identity");

    const send = (bytes) => runtime.server.handleFrame(bytes, "link-1");
    /** @type {string} */
    const PLANE = "spec-plane-001";

    // --- Step 1: build the fixture on the ephemeral plane via 0x14 ops ---
    send(
      encodeCrdtUpdate({
        planeId: PLANE,
        clientId: "spec-runner",
        logicalClock: 1,
        opType: OP_TYPE.INSERT_NODE,
        entityId: "pass",
        payload: { component: "test/Pass" },
      }),
    );
    send(
      encodeCrdtUpdate({
        planeId: PLANE,
        clientId: "spec-runner",
        logicalClock: 2,
        opType: OP_TYPE.INSERT_EXPORT,
        entityId: null,
        payload: {
          direction: "inport",
          public: "in",
          internal: { node: "pass", port: "in" },
        },
      }),
    );
    send(
      encodeCrdtUpdate({
        planeId: PLANE,
        clientId: "spec-runner",
        logicalClock: 3,
        opType: OP_TYPE.INSERT_EXPORT,
        entityId: null,
        payload: {
          direction: "outport",
          public: "out",
          internal: { node: "pass", port: "out" },
        },
      }),
    );

    // --- Step 2: list the planes — main + ephemeral must both be there ---
    send(encodePlaneList());
    const listFrame = transport.log.sent
      .map((entry) => entry.bytes)
      .map((bytes) => {
        try {
          return decodePlaneListRes(bytes);
        } catch {
          return null;
        }
      })
      .filter(Boolean)[0];
    assert.ok(listFrame, "the plane list reply arrives");
    assert.ok(
      listFrame.entries.some(
        (e) => e.planeId === PLANE && e.kind === "ephemeral",
      ),
      "the ephemeral plane appears in the listing",
    );

    // --- Step 3: subscribe to telemetry before starting ---
    send(
      encodePubsubSub({
        subId: "spec-telemetry",
        targetType: "network",
        targetId: "main",
        requestedFlushIntervalMs: 0,
      }),
    );

    // --- Step 4: start the ephemeral plane's network ---
    send(encodeRunCtrl(RUN_ACTION.START, PLANE));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // --- Step 5: send a case input through 0x47 ---
    send(encodePacketSend({ planeId: PLANE, port: "in", payload: "hello" }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    runtime.telemetry.flushAll();

    // --- Step 6: observe results on the telemetry stream ---
    const events = drainFlowtrace(transport.log);
    const dataEvents = events.filter((e) => e.eventType === EVENT_TYPE.DATA);
    assert.ok(dataEvents.length > 0, "a DATA event reaches the subscriber");

    // --- Step 7: query the status ---
    send(encodeGetStatus());
    const statusFrames = transport.log.sent.filter((entry) => {
      try {
        return decodeGetStatusRes(entry.bytes).cmd === CMD_GET_STATUS;
      } catch {
        return false;
      }
    });
    assert.ok(statusFrames.length > 0, "the status reply arrives");
    const status = decodeGetStatusRes(statusFrames[0].bytes);
    assert.equal(status.advertisedMask, runtime.server.capabilityMask);

    // --- Step 8: tear down with 0x15 ---
    send(encodePlaneDrop(PLANE));

    // Clean up
    await runtime.host.stop();
  });

  it("materializes an ephemeral plane on first op and converges", async () => {
    class Pass extends Component {
      constructor() {
        super({
          inPorts: { in: { datatype: "all" } },
          outPorts: { out: { datatype: "all" } },
        });
        this.process(function process(input, output) {
          if (!input.hasData("in")) return;
          output.sendDone({ out: input.getData("in") });
        });
      }
    }
    const loader = new ComponentLoader({
      registry: {
        list: () => ({ "test/Pass": { getComponent: () => new Pass() } }),
        get: (name) =>
          name === "test/Pass"
            ? Promise.resolve({ getComponent: () => new Pass() })
            : Promise.resolve(undefined),
      },
    });
    const transport = capture();
    const runtime = await assembleRuntime({
      graph: new GraphModel({ name: "main" }),
      catalog: { signatures: () => ({}) },
      componentLoader: loader,
      capabilityPolicy: () => 0xff,
      capabilities: ["GRAPH_READ", "GRAPH_EDIT"],
      send: (bytes, context) => transport.send(bytes, context),
      autostart: false,
    });
    await runtime.server.authorize("link-1", "test-identity");

    // Ops on an unknown plane materialize it
    runtime.server.handleFrame(
      encodeCrdtUpdate({
        planeId: "spec-1",
        clientId: "spec-runner",
        logicalClock: 1,
        opType: OP_TYPE.INSERT_NODE,
        entityId: "n1",
        payload: { component: "test/Pass" },
      }),
      "link-1",
    );

    // The plane is now listed
    runtime.server.handleFrame(encodePlaneList(), "link-1");
    const listFrame = transport.log.sent
      .map((entry) => entry.bytes)
      .map((bytes) => {
        try {
          return decodePlaneListRes(bytes);
        } catch {
          return null;
        }
      })
      .filter(Boolean)[0];
    assert.ok(listFrame);
    assert.ok(
      listFrame.entries.some((e) => e.planeId === "spec-1"),
      "the ephemeral plane appears after materialization",
    );
  });
});
