/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/graph-protocol.js
 * @description The CRDT graph synchronization server side: the epoch
 *   handshake over the canonical serialization, bidirectional `0x14` op
 *   flow with echo suppression, tombstone idempotence, and the total
 *   entity-kind mapping — driven end-to-end through the runtime core.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import {
  CMD_AUTH_RESPONSE,
  CMD_CRDT_STALE_EPOCH,
  CMD_CRDT_UP_TO_DATE,
  CMD_CRDT_UPDATE,
  decodeCrdtStaleEpoch,
  decodeCrdtUpdate,
  decodeCrdtUpToDate,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  OP_TYPE,
} from "@noflo/fbp-protocol";
import { GraphModel } from "@noflo/graph";
import { GraphProtocol, RuntimeServer } from "../src/index.js";
import { staticPolicy } from "./policy.js";

/** Capture transport with per-context delivery and exclusion support. */
function capture() {
  /** @type {{sent: {bytes: Uint8Array, context: any}[], broadcast: {bytes: Uint8Array, except: any}[]}} */
  const log = { sent: [], broadcast: [] };
  return {
    log,
    send(bytes, context) {
      log.sent.push({ bytes, context });
    },
    broadcast(bytes, except) {
      log.broadcast.push({ bytes, except });
    },
  };
}

/** Let async handlers (epoch hashing) settle. */
async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

/** Outbound frames with the unilateral auth responses excluded. */
function wire(transport) {
  return transport.log.sent.filter(
    (entry) => entry.bytes[1] !== CMD_AUTH_RESPONSE,
  );
}

/** A graph with one node, wired into a server via GraphProtocol. */
async function wiredServer(_graphCallback) {
  const graph = new GraphModel({ name: "main" });
  graph.addNode({ entity_id: "node-1", component: "math/Add" });
  const transport = capture();
  const serverPolicy = staticPolicy();
  const server = new RuntimeServer({
    capabilityPolicy: serverPolicy,
    send: transport.send,
    broadcast: transport.broadcast,
    capabilities: ["GRAPH_READ", "GRAPH_EDIT", "METADATA_SYNC"],
  });
  const protocol = new GraphProtocol({
    graph,
    clientId: "runtime",
    resourceProvider: async (bytes) => `resource-of-${bytes.length}-bytes`,
  });
  protocol.register(server);
  // Fail closed: contexts must be authorized before their frames count.
  await server.authorize("link-1", "test-identity");
  const epoch = await protocol.epoch();
  return { graph, server, protocol, transport, epoch };
}

/** Decode a broadcast 0x14 frame. */
function broadcastUpdate(transport, index = 0) {
  return decodeCrdtUpdate(transport.log.broadcast[index].bytes);
}

describe("graph protocol: epoch handshake", () => {
  it("derives the epoch id from the canonical serialization", async () => {
    const { protocol } = await wiredServer();
    const epoch = await protocol.epoch();
    assert.match(epoch, /^[0-9a-f]{64}$/);
    // Content-addressed: unchanged graph, unchanged epoch.
    assert.equal(await protocol.epoch(), epoch);
  });

  it("changes the epoch id when the graph changes", async () => {
    const { protocol, graph } = await wiredServer();
    const before = await protocol.epoch();
    graph.addNode({ entity_id: "node-2", component: "math/Sub" });
    const after = await protocol.epoch();
    assert.notEqual(after, before);
  });

  it("answers a matching sync with the up-to-date short-circuit", async () => {
    const { server, protocol, transport } = await wiredServer();
    const epoch = await protocol.epoch();
    server.handleFrame(
      encodeCrdtSyncReq(null, epoch, { "client-a": 5 }),
      "link-1",
    );
    await flush();
    const decoded = decodeCrdtUpToDate(wire(transport)[0].bytes);
    assert.equal(decoded.cmd, CMD_CRDT_UP_TO_DATE);
  });

  it("answers a stale sync with the new epoch and a baseline resource", async () => {
    const { server, protocol, transport } = await wiredServer();
    server.handleFrame(
      encodeCrdtSyncReq(null, "0000", { "client-a": 5 }),
      "link-1",
    );
    await flush();
    assert.equal(wire(transport).length, 1);
    const decoded = decodeCrdtStaleEpoch(wire(transport)[0].bytes);
    assert.equal(decoded.cmd, CMD_CRDT_STALE_EPOCH);
    assert.equal(decoded.newEpochId, await protocol.epoch());
    assert.match(decoded.rnsResourceHash, /^resource-of-\d+-bytes$/);
  });

  it("surfaces a missing resource provider as an unsupported event", async () => {
    const graph = new GraphModel({ name: "main" });
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: ["GRAPH_READ"],
    });
    const protocol = new GraphProtocol({ graph });
    await protocol.epoch();
    protocol.register(server);
    await server.authorize("link-1", "test-identity");
    /** @type {any[]} */
    const unsupported = [];
    server.addEventListener("unsupported", (event) =>
      unsupported.push(event.detail),
    );
    server.handleFrame(encodeCrdtSyncReq(null, "0000", {}), "link-1");
    await flush();
    assert.equal(unsupported.length, 1);
    assert.equal(unsupported[0].hook, "resourceProvider");
  });
});

