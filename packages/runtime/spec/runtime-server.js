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
  CMD_COMP_INSTALL_REQ,
  CMD_CRDT_SYNC_REQ,
  CMD_CRDT_UPDATE,
  CMD_RUN_CTRL,
  decodeAuthResponse,
  encodeAuthResponse,
  encodeCompInstallReq,
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
import { staticPolicy } from "./policy.js";

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
    const server = new RuntimeServer({ capabilityPolicy: staticPolicy() });
    assert.equal(
      server.capabilityMask,
      CAPABILITY.GRAPH_READ |
        CAPABILITY.METADATA_SYNC |
        CAPABILITY.TELEMETRY_READ |
        CAPABILITY.COMPONENT_READ,
    );
    assert.equal(server.limitationCode, LIMITATION.FULL_ACCESS);
  });

  it("sends the auth response with the advertised version and mask", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: ["GRAPH_READ", "GRAPH_EDIT"],
      limitationCode: LIMITATION.HARDWARE_CONSTRAINED,
    });
    await server.authorize("link-1", "test-identity");
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

  it("round-trips its own auth response through the protocol codec", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: 0xff,
    });
    await server.authorize("link-1", "test-identity");
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
          runtimeMetadata: server.runtimeMetadata,
          advertisedMask: server.capabilityMask,
        }),
      ],
    );
  });
});

describe("RuntimeServer permissions (DACAR)", () => {
  it("resolves the granted mask at authorize time", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy(
      { aabb: ["GRAPH_READ", "GRAPH_EDIT", "LIFECYCLE_CTRL"] },
      ["GRAPH_READ"],
    );
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: ["GRAPH_READ", "GRAPH_EDIT", "LIFECYCLE_CTRL"],
    });
    await server.authorize("link-1", "aabb");
    await server.authorize("link-2", "ccdd");
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

  it("enforces per context after authorize", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: ["GRAPH_READ", "GRAPH_EDIT", "LIFECYCLE_CTRL"],
    });
    const handled = [];
    server.registerHandler(CMD_RUN_CTRL, (decoded) => handled.push(decoded));
    await server.authorize("granted-link", "aabb");
    server.handleFrame(encodeRunCtrl(RUN_ACTION.START), "granted-link");
    assert.equal(handled.length, 1);
    // The other link was never authorized: fail closed, run control is
    // not granted.
    /** @type {any[]} */
    const dropped = [];
    server.addEventListener("notpermitted", (event) =>
      dropped.push(event.detail),
    );
    server.handleFrame(encodeRunCtrl(RUN_ACTION.START), "other-link");
    assert.equal(handled.length, 1);
    assert.equal(dropped.length, 1);
  });

  it("keeps the global mask when no permissions store is configured", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: 0xff,
    });
    await server.authorize("link-1", "aabb");
    assert.equal(
      decodeAuthResponse(transport.log.sent[0].bytes).capabilityMask,
      0xff,
    );
    await server.authorize("link-2", "test-identity");
    assert.equal(
      decodeAuthResponse(transport.log.sent[1].bytes).capabilityMask,
      0xff,
    );
  });

  it("grants and revokes identities between links", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy({}, ["GRAPH_READ"]);
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: ["GRAPH_READ", "COMPONENT_WRITE"],
    });
    serverPolicy.grant("aabb", ["COMPONENT_WRITE"]);
    await server.authorize("link-1", "aabb");
    assert.equal(
      decodeAuthResponse(transport.log.sent[0].bytes).capabilityMask,
      CAPABILITY.COMPONENT_WRITE,
    );
    serverPolicy.revoke("aabb");
    await server.authorize("link-2", "aabb");
    assert.equal(
      decodeAuthResponse(transport.log.sent[1].bytes).capabilityMask,
      CAPABILITY.GRAPH_READ,
    );
  });

  it("resolves capabilities through one shared identity-based seam", async () => {
    const serverPolicy = staticPolicy({ aabb: ["GRAPH_EDIT"] }, ["GRAPH_READ"]);
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      capabilities: ["GRAPH_READ", "GRAPH_EDIT"],
    });
    // The same resolution authorize applies, consultable by identity.
    assert.equal(
      await server.resolveCapabilities("aabb"),
      CAPABILITY.GRAPH_EDIT,
    );
    assert.equal(
      await server.resolveCapabilities("ccdd"),
      CAPABILITY.GRAPH_READ,
    );
    // Without a verified identity the resolution denies closed.
    assert.equal(await server.resolveCapabilities(undefined), 0);
    // A rejecting authorization plane throws from the seam; authorize
    // turns that into an error event and denies the link closed.
    const failing = new RuntimeServer({
      capabilityPolicy: () => {
        throw new Error("authorization plane down");
      },
    });
    /** @type {any[]} */
    const errors = [];
    failing.addEventListener("error", (event) => errors.push(event.detail));
    await assert.rejects(
      () => failing.resolveCapabilities("aabb", null),
      /plane down/,
    );
    await failing.authorize("link-1", "aabb");
    assert.equal(failing.grantedFor("link-1"), 0);
    assert.equal(errors.length, 1);
  });
});

