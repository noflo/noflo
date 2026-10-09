/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/runtime-server.js
 * @description The transport-neutral runtime core: capability mapping, the
 *   `0x02` auth handshake, frame routing, and survival semantics for
 *   undecodable and unhandled frames.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  CAPABILITY,
  CMD_CRDT_SYNC_REQ,
  CMD_CRDT_UPDATE,
  CMD_RUN_CTRL,
  decodeAuthResponse,
  encodeAuthResponse,
  encodeCompSyncReq,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  encodeRunCtrl,
  LIMITATION,
  PROTOCOL_VERSION,
  ProtocolError,
  RUN_ACTION,
} from "@noflo/fbp-protocol";
import { capabilitiesMask, RuntimeServer } from "../src/index.js";

/** Capture transport: records frames per context. */
function capture() {
  /** @type {{sent: {bytes: Uint8Array, context: any}[], broadcast: Uint8Array[]}} */
  const log = { sent: [], broadcast: [] };
  return {
    log,
    send(bytes, context) {
      log.sent.push({ bytes, context });
    },
    broadcast(bytes) {
      log.broadcast.push(bytes);
    },
  };
}

describe("capabilitiesMask", () => {
  it("composes the bitwise mask from names", () => {
    assert.equal(
      capabilitiesMask(["GRAPH_READ", "GRAPH_EDIT", "LIFECYCLE_CTRL"]),
      CAPABILITY.GRAPH_READ | CAPABILITY.GRAPH_EDIT | CAPABILITY.LIFECYCLE_CTRL,
    );
    assert.equal(capabilitiesMask([]), 0);
  });

  it("rejects unknown capability names", () => {
    assert.throws(() => capabilitiesMask(["GRAPH_REED"]), ProtocolError);
  });
});

describe("RuntimeServer auth", () => {
  it("defaults to the read surface and full access", () => {
    const server = new RuntimeServer();
    assert.equal(
      server.capabilityMask,
      CAPABILITY.GRAPH_READ |
        CAPABILITY.METADATA_SYNC |
        CAPABILITY.TELEMETRY_READ |
        CAPABILITY.COMPONENT_READ,
    );
    assert.equal(server.limitationCode, LIMITATION.FULL_ACCESS);
  });

  it("sends the auth response with the advertised version and mask", () => {
    const transport = capture();
    const server = new RuntimeServer({
      send: transport.send,
      capabilities: ["GRAPH_READ", "GRAPH_EDIT"],
      limitationCode: LIMITATION.HARDWARE_CONSTRAINED,
    });
    server.authorize("link-1");
    assert.equal(transport.log.sent.length, 1);
    const { bytes, context } = transport.log.sent[0];
    assert.equal(context, "link-1");
    assertAuthFrameShape(bytes);
    const decoded = decodeAuthResponse(bytes);
    assert.equal(decoded.protocolVersion, PROTOCOL_VERSION);
    assert.equal(
      decoded.capabilityMask,
      CAPABILITY.GRAPH_READ | CAPABILITY.GRAPH_EDIT,
    );
    assert.equal(decoded.limitationCode, LIMITATION.HARDWARE_CONSTRAINED);
  });

  it("round-trips its own auth response through the protocol codec", () => {
    const transport = capture();
    const server = new RuntimeServer({
      send: transport.send,
      capabilities: 0xff,
    });
    server.authorize(null);
    const decoded = decodeAuthResponse(transport.log.sent[0].bytes);
    assert.equal(decoded.capabilityMask, 0xff);
    // The runtime's own encoding must equal the protocol codec's.
    assert.deepEqual(
      [...transport.log.sent[0].bytes],
      [
        ...encodeAuthResponse({
          protocolVersion: PROTOCOL_VERSION,
          capabilityMask: 0xff,
          limitationCode: LIMITATION.FULL_ACCESS,
        }),
      ],
    );
  });
});

describe("RuntimeServer permissions (DACAR)", () => {
  it("resolves the granted mask at authorize time", () => {
    const transport = capture();
    const server = new RuntimeServer({
      send: transport.send,
      capabilities: ["GRAPH_READ"],
      permissions: {
        default: ["GRAPH_READ"],
        identities: {
          aabb: ["GRAPH_READ", "GRAPH_EDIT", "LIFECYCLE_CTRL"],
        },
      },
    });
    server.authorize("link-1", "aabb");
    server.authorize("link-2", "ccdd");
    assert.equal(
      decodeAuthResponse(transport.log.sent[0].bytes).capabilityMask,
      CAPABILITY.GRAPH_READ | CAPABILITY.GRAPH_EDIT | CAPABILITY.LIFECYCLE_CTRL,
    );
    // An unknown identity falls back to the store's default.
    assert.equal(
      decodeAuthResponse(transport.log.sent[1].bytes).capabilityMask,
      CAPABILITY.GRAPH_READ,
    );
  });

  it("enforces per context after authorize", () => {
    const transport = capture();
    const server = new RuntimeServer({
      send: transport.send,
      capabilities: ["GRAPH_READ", "GRAPH_EDIT", "LIFECYCLE_CTRL"],
      permissions: {
        default: ["GRAPH_READ"],
        identities: { aabb: ["GRAPH_READ", "GRAPH_EDIT", "LIFECYCLE_CTRL"] },
      },
    });
    const handled = [];
    server.registerHandler(CMD_RUN_CTRL, (decoded) => handled.push(decoded));
    server.authorize("granted-link", "aabb");
    server.handleFrame(encodeRunCtrl(RUN_ACTION.START), "granted-link");
    assert.equal(handled.length, 1);
    // The default-mask link never identified: run control is not granted.
    /** @type {any[]} */
    const dropped = [];
    server.addEventListener("notpermitted", (event) =>
      dropped.push(event.detail),
    );
    server.handleFrame(encodeRunCtrl(RUN_ACTION.START), "other-link");
    assert.equal(handled.length, 1);
    assert.equal(dropped.length, 1);
  });

  it("keeps the global mask when no permissions store is configured", () => {
    const transport = capture();
    const server = new RuntimeServer({
      send: transport.send,
      capabilities: 0xff,
    });
    server.authorize("link-1", "aabb");
    assert.equal(
      decodeAuthResponse(transport.log.sent[0].bytes).capabilityMask,
      0xff,
    );
    server.authorize("link-2");
    assert.equal(
      decodeAuthResponse(transport.log.sent[1].bytes).capabilityMask,
      0xff,
    );
  });

  it("grants and revokes identities between links", () => {
    const transport = capture();
    const server = new RuntimeServer({
      send: transport.send,
      permissions: { default: ["GRAPH_READ"] },
    });
    server.grant("aabb", ["COMPONENT_WRITE"]);
    server.authorize("link-1", "aabb");
    assert.equal(
      decodeAuthResponse(transport.log.sent[0].bytes).capabilityMask,
      CAPABILITY.COMPONENT_WRITE,
    );
    server.revoke("aabb");
    server.authorize("link-2", "aabb");
    assert.equal(
      decodeAuthResponse(transport.log.sent[1].bytes).capabilityMask,
      CAPABILITY.GRAPH_READ,
    );
  });
});

