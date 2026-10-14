import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CMD_CRDT_UPDATE,
  decodeCrdtUpdate,
  encodeCrdtStaleEpoch,
  encodeCrdtUpToDate,
  encodeOpRejected,
  OP_TYPE,
} from "@noflo/fbp-protocol";
import { RuntimeClient } from "@noflo/runtime-client";
import {
  addEdge,
  addExport,
  addGroup,
  addIip,
  addNode,
  applyGraphOp,
  describeRejection,
  OpRejectedError,
  REASON_NAMES,
  removeEntity,
  setMetadata,
} from "../src/index.js";
import { FakeLink } from "./support/fake-link.js";

/** Build a session with a CRDT identity over a fake link. */
function makeSession() {
  const link = new FakeLink();
  const client = new RuntimeClient({
    link,
    auth: { protocolVersion: 2, capabilityMask: 0x1f },
    clientId: "cli-1",
  });
  return { link, session: { client, auth: client.auth, nodeName: "test" } };
}

/** Encode a baseline snapshot into the fake link's resource store. */
function serveBaseline(link, hash, document) {
  link.resources.set(hash, new TextEncoder().encode(JSON.stringify(document)));
}

/**
 * The wire op a command sent: the FakeLink records raw payloads; the
 * modification flow also emits the epoch sync request, so filter for
 * `0x14`.
 *
 * @param {FakeLink} link
 * @param {number} [index]
 * @returns {ReturnType<typeof decodeCrdtUpdate>}
 */
function sentOp(link, index = 0) {
  const updates = link.sent.filter((payload) => {
    try {
      return decodeCrdtUpdate(payload).cmd === CMD_CRDT_UPDATE;
    } catch {
      return false;
    }
  });
  return decodeCrdtUpdate(updates[index]);
}