describe("graph protocol: inbound operations", () => {
  it("applies an insert-node operation to the model", async () => {
    const { server, graph } = await wiredServer();
    server.handleFrame(
      encodeCrdtUpdate({
        planeId: null,
        clientId: "client-a",
        logicalClock: 3,
        opType: OP_TYPE.INSERT_NODE,
        entityId: "node-2",
        payload: { component: "math/Sub" },
      }),
      "link-1",
    );
    assert.equal(graph.node("node-2").component, "math/Sub");
  });

  it("converges the op log: rebroadcasts to everyone except the sender", async () => {
    const { server, transport } = await wiredServer();
    server.handleFrame(
      encodeCrdtUpdate({
        planeId: null,
        clientId: "client-a",
        logicalClock: 3,
        opType: OP_TYPE.INSERT_NODE,
        entityId: "node-2",
        payload: { component: "math/Sub" },
      }),
      "link-1",
    );
    assert.equal(transport.log.broadcast.length, 1);
    assert.equal(transport.log.broadcast[0].except, "link-1");
    const decoded = broadcastUpdate(transport);
    assert.equal(decoded.cmd, CMD_CRDT_UPDATE);
    assert.equal(decoded.clientId, "client-a");
    assert.equal(decoded.opType, OP_TYPE.INSERT_NODE);
  });

  it("does not echo applied operations back as new ops", async () => {
    const { server, transport } = await wiredServer();
    server.handleFrame(
      encodeCrdtUpdate({
        planeId: null,
        clientId: "client-a",
        logicalClock: 3,
        opType: OP_TYPE.INSERT_NODE,
        entityId: "node-2",
        payload: { component: "math/Sub" },
      }),
      "link-1",
    );
    // Exactly one broadcast (the convergence copy), no echo of the model's
    // own addNode event.
    assert.equal(transport.log.broadcast.length, 1);
  });

  it("treats tombstones as idempotent", async () => {
    const { server, transport } = await wiredServer();
    const frame = encodeCrdtUpdate({
      planeId: null,
      clientId: "client-a",
      logicalClock: 3,
      opType: OP_TYPE.TOMBSTONE,
      entityId: "node-1",
      payload: null,
    });
    server.handleFrame(frame, "link-1");
    server.handleFrame(frame, "link-1");
    assert.equal(transport.log.broadcast.length, 2);
  });

  it("applies metadata ops to entities and to graph-level metadata", async () => {
    const { server, graph } = await wiredServer();
    server.handleFrame(
      encodeCrdtUpdate({
        planeId: null,
        clientId: "client-a",
        logicalClock: 3,
        opType: OP_TYPE.UI_METADATA,
        entityId: "node-1",
        payload: { x: 10, y: 20 },
      }),
      "link-1",
    );
    assert.deepEqual(graph.node("node-1").metadata, { x: 10, y: 20 });
    server.handleFrame(
      encodeCrdtUpdate({
        planeId: null,
        clientId: "client-a",
        logicalClock: 4,
        opType: OP_TYPE.UI_METADATA,
        entityId: null,
        payload: { name: "Main" },
      }),
      "link-1",
    );
    assert.equal(graph.graphMetadata().name, "Main");
  });

  it("drops metadata ops for unknown entities", async () => {
    const { server, transport } = await wiredServer();
    server.handleFrame(
      encodeCrdtUpdate({
        planeId: null,
        clientId: "client-a",
        logicalClock: 3,
        opType: OP_TYPE.UI_METADATA,
        entityId: "nothere",
        payload: { x: 1 },
      }),
      "link-1",
    );
    assert.equal(transport.log.broadcast.length, 0);
  });

  it("caps the attacker-populated client clock map", async () => {
    // Three clients against a budget of two evicts the oldest-learned id.
    const graph = new GraphModel({ name: "main" });
    const protocol = new GraphProtocol({ graph, maxKnownClocks: 2 });
    const transport = capture();
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: transport.send,
      capabilities: ["GRAPH_READ", "GRAPH_EDIT"],
    });
    protocol.register(server);
    await server.authorize("link-1", "test-identity");
    for (const clientId of ["client-a", "client-b", "client-c"]) {
      server.handleFrame(
        encodeCrdtUpdate({
          planeId: null,
          clientId,
          logicalClock: 1,
          opType: OP_TYPE.INSERT_NODE,
          entityId: `node-${clientId}`,
          payload: { component: "math/Add" },
        }),
        "link-1",
      );
    }
    assert.equal(protocol.knownClocks.size, 2);
    // The oldest-learned client was evicted, the latest two remain.
    assert.equal(protocol.knownClocks.has("client-a"), false);
    assert.equal(protocol.knownClocks.has("client-c"), true);
  });

  it("treats the wire entity_id as authoritative over a payload override", async () => {
    const { server, graph } = await wiredServer();
    server.handleFrame(
      encodeCrdtUpdate({
        planeId: null,
        clientId: "client-a",
        logicalClock: 3,
        opType: OP_TYPE.INSERT_NODE,
        entityId: "wire-id",
        payload: {
          entity_id: "payload-id",
          component: "math/Add",
        },
      }),
      "link-1",
    );
    // A payload-supplied entity_id must not rename the entity behind the
    // protocol's back: the wire id names the entity.
    assert.equal(graph.node("wire-id").component, "math/Add");
    assert.equal(graph.node("payload-id"), undefined);
  });

  it("surfaces model rejections as protocol errors, not crashes", async () => {
    const { server } = await wiredServer();
    /** @type {any[]} */
    const errors = [];
    server.addEventListener("error", (event) => errors.push(event.detail));
    // Duplicate node id: the model rejects, the frame is malformed in
    // context.
    server.handleFrame(
      encodeCrdtUpdate({
        planeId: null,
        clientId: "client-a",
        logicalClock: 3,
        opType: OP_TYPE.INSERT_NODE,
        entityId: "node-1",
        payload: { component: "math/Sub" },
      }),
      "link-1",
    );
    assert.equal(errors.length, 1);
    assert.match(errors[0].error.message, /graph rejected operation/);
  });
});