describe("RuntimeServer frame routing", () => {
  it("dispatches frames to the handler registered for their command", () => {
    const transport = capture();
    const server = new RuntimeServer({ send: transport.send });
    /** @type {any[]} */
    const seen = [];
    server.registerHandler(CMD_CRDT_SYNC_REQ, (decoded, context) => {
      seen.push({ decoded, context });
    });
    server.handleFrame(encodeCrdtSyncReq(1, { a: 1 }), "link-1");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].decoded.cmd, CMD_CRDT_SYNC_REQ);
    assert.equal(seen[0].decoded.epochId, 1);
    assert.equal(seen[0].context, "link-1");
  });

  it("emits unhandledframe for commands with no handler", () => {
    const transport = capture();
    const server = new RuntimeServer({ send: transport.send });
    /** @type {any[]} */
    const events = [];
    server.addEventListener("unhandledframe", (event) =>
      events.push(event.detail),
    );
    server.handleFrame(encodeCompSyncReq("hash"), "link-1");
    assert.equal(events.length, 1);
    assert.equal(events[0].decoded.cmd, 0x20);
  });

  it("survives undecodable frames without throwing", () => {
    const transport = capture();
    const server = new RuntimeServer({ send: transport.send });
    /** @type {any[]} */
    const events = [];
    server.addEventListener("undecodable", (event) =>
      events.push(event.detail),
    );
    // Garbage bytes, an unknown opcode, and a truncated known frame.
    server.handleFrame(new Uint8Array([0x00]), "link-1");
    server.handleFrame(new Uint8Array([0x91, 0x55]), "link-1");
    server.handleFrame(new Uint8Array([0x92, 0x10]), "link-1");
    assert.equal(events.length, 3);
    assert.ok(events[0].error instanceof ProtocolError);
  });

  it("drops commands requiring unadvertised capabilities", () => {
    const transport = capture();
    // Default mask has no GRAPH_EDIT: a 0x14 mutation is not permitted.
    const server = new RuntimeServer({ send: transport.send });
    /** @type {any[]} */
    const dropped = [];
    const handled = [];
    server.addEventListener("notpermitted", (event) =>
      dropped.push(event.detail),
    );
    server.registerHandler(CMD_CRDT_UPDATE, (decoded) => handled.push(decoded));
    server.handleFrame(
      encodeCrdtUpdate({
        clientId: "a",
        logicalClock: 1,
        opType: 1,
        entityId: "n",
        payload: null,
      }),
      "link-1",
    );
    assert.equal(handled.length, 0);
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].required, CAPABILITY.GRAPH_EDIT);
  });

  it("admits commands whose advertised capability covers them", () => {
    const transport = capture();
    const server = new RuntimeServer({
      send: transport.send,
      capabilities: ["GRAPH_READ", "GRAPH_EDIT"],
    });
    const handled = [];
    server.registerHandler(CMD_CRDT_UPDATE, (decoded) => handled.push(decoded));
    server.handleFrame(
      encodeCrdtUpdate({
        clientId: "a",
        logicalClock: 1,
        opType: 1,
        entityId: "n",
        payload: null,
      }),
      "link-1",
    );
    assert.equal(handled.length, 1);
  });

  it("survives handler failures without throwing", () => {
    const transport = capture();
    const server = new RuntimeServer({ send: transport.send });
    /** @type {any[]} */
    const errors = [];
    server.addEventListener("error", (event) => errors.push(event.detail));
    server.registerHandler(CMD_CRDT_SYNC_REQ, () => {
      throw new Error("handler blew up");
    });
    server.handleFrame(encodeCrdtSyncReq(1, { a: 1 }), "link-1");
    assert.equal(errors.length, 1);
    assert.equal(errors[0].error.message, "handler blew up");
  });
});

/**
 * Pin the raw wire shape of the auth frame: fixarray(4) opening with the
 * `0x02` opcode (deeper layout is the protocol package's own pinned tests).
 *
 * @param {Uint8Array} bytes
 * @returns {void}
 */
function assertAuthFrameShape(bytes) {
  assert.equal(bytes[0], 0x94); // fixarray(4)
  assert.equal(bytes[1], 0x02); // CMD_AUTH_RESPONSE
}
