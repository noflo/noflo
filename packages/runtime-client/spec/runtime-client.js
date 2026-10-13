import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  encodeCompManifest,
  encodeCrdtStaleEpoch,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  encodeCrdtUpToDate,
  encodePlaneList,
  encodePlaneListRes,
  RuntimeClient,
} from "../src/index.js";
import { FakeLink } from "./support/fake-link.js";

/** Build a client over a fake link. */
function makeClient() {
  const link = new FakeLink();
  const client = new RuntimeClient({
    link,
    auth: { protocolVersion: 2, capabilityMask: 0x01 },
  });
  return { link, client };
}

describe("RuntimeClient", () => {
  it("sends raw payloads over the link", async () => {
    const { link, client } = makeClient();
    const payload = new Uint8Array([0x01, 0x02]);
    await client.send(payload);
    assert.equal(link.sent.length, 1);
    assert.deepEqual(link.sent[0], payload);
  });

  it("syncRegistry requests the manifest and decodes entries", async () => {
    const { link, client } = makeClient();
    const pending = client.syncRegistry("stale");
    setTimeout(
      () =>
        link.deliver(
          encodeCompManifest("reg-hash-1", {
            "math/Add": {
              sigHash: "a".repeat(64),
              type: "elementary",
            },
          }),
        ),
      10,
    );
    const manifest = await pending;
    assert.equal(manifest.cmd, 0x22);
    assert.deepEqual(Object.keys(manifest.entries), ["math/Add"]);
    assert.equal(manifest.entries["math/Add"].sigHash, "a".repeat(64));
  });

  it("syncGraph fetches and imports the baseline on stale epoch", async () => {
    const { link, client } = makeClient();
    const canonical = {
      name: "main",
      nodes: [{ id: "node-1", component: "math/Add" }],
    };
    link.resources.set(
      "res-hash-1",
      new TextEncoder().encode(JSON.stringify(canonical)),
    );

    const pending = client.syncGraph({ epochId: "0000" });
    // Deliver the stale-epoch reply after the sync request flushes
    setTimeout(() => {
      setTimeout(() => {
        link.deliver(encodeCrdtStaleEpoch(null, "epoch-7", "res-hash-1"));
      }, 10);
    }, 10);
    const result = await pending;

    assert.equal(result.upToDate, false);
    assert.equal(result.epochId, "epoch-7");
    assert.equal(result.graph.name, "main");
    assert.deepEqual(
      result.graph.serialize().nodes.map((n) => n.entity_id),
      ["node-1"],
    );
    // The sync request was sent with the client's epoch
    assert.deepEqual(link.sent[0], encodeCrdtSyncReq(null, "0000", {}));
  });

  it("keeps the mirror on up-to-date", async () => {
    const { link, client } = makeClient();
    client.epoch = "epoch-9";
    const pending = client.syncGraph({ epochId: "epoch-9" });
    setTimeout(() => {
      link.deliver(encodeCrdtUpToDate(null, "epoch-9"));
    }, 10);
    const result = await pending;
    assert.equal(result.upToDate, true);
    assert.equal(result.epochId, "epoch-9");
  });

  it("re-emits 0x14 ops as op events", async () => {
    const { link, client } = makeClient();
    /** @type {any[]} */
    const ops = [];
    client.addEventListener("op", (event) => {
      ops.push(event.detail.op);
    });
    link.deliver(
      encodeCrdtUpdate({
        planeId: null,
        clientId: "peer-1",
        logicalClock: 3,
        opType: 1,
        entityId: "node-9",
        payload: { component: "math/Add" },
      }),
    );
    assert.equal(ops.length, 1);
    assert.equal(ops[0].entityId, "node-9");
  });

  it("lists planes", async () => {
    const { link, client } = makeClient();
    const pending = client.planes();
    link.deliver(encodePlaneListRes([]));
    const res = await pending;
    assert.deepEqual(res.entries, []);
  });

  it("tears down the link on close", async () => {
    const { link, client } = makeClient();
    await client.close();
    assert.equal(link.teardownCalls, 1);
  });
});