describe("graph protocol: outbound operations", () => {
  it("maps local mutations to insert ops with the entity-definition payload", async () => {
    const { graph, transport } = await wiredServer();
    graph.addNode({ entity_id: "node-2", component: "math/Sub" });
    graph.addEdge({
      entity_id: "edge-1",
      from: { node: "node-1", port: "sum" },
      to: { node: "node-2", port: "a" },
    });
    graph.addIIP({
      entity_id: "iip-1",
      data: 42,
      to: { node: "node-1", port: "a" },
    });
    graph.addExport({
      entity_id: "export-1",
      direction: "inport",
      public: "start",
      internal: { node: "node-1", port: "a" },
    });
    graph.addGroup({
      entity_id: "group-1",
      name: "math",
      nodes: ["node-1", "node-2"],
    });
    const ops = transport.log.broadcast.map((entry) =>
      decodeCrdtUpdate(entry.bytes),
    );
    const [node, edge, iip, exp, group] = ops;
    assert.equal(node.opType, OP_TYPE.INSERT_NODE);
    assert.equal(node.entityId, "node-2");
    assert.deepEqual(node.payload, { component: "math/Sub" });
    assert.equal(node.clientId, "runtime");
    assert.equal(edge.opType, OP_TYPE.INSERT_EDGE);
    assert.deepEqual(edge.payload, {
      from: { node: "node-1", port: "sum" },
      to: { node: "node-2", port: "a" },
    });
    assert.equal(iip.opType, OP_TYPE.INSERT_IIP);
    assert.deepEqual(iip.payload, {
      to: { node: "node-1", port: "a" },
      data: 42,
    });
    assert.equal(exp.opType, OP_TYPE.INSERT_EXPORT);
    assert.deepEqual(exp.payload, {
      direction: "inport",
      public: "start",
      internal: { node: "node-1", port: "a" },
    });
    assert.equal(group.opType, OP_TYPE.INSERT_GROUP);
    assert.deepEqual(group.payload, {
      name: "math",
      nodes: ["node-1", "node-2"],
    });
    // The runtime's own clock increments per op.
    assert.deepEqual(
      ops.map((op) => op.logicalClock),
      [1, 2, 3, 4, 5],
    );
  });

  it("maps removals to tombstones and metadata changes to UI metadata", async () => {
    const { graph, transport } = await wiredServer();
    graph.setNodeMetadata("node-1", "x", 10);
    graph.removeNode("node-1");
    const ops = transport.log.broadcast.map((entry) =>
      decodeCrdtUpdate(entry.bytes),
    );
    assert.equal(ops[0].opType, OP_TYPE.UI_METADATA);
    assert.equal(ops[0].entityId, "node-1");
    assert.deepEqual(ops[0].payload, { x: 10 });
    assert.equal(ops[1].opType, OP_TYPE.TOMBSTONE);
    assert.equal(ops[1].entityId, "node-1");
  });

  it("maps graph-level metadata changes to nil-entity metadata ops", async () => {
    const { graph, transport } = await wiredServer();
    graph.setGraphMetadata("name", "Main");
    const decoded = broadcastUpdate(transport);
    assert.equal(decoded.opType, OP_TYPE.UI_METADATA);
    assert.equal(decoded.entityId, null);
    assert.deepEqual(decoded.payload, { name: "Main" });
  });

  it("surfaces renames as unsupported: they project at the changeset boundary", async () => {
    const { server, graph, transport } = await wiredServer();
    /** @type {any[]} */
    const unsupported = [];
    server.addEventListener("unsupported", (event) =>
      unsupported.push(event.detail),
    );
    graph.renameNode("node-1", "node-1-renamed");
    assert.equal(unsupported.length, 1);
    assert.equal(unsupported[0].hook, "renameNode");
    assert.equal(transport.log.broadcast.length, 0);
  });
});