describe("RuntimeServer frame routing", () => {
  it("dispatches frames to the handler registered for their command", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
    });
    /** @type {any[]} */
    const seen = [];
    server.registerHandler(CMD_CRDT_SYNC_REQ, (decoded, context) => {
      seen.push({ decoded, context });
    });
    await server.authorize("link-1", "test-identity");
    server.handleFrame(encodeCrdtSyncReq(null, 1, { a: 1 }), "link-1");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].decoded.cmd, CMD_CRDT_SYNC_REQ);
    assert.equal(seen[0].decoded.epochId, 1);
    assert.equal(seen[0].context, "link-1");
  });

  it("emits unhandledframe for commands with no handler", () => {
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
    });
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
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
    });
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
    // Oversized hostile frames surface only as a diagnostic prefix: the
    // event detail must not become a log-amplification channel.
    server.handleFrame(new Uint8Array(1024).fill(0x00), "link-1");
    assert.equal(events.length, 4);
    assert.equal(events[3].bytes.length, 256);
  });

  it("drops commands requiring unadvertised capabilities", () => {
    const transport = capture();
    // Default mask has no GRAPH_EDIT: a 0x14 mutation is not permitted.
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
    });
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

  it("drops install requests from read-only contexts and admits granted ones", async () => {
    const transport = capture();
    // The reader is granted only the read surface; the runtime advertises
    // COMPONENT_WRITE, so the writer's grant survives the intersection.
    const serverPolicy = staticPolicy(
      { "test-identity": ["GRAPH_READ", "TELEMETRY_READ"] },
      0,
    );
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: ["GRAPH_READ", "TELEMETRY_READ", "COMPONENT_WRITE"],
    });
    const handled = [];
    /** @type {any[]} */
    const dropped = [];
    server.registerHandler(CMD_COMP_INSTALL_REQ, (decoded) =>
      handled.push(decoded),
    );
    server.addEventListener("notpermitted", (event) =>
      dropped.push(event.detail),
    );
    await server.authorize("reader-link", "test-identity");
    server.handleFrame(
      encodeCompInstallReq("npm:@noflo/strings@2.0.0"),
      "reader-link",
    );
    assert.equal(handled.length, 0);
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].required, CAPABILITY.COMPONENT_WRITE);
    // A peer granted COMPONENT_WRITE may install packages.
    serverPolicy.grant("aabb", ["COMPONENT_WRITE"]);
    await server.authorize("writer-link", "aabb");
    server.handleFrame(
      encodeCompInstallReq("npm:@noflo/strings@2.0.0"),
      "writer-link",
    );
    assert.equal(handled.length, 1);
    assert.equal(handled[0].packageUri, "npm:@noflo/strings@2.0.0");
  });

  it("drops graph syncs from contexts without GRAPH_READ", async () => {
    const transport = capture();
    // Fallback zero: an identity without a grant is denied everything.
    const serverPolicy = staticPolicy({}, 0);
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
    });
    const handled = [];
    /** @type {any[]} */
    const dropped = [];
    server.registerHandler(CMD_CRDT_SYNC_REQ, (decoded) =>
      handled.push(decoded),
    );
    server.addEventListener("notpermitted", (event) =>
      dropped.push(event.detail),
    );
    await server.authorize("denied-link", "test-identity");
    server.handleFrame(encodeCrdtSyncReq(null, "0000", {}), "denied-link");
    assert.equal(handled.length, 0);
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].required, CAPABILITY.GRAPH_READ);
    // An identity granted GRAPH_READ: syncs are admitted.
    serverPolicy.grant("reader-identity", ["GRAPH_READ"]);
    const openPolicy = staticPolicy({ "reader-identity": ["GRAPH_READ"] });
    const open = new RuntimeServer({
      capabilityPolicy: openPolicy,
      send: transport.send,
    });
    open.registerHandler(CMD_CRDT_SYNC_REQ, (decoded) => handled.push(decoded));
    await open.authorize("reader-link", "reader-identity");
    open.handleFrame(encodeCrdtSyncReq(null, "0000", {}), "reader-link");
    assert.equal(handled.length, 1);
  });

  it("admits commands whose advertised capability covers them", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: ["GRAPH_READ", "GRAPH_EDIT"],
    });
    const handled = [];
    server.registerHandler(CMD_CRDT_UPDATE, (decoded) => handled.push(decoded));
    await server.authorize("link-1", "test-identity");
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

  it("denies commands from contexts that were never authorized", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: 0xff,
    });
    const handled = [];
    /** @type {any[]} */
    const dropped = [];
    server.registerHandler(CMD_CRDT_UPDATE, (decoded) => handled.push(decoded));
    server.addEventListener("notpermitted", (event) =>
      dropped.push(event.detail),
    );
    // The context never went through authorize: fail closed, whatever the
    // permissions store or advertised capabilities say.
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
    // Once authorized, the granted mask applies.
    await server.authorize("link-1", "test-identity");
    server.handleFrame(
      encodeCrdtUpdate({
        clientId: "a",
        logicalClock: 2,
        opType: 1,
        entityId: "n",
        payload: null,
      }),
      "link-1",
    );
    assert.equal(handled.length, 1);
  });

  it("survives handler failures without throwing", async () => {
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
    });
    /** @type {any[]} */
    const errors = [];
    server.addEventListener("error", (event) => errors.push(event.detail));
    server.registerHandler(CMD_CRDT_SYNC_REQ, () => {
      throw new Error("handler blew up");
    });
    await server.authorize("link-1", "test-identity");
    server.handleFrame(encodeCrdtSyncReq(null, 1, { a: 1 }), "link-1");
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
  assert.equal(bytes[0], 0x96); // fixarray(6)
  assert.equal(bytes[1], 0x02); // CMD_AUTH_RESPONSE
}
