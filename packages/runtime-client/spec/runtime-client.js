import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeCompDetailReq,
  decodeCrdtUpdate,
  encodeAnnounceAppData,
  encodeCompDetailRes,
  encodeOpRejected,
} from "@noflo/fbp-protocol";
import {
  discoverRuntime,
  encodeCompManifest,
  encodeCompSourceRes,
  encodeCrdtStaleEpoch,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  encodeCrdtUpToDate,
  encodeGetStatusRes,
  encodePlaneListRes,
  RUN_STATE,
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

  it("status sends 0x48 and decodes the reply", async () => {
    const { link, client } = makeClient();
    const pending = client.status();
    setTimeout(
      () =>
        link.deliver(
          encodeGetStatusRes({
            epochId: "epoch-3",
            runState: RUN_STATE.PAUSED,
            uptimeMs: 12_345,
            advertisedMask: 0x1f,
          }),
        ),
      10,
    );
    const reply = await pending;
    assert.equal(reply.runState, RUN_STATE.PAUSED);
    assert.equal(reply.uptimeMs, 12_345);
    assert.equal(reply.advertisedMask, 0x1f);
  });

  it("getSource reads component source over 0x26", async () => {
    const { link, client } = makeClient();
    const pending = client.getSource("mylib/Repeat");
    setTimeout(
      () =>
        link.deliver(
          encodeCompSourceRes("mylib/Repeat", "export const Repeat = 1;"),
        ),
      10,
    );
    const reply = await pending;
    assert.equal(reply.componentName, "mylib/Repeat");
    assert.equal(reply.source, "export const Repeat = 1;");
  });

  it("setSource writes component source over 0x25", async () => {
    const { link, client } = makeClient();
    await client.setSource("mylib/Repeat", "export const Repeat = 2;");
    assert.equal(link.sent.length, 1);
    assert.equal(link.sent[0][0], 0x93, "msgpack fixarray(3) header");
    assert.equal(link.sent[0][1], 0x25, "comp write opcode");
  });

  it("syncComponents runs the two-step registry flow", async () => {
    const { link, client } = makeClient();
    const pending = client.syncComponents();
    // 1. The sync request: answer with a manifest
    link.deliver(
      encodeCompManifest("reg-hash-1", {
        "math/Add": {
          sigHash: "a".repeat(64),
          type: "elementary",
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    // 2. The detail request: answer with the signature
    assert.deepEqual(
      link.sent.length,
      2,
      "detail request follows the manifest",
    );
    const detailReq = decodeCompDetailReq(link.sent[1]);
    assert.deepEqual(detailReq.names, ["math/Add"]);
    link.deliver(
      encodeCompDetailRes({
        "math/Add": {
          type: "elementary",
          in: [{ id: "a", type: "number", required: true }],
          out: [{ id: "sum", type: "number" }],
        },
      }),
    );
    const catalog = await pending;
    assert.equal(catalog["math/Add"].sigHash, "a".repeat(64));
    assert.ok(catalog["math/Add"].signature, "detail cached");
  });

  it("syncGraph fetches and imports the baseline on stale epoch", async () => {
    const { link, client } = makeClient();
    const canonical = {
      name: "main",
      nodes: [{ entity_id: "node-1", component: "math/Add" }],
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

  it("stamps sendGraphOp with the client id and the next clock", async () => {
    const { link, client } = makeClient();
    client.clientId = "cli-1";
    await client.sendGraphOp({
      opType: 1,
      entityId: "node-1",
      payload: { component: "math/Add" },
    });
    await client.sendGraphOp({
      opType: 4,
      entityId: "node-2",
      payload: null,
    });
    assert.equal(link.sent.length, 2);
    const first = decodeCrdtUpdate(link.sent[0]);
    assert.equal(first.clientId, "cli-1");
    assert.equal(first.logicalClock, 1);
    const second = decodeCrdtUpdate(link.sent[1]);
    assert.equal(second.logicalClock, 2);
  });

  it("refuses sendGraphOp without a client id", async () => {
    const { link, client } = makeClient();
    await assert.rejects(
      client.sendGraphOp({ opType: 1, entityId: "n", payload: {} }),
      /clientId/,
    );
    assert.equal(link.sent.length, 0);
  });

  it("re-emits 0x17 rejections as oprejected events", () => {
    const { link, client } = makeClient();
    /** @type {any[]} */
    const rejections = [];
    client.addEventListener("oprejected", (event) => {
      rejections.push(event.detail);
    });
    link.deliver(
      encodeOpRejected({
        rejectedCmd: 0x14,
        planeId: null,
        detail: {
          clientId: "cli-1",
          logicalClock: 1,
          entityId: "node-1",
          reason: 'Node "node-1" already exists',
        },
      }),
    );
    assert.equal(rejections.length, 1);
    assert.equal(rejections[0].rejectedCmd, 0x14);
    assert.equal(rejections[0].detail.entityId, "node-1");
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

describe("discoverRuntime", () => {
  /** A transport double with a destination cache and announce events. */
  function fakeReticulum({ cache = [], livePath = false }) {
    const listeners = [];
    const knownDestinations = new Map(cache);
    const reticulum = {
      transport: {
        caches: { knownDestinations },
        nextHop: () => (livePath ? new Uint8Array(16) : null),
        addEventListener: (type, listener) => {
          if (type === "announce") {
            listeners.push(listener);
          }
        },
        removeEventListener: (type, listener) => {
          const i = listeners.indexOf(listener);
          if (i !== -1) {
            listeners.splice(i, 1);
          }
        },
        requestPath: async () => {},
      },
      /** Deliver an announce event to the transport listeners. */
      announce(appData) {
        for (const listener of [...listeners]) {
          listener({
            detail: { destinationHash: new Uint8Array(16), appData },
          });
        }
      },
    };
    return reticulum;
  }

  const destinationHash = new Uint8Array(16).fill(0xab);
  const appData = encodeAnnounceAppData({
    destinationHash,
    nodeName: "hello-runtime",
  });

  it("recalls a known runtime with a live path without waiting", async () => {
    const rns = fakeReticulum({
      cache: [[Buffer.from(destinationHash).toString("hex"), { appData }]],
      livePath: true,
    });
    const found = await discoverRuntime({ reticulum: rns, timeoutMs: 1_000 });
    assert.equal(found.nodeName, "hello-runtime");
    assert.deepEqual(new Uint8Array(found.destinationHash), destinationHash);
  });

  it("solicits a path request for a known runtime on a stale path", async () => {
    const rns = fakeReticulum({
      cache: [[Buffer.from(destinationHash).toString("hex"), { appData }]],
      livePath: false,
    });
    /** @type {Uint8Array[]} */
    const requested = [];
    rns.transport.requestPath = async (hash) => {
      requested.push(hash);
    };
    const pending = discoverRuntime({ reticulum: rns, timeoutMs: 5_000 });
    setTimeout(() => rns.announce(appData), 20);
    const found = await pending;
    assert.equal(requested.length, 1);
    assert.deepEqual(new Uint8Array(requested[0]), destinationHash);
    assert.equal(found.nodeName, "hello-runtime");
  });

  it("ignores cache entries that are not FBP runtimes", async () => {
    const rns = fakeReticulum({
      cache: [
        ["ff".repeat(16), { appData: new TextEncoder().encode("garbage") }],
      ],
      livePath: true,
    });
    const pending = discoverRuntime({ reticulum: rns, timeoutMs: 200 });
    await assert.rejects(pending, /announce/);
  });
});