describe("fbp-client modification", () => {
  it("add-node sends a stamped INSERT_NODE and confirms via the resync", async () => {
    const { link, session } = makeSession();
    const baseline = {
      name: "main",
      nodes: [{ entity_id: "node-1", component: "math/Add" }],
    };
    serveBaseline(link, "res-1", baseline);
    const pending = addNode(session, {
      component: "math/Add",
      id: "node-1",
      metadata: { x: 10 },
    });
    setTimeout(() => {
      link.deliver(encodeCrdtStaleEpoch(null, "epoch-2", "res-1"));
    }, 10);
    const result = await pending;
    const op = sentOp(link);
    assert.equal(op.opType, OP_TYPE.INSERT_NODE);
    assert.equal(op.clientId, "cli-1");
    assert.equal(op.logicalClock, 1);
    assert.equal(op.entityId, "node-1");
    assert.deepEqual(op.payload, {
      component: "math/Add",
      metadata: { x: 10 },
    });
    assert.equal(result.applied, true);
    assert.equal(result.epochId, "epoch-2");
    assert.equal(result.entity?.entity_id, "node-1");
  });

  it("mints a unique entity id when none is given", async () => {
    const { link, session } = makeSession();
    serveBaseline(link, "res-1", { name: "main", nodes: [] });
    const pending = addNode(session, { component: "math/Add" });
    setTimeout(() => {
      link.deliver(encodeCrdtStaleEpoch(null, "epoch-2", "res-1"));
    }, 10);
    const result = await pending;
    const op = sentOp(link);
    assert.match(op.entityId, /^[0-9a-f-]{36}$/);
    assert.equal(result.entity, null);
  });

  it("surfaces a 0x17 rejection with its reason", async () => {
    const { link, session } = makeSession();
    const pending = addNode(session, { component: "math/Add", id: "node-1" });
    // The runtime answers the refusal before (and in link order ahead
    // of) the sync handshake
    link.deliver(
      encodeOpRejected({
        rejectedCmd: CMD_CRDT_UPDATE,
        planeId: null,
        detail: {
          clientId: "cli-1",
          logicalClock: 1,
          entityId: "node-1",
          reason: 'Node "node-1" already exists',
        },
      }),
    );
    setTimeout(() => {
      link.deliver(encodeCrdtUpToDate(null, "0000"));
    }, 10);
    let error;
    try {
      await pending;
      assert.fail("the modification should have been rejected");
    } catch (caught) {
      error = caught;
    }
    assert.ok(error instanceof OpRejectedError);
    assert.match(error.message, /rejected .*Node "node-1" already exists/);
    assert.equal(error.rejection.detail.entityId, "node-1");
  });

  it("reports a converged no-op as not applied", async () => {
    const { link, session } = makeSession();
    // Tombstoning an unknown entity converges silently: the runtime's
    // epoch stands, the resync comes back up-to-date
    session.client.epoch = "epoch-1";
    const pending = removeEntity(session, "ghost");
    setTimeout(() => {
      link.deliver(encodeCrdtUpToDate(null, "epoch-1"));
    }, 10);
    const result = await pending;
    const op = sentOp(link);
    assert.equal(op.opType, OP_TYPE.TOMBSTONE);
    assert.equal(op.payload, null);
    assert.equal(result.applied, false);
  });

  it("add-edge shapes the wire payload", async () => {
    const { link, session } = makeSession();
    serveBaseline(link, "res-1", { name: "main", nodes: [] });
    const pending = addEdge(session, {
      from: { node: "a", port: "out", index: 1 },
      to: { node: "b", port: "in" },
      id: "edge-1",
    });
    setTimeout(() => {
      link.deliver(encodeCrdtStaleEpoch(null, "epoch-2", "res-1"));
    }, 10);
    await pending;
    const op = sentOp(link);
    assert.equal(op.opType, OP_TYPE.INSERT_EDGE);
    assert.deepEqual(op.payload, {
      from: { node: "a", port: "out", index: 1 },
      to: { node: "b", port: "in" },
    });
  });

  it("add-iip shapes the wire payload", async () => {
    const { link, session } = makeSession();
    serveBaseline(link, "res-1", { name: "main", nodes: [] });
    const pending = addIip(session, {
      to: { node: "b", port: "in" },
      data: { hello: "world" },
      id: "iip-1",
    });
    setTimeout(() => {
      link.deliver(encodeCrdtStaleEpoch(null, "epoch-2", "res-1"));
    }, 10);
    await pending;
    const op = sentOp(link);
    assert.equal(op.opType, OP_TYPE.INSERT_IIP);
    assert.deepEqual(op.payload, {
      to: { node: "b", port: "in" },
      data: { hello: "world" },
    });
  });

  it("add-export shapes the wire payload", async () => {
    const { link, session } = makeSession();
    serveBaseline(link, "res-1", { name: "main", nodes: [] });
    const pending = addExport(session, {
      direction: "outport",
      public: "result",
      internal: { node: "b", port: "out" },
      id: "exp-1",
    });
    setTimeout(() => {
      link.deliver(encodeCrdtStaleEpoch(null, "epoch-2", "res-1"));
    }, 10);
    await pending;
    const op = sentOp(link);
    assert.equal(op.opType, OP_TYPE.INSERT_EXPORT);
    assert.deepEqual(op.payload, {
      direction: "outport",
      public: "result",
      internal: { node: "b", port: "out" },
    });
  });

  it("add-group shapes the wire payload", async () => {
    const { link, session } = makeSession();
    serveBaseline(link, "res-1", { name: "main", nodes: [] });
    const pending = addGroup(session, {
      name: "math",
      nodes: ["a", "b"],
      id: "group-1",
    });
    setTimeout(() => {
      link.deliver(encodeCrdtStaleEpoch(null, "epoch-2", "res-1"));
    }, 10);
    await pending;
    const op = sentOp(link);
    assert.equal(op.opType, OP_TYPE.INSERT_GROUP);
    assert.deepEqual(op.payload, { name: "math", nodes: ["a", "b"] });
  });

  it("set-metadata emits UI_METADATA, graph-level when the id is nil", async () => {
    const { link, session } = makeSession();
    serveBaseline(link, "res-1", { name: "main" });
    const pending = setMetadata(session, null, { env: "prod" });
    setTimeout(() => {
      link.deliver(encodeCrdtStaleEpoch(null, "epoch-2", "res-1"));
    }, 10);
    await pending;
    const op = sentOp(link);
    assert.equal(op.opType, OP_TYPE.UI_METADATA);
    assert.equal(op.entityId, null);
    assert.deepEqual(op.payload, { env: "prod" });
  });

  it("waits for the rejection instead of the resync on named planes", async () => {
    const { link, session } = makeSession();
    const pending = addNode(session, {
      component: "math/Add",
      id: "node-1",
      planeId: "test-fixture",
    });
    // The plane op is refused: the 0x17 arrives within the confirm
    // window, and no epoch handshake was sent for the ephemeral plane
    setTimeout(
      () =>
        link.deliver(
          encodeOpRejected({
            rejectedCmd: CMD_CRDT_UPDATE,
            planeId: "test-fixture",
            detail: {
              reason: "the sg/ plane id prefix is reserved",
            },
          }),
        ),
      10,
    );
    let error;
    try {
      await pending;
      assert.fail("the plane op should have been rejected");
    } catch (caught) {
      error = caught;
    }
    assert.ok(error instanceof OpRejectedError);
    assert.match(error.message, /sg\//);
    // One 0x14 sent, zero 0x10 sync requests
    assert.equal(link.sent.length, 1);
  });

  it("validates the semantic inputs before any wire traffic", async () => {
    const { link, session } = makeSession();
    await assert.rejects(addNode(session, { component: "" }), /component/);
    await assert.rejects(
      () =>
        addExport(session, {
          direction: "sideways",
          public: "x",
          internal: { node: "a", port: "b" },
        }),
      /direction/,
    );
    await assert.rejects(
      () => addGroup(session, { name: "g", nodes: [] }),
      /member/,
    );
    await assert.rejects(
      () => addIip(session, { to: { node: "a", port: "b" } }),
      /data/,
    );
    // set-metadata and remove validate synchronously
    assert.throws(() => setMetadata(session, "n", [1, 2]), /metadata object/);
    assert.throws(() => removeEntity(session, ""), /entity id/);
    assert.equal(link.sent.length, 0);
  });

  it("refuses to emit ops without a CRDT client id", async () => {
    const { link, session } = makeSession();
    session.client.clientId = null;
    await assert.rejects(
      applyGraphOp(session, { opType: 1, entityId: "n", payload: {} }),
      /client id/,
    );
    assert.equal(link.sent.length, 0);
  });
});

describe("rejection rendering", () => {
  it("renders numeric reason codes with their vocabulary names", () => {
    assert.equal(
      describeRejection({
        rejectedCmd: 0x14,
        planeId: null,
        detail: { reason: 0x02 },
      }),
      "rejected (permission-denied)",
    );
    assert.equal(REASON_NAMES[0x0b], "unknown-target");
  });

  it("renders free-form op rejection reasons with the message", () => {
    assert.equal(
      describeRejection({
        rejectedCmd: 0x14,
        planeId: null,
        detail: { reason: "Edge is already connected", message: "extra" },
      }),
      "rejected (Edge is already connected): extra",
    );
  });
});
