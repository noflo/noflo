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
  decodeAuthResponse,
  decodeCompSourceRes,
  decodeFlowtraceChunk,
  decodeGetStatusRes,
  decodeOpRejected,
  decodePlaneDrop,
  decodePlaneListRes,
  EVENT_TYPE,
  encodeCompSourceReq,
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
    // The ephemeral plane's events must carry the plane id — not null
    // (work document #4 update #33: one identifier per graph instance,
    // shared by telemetry and commands).
    const planeAttributed = transport.log.sent
      .map((entry) => entry.bytes)
      .map((bytes) => {
        try {
          return decodeFlowtraceChunk(bytes);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((chunk) =>
        chunk.events.some((e) => e.eventType === EVENT_TYPE.DATA),
      );
    assert.ok(planeAttributed.length > 0, "a chunk with DATA events exists");
    for (const chunk of planeAttributed) {
      assert.equal(
        chunk.planeId,
        PLANE,
        `chunk plane_id must be the ephemeral plane, got: ${chunk.planeId}`,
      );
    }

    // --- Step 7: query the status ---
    send(encodeGetStatus());
    await new Promise((resolve) => setTimeout(resolve, 10));
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

    // --- Step 8: tear down with 0x15 — the ack echoes to the requester ---
    const preDropCount = transport.log.sent.length;
    send(encodePlaneDrop(PLANE));
    assert.ok(
      transport.log.sent.length > preDropCount,
      "the drop ack echoes to the requester",
    );
    const dropAck = transport.log.sent
      .map((entry) => {
        try {
          return decodePlaneDrop(entry.bytes);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    assert.equal(dropAck.length, 1, "exactly one 0x15 ack frame");
    assert.equal(dropAck[0].planeId, PLANE, "the ack echoes the dropped plane");

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

describe("capability gating of the freeze-readiness commands", () => {
  /**
   * Assemble a runtime whose policy grants one link the full surface and
   * denies another entirely — the two sides of the per-frame gate.
   */
  async function gatedRuntime() {
    const transport = capture();
    const runtime = await assembleRuntime({
      graph: new GraphModel({ name: "main" }),
      catalog: { signatures: () => ({}) },
      componentLoader: new ComponentLoader({
        registry: {
          list: () => ({}),
          get: () => Promise.resolve(undefined),
        },
      }),
      capabilityPolicy: (identityHash) =>
        identityHash === "granted" ? 0xff : 0,
      capabilities: [
        "GRAPH_READ",
        "GRAPH_EDIT",
        "COMPONENT_READ",
        "TELEMETRY_READ",
        "LIFECYCLE_CTRL",
      ],
      send: (bytes, context) => transport.send(bytes, context),
      broadcast: (bytes, except) => transport.send(bytes, except),
      autostart: false,
    });
    await runtime.server.authorize("link-granted", "granted");
    await runtime.server.authorize("link-denied", "denied");
    return { runtime, transport };
  }

  /**
   * Frames the given link received, excluding the 0x02 auth response
   * every authorized context gets from authorize() itself.
   */
  function framesTo(transport, context) {
    return transport.log.sent.filter((entry) => {
      if (entry.context !== context) return false;
      try {
        return decodeAuthResponse(entry.bytes).cmd !== 0x02;
      } catch {
        return true;
      }
    });
  }

  it("denies 0x16 plane list to a context without grants", async () => {
    const { runtime, transport } = await gatedRuntime();
    runtime.server.handleFrame(encodePlaneList(), "link-granted");
    runtime.server.handleFrame(encodePlaneList(), "link-denied");
    assert.ok(
      framesTo(transport, "link-granted").some((entry) => {
        try {
          return decodePlaneListRes(entry.bytes).cmd === 0x16;
        } catch {
          return false;
        }
      }),
      "granted context gets the plane list",
    );
    assert.equal(
      framesTo(transport, "link-denied").length,
      0,
      "denied context gets silence",
    );
    await runtime.host.stop();
  });

  it("denies 0x15 plane drop to a context without grants", async () => {
    const { runtime, transport } = await gatedRuntime();
    runtime.server.handleFrame(encodePlaneDrop("spec-1"), "link-granted");
    runtime.server.handleFrame(encodePlaneDrop("spec-1"), "link-denied");
    const acks = framesTo(transport, "link-granted").filter((entry) => {
      try {
        return decodePlaneDrop(entry.bytes).cmd === 0x15;
      } catch {
        return false;
      }
    });
    assert.equal(acks.length, 1, "granted context gets the drop ack");
    assert.equal(
      framesTo(transport, "link-denied").length,
      0,
      "denied context gets silence",
    );
    await runtime.host.stop();
  });

  it("denies 0x47 packet send to a context without grants", async () => {
    const { runtime, transport } = await gatedRuntime();
    await runtime.server.handleFrame(
      encodePacketSend({ planeId: null, port: "in", payload: "x" }),
      "link-granted",
    );
    await runtime.server.handleFrame(
      encodePacketSend({ planeId: null, port: "in", payload: "x" }),
      "link-denied",
    );
    // The granted context's handler runs but the runtime holds no running
    // network for the main plane — it answers 0x17. The denied context is
    // gated before any handler runs and must get nothing.
    const rejections = framesTo(transport, "link-granted").filter((entry) => {
      try {
        return decodeOpRejected(entry.bytes).rejectedCmd === 0x47;
      } catch {
        return false;
      }
    });
    assert.equal(rejections.length, 1, "granted context gets the 0x17 answer");
    assert.equal(
      framesTo(transport, "link-denied").length,
      0,
      "denied context gets silence",
    );
    await runtime.host.stop();
  });

  it("denies 0x26 source read to a context without grants", async () => {
    const { runtime, transport } = await gatedRuntime();
    await runtime.server.handleFrame(
      encodeCompSourceReq("test/Pass"),
      "link-granted",
    );
    await runtime.server.handleFrame(
      encodeCompSourceReq("test/Pass"),
      "link-denied",
    );
    // The granted context gets the nil-source answer (the catalog holds
    // no readSource hook — SPEC: nil source when the runtime holds none).
    const answers = framesTo(transport, "link-granted").filter((entry) => {
      try {
        return decodeCompSourceRes(entry.bytes).cmd === 0x26;
      } catch {
        return false;
      }
    });
    assert.equal(answers.length, 1, "granted context gets the nil answer");
    assert.equal(
      framesTo(transport, "link-denied").length,
      0,
      "denied context gets silence",
    );
    await runtime.host.stop();
  });
});
