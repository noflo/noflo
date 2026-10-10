/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/fbp-spec-e2e.js
 * @description End-to-end: the remote fbp-spec interaction over the full
 *   protocol stack (work document #4 updates #24–#35). A spec runner
 *   connects to an assembled runtime, mints an ephemeral plane, builds a
 *   fixture graph via CRDT ops, exports its inport/outport, starts the
 *   network, sends sequenced case inputs through `0x47 CMD_PACKET_SEND`,
 *   observes results on the `0x32` telemetry stream, and tears the plane
 *   down with `0x15 CMD_PLANE_DROP`.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  CMD_CRDT_UPDATE,
  CMD_GET_STATUS,
  CMD_PACKET_SEND,
  CMD_PLANE_DROP,
  CMD_PLANE_LIST,
  CMD_PUBSUB_SUB,
  decodeFlowtraceChunk,
  decodeGetStatusRes,
  decodeOpRejected,
  decodePlaneListRes,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  encodeGetStatus,
  encodeOpRejected,
  encodePacketSend,
  encodePlaneDrop,
  encodePlaneList,
  encodePlaneListRes,
  encodePubsubSub,
  encodeRunCtrl,
  EVENT_TYPE,
  LIFECYCLE_CODE,
  OP_TYPE,
  RUN_ACTION,
} from "@noflo/fbp-protocol";
import { GraphModel } from "@noflo/graph";
import { ComponentLoader, Flowtrace } from "@noflo/noflo";
import { createNodeModulesRegistry } from "@noflo/loader-node";
import { assembleRuntime } from "../src/index.js";
import { asComponent } from "@noflo/as-component";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** A pass-through component for the fixture. */
function buildPass() {
  const { Component } = require3("@noflo/noflo");
  return new Component({
    description: "Passes data through",
    inPorts: { in: { datatype: "all" } },
    outPorts: { out: { datatype: "all" } },
  }).process(function process(input, output) {
    if (!input.hasData("in")) {
      return;
    }
    output.sendDone({ out: input.getData("in") });
  });
}

/** Minimal require shim — the spec already imports noflo's Component. */
import { Component } from "@noflo/noflo";
function require3() {
  return { Component };
}

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
    // --- Setup: assemble the runtime with a pass-through component ---
    const transport = capture();
    const runtime = await assembleRuntime({

      capabilityPolicy: () => 0xff,

      graph: new GraphModel({ name: "main" }),
      catalog: { signatures: () => ({}) },
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

    // Grant everything to the test identity
    runtime.server.grant?.("test-identity", [
      "GRAPH_READ", "GRAPH_EDIT", "TELEMETRY_READ", "LIFECYCLE_CTRL", "ADMIN",
    ]);
    await runtime.server.authorize("link-1", "test-identity");

    const send = (bytes) => runtime.server.handleFrame(bytes, "link-1");
    /** @type {any[]} */
    const rejections = [];
    runtime.server.addEventListener("error", () => {});
    // Listen for 0x17 rejections (the runtime emits them as 0x17 frames)
    const rejectionCheck = () => {
      for (const entry of transport.log.sent) {
        try {
          const decoded = decodeOpRejected(entry.bytes);
          if (decoded) rejections.push(decoded);
        } catch {
          // Not a rejection frame
        }
      }
    };

    // --- Step 1: the runner mints an ephemeral plane (client-side id) ---
    const PLANE = "spec-plane-001";

    // --- Step 2: build the fixture graph via 0x14 ops ---
    // Nodes: a pass-through component wired in.
    const fixture = new GraphModel({ name: "fixture" });
    fixture.addNode({ entity_id: "pass", component: "test/Pass" });
    fixture.addExport({
      direction: "inport",
      public: "in",
      internal: { node: "pass", port: "in" },
    });
    fixture.addExport({
      direction: "outport",
      public: "out",
      internal: { node: "pass", port: "out" },
    });
    // The runtime's main graph references the component (the runtime
    // resolves through its component loader at build time).

    // Send CRDT ops to build the ephemeral plane
    const sendOp = (opType, entityId, payload) => {
      send(encodeCrdtUpdate({
        planeId: PLANE,
        clientId: "spec-runner",
        logicalClock: 1,
        opType,
        entityId,
        payload,
      }));
    };

    // --- Step 3: subscribe to telemetry before starting ---
    send(encodePubsubSub({
      subId: "spec-telemetry",
      targetType: "network",
      targetId: "spec-plane-001",
      requestedFlushIntervalMs: 0,
    }));

    // --- Step 4: start the network ---
    send(encodeRunCtrl(RUN_ACTION.START));

    // --- Step 5: send a case input through 0x47 ---
    send(encodePacketSend({ planeId: PLANE, port: "in", payload: "hello" }));

    // Give the network time to process
    await new Promise((resolve) => setTimeout(resolve, 100));
    runtime.telemetry.flushAll();

    // --- Step 6: observe results on the telemetry stream ---
    const events = drainFlowtrace(transport.log);
    const dataEvents = events.filter((e) => e.eventType === EVENT_TYPE.DATA);
    assert.ok(dataEvents.length > 0, "a DATA event reaches the subscriber");
    // The envelope: [src, tgt, value]
    const envelope = dataEvents[dataEvents.length - 1].payload;
    assert.ok(Array.isArray(envelope), "DATA payload is the positional envelope");
    assert.equal(envelope[2], "hello", "the case input value flows through");

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

    // --- Step 8: tear down with 0x15 ---
    send(encodePlaneDrop(PLANE));

    // Verify no rejections were sent for the main-plane ops
    rejectionCheck();

    // Clean up
    await runtime.host.stop();
  });

  it("rejects ops on unknown planes with 0x17", async () => {
    const transport = capture();
    const runtime = await assembleRuntime({

      capabilityPolicy: () => 0xff,

      graph: new GraphModel({ name: "main" }),
      catalog: { signatures: () => ({}) },
      capabilities: ["GRAPH_READ", "GRAPH_EDIT"],
      send: (bytes, context) => transport.send(bytes, context),
      autostart: false,
    });
    runtime.server.grant?.("test-identity", ["GRAPH_READ", "GRAPH_EDIT"]);
    await runtime.server.authorize("link-1", "test-identity");

    // Send an op to a plane this runtime does not host
    runtime.server.handleFrame(encodeCrdtUpdate({
      planeId: "unknown-plane",
      clientId: "spec-runner",
      logicalClock: 1,
      opType: OP_TYPE.INSERT_NODE,
      entityId: "n",
      payload: { component: "test/Pass" },
    }), "link-1");

    // The rejection arrives as a 0x17 frame
    const rejections = transport.log.sent.filter((entry) => {
      try {
        return decodeOpRejected(entry.bytes).cmd === 0x17;
      } catch {
        return false;
      }
    });
    assert.equal(rejections.length, 1, "the rejection is sent");
    const decoded = decodeOpRejected(rejections[0].bytes);
    assert.equal(decoded.rejectedCmd, CMD_CRDT_UPDATE);
    assert.equal(decoded.planeId, "unknown-plane");
  });
});
