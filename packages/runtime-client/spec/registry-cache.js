import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeCompDetailReq,
  decodeCompSyncReq,
  encodeCompDetailRes,
  encodeCompManifest,
  encodeCompUpToDate,
  registryHash,
} from "@noflo/fbp-protocol";
import { RegistryCache } from "../src/registry-cache.js";
import { FakeLink } from "./support/fake-link.js";

describe("RegistryCache", () => {
  it("syncs with stale and fetches details for new entries", async () => {
    /** @type {Uint8Array[]} */
    const replies = [
      // The manifest reply for "stale"
      encodeCompManifest("reg-hash-1", {
        "math/Add": {
          sigHash: "a".repeat(64),
          type: "elementary",
        },
      }),
      // The detail reply
      encodeCompDetailRes({
        "math/Add": {
          type: "elementary",
          in: [{ id: "a", type: "number", required: true }],
          out: [{ id: "sum", type: "number" }],
        },
      }),
    ];
    /** @type {Uint8Array[]} */
    const sent = [];
    const cache = new RegistryCache({
      send: async () => {},
      requestReply: async (payload) => {
        sent.push(payload);
        const r = replies.shift();
        if (!r) {
          throw new Error("no scripted reply");
        }
        return r;
      },
    });

    const catalog = await cache.sync("stale");
    assert.equal(cache.registryHashValue(), "reg-hash-1");
    assert.ok(
      catalog["math/Add"].signature,
      "detail fetched for the new entry",
    );
    assert.equal(catalog["math/Add"].sigHash, "a".repeat(64));

    // The sync request carried the forced-stale hash
    const syncReq = decodeCompSyncReq(sent[0]);
    assert.equal(syncReq.localRegistryHash, "stale");
    // The detail request carried the component name
    const detailReq = decodeCompDetailReq(sent[1]);
    assert.deepEqual(detailReq.names, ["math/Add"]);
  });

  it("keeps details when the sig hash is unchanged", async () => {
    /** @type {Uint8Array[]} */
    const sent = [];
    /** @type {Uint8Array[]} */
    const replies = [
      // First sync (stale): the manifest
      encodeCompManifest("reg-hash-1", {
        "math/Add": {
          sigHash: "a".repeat(64),
          type: "elementary",
        },
      }),
      // The detail reply
      encodeCompDetailRes({
        "math/Add": {
          type: "elementary",
          in: [{ id: "a", type: "number", required: true }],
          out: [{ id: "sum", type: "number" }],
        },
      }),
      // Second sync with the same hash: the runtime answers up-to-date
      encodeCompUpToDate("reg-hash-1"),
    ];
    const cache = new RegistryCache({
      send: async () => {},
      requestReply: async (payload) => {
        sent.push(payload);
        const r = replies.shift();
        if (!r) {
          throw new Error("no scripted reply");
        }
        return r;
      },
    });

    const first = await cache.sync("stale");
    const firstSignature = first["math/Add"].signature;
    assert.ok(firstSignature, "detail fetched on first sync");

    // Second sync with the same registry hash: the runtime answers
    // up-to-date; the catalog and its cached details stand
    const localHash = await cache.computeLocalHash();
    const second = await cache.sync(localHash);
    assert.equal(second["math/Add"].signature, firstSignature);
  });

  it("computes the local registry hash", async () => {
    const cache = new RegistryCache({
      send: async () => {},
      requestReply: async () => new Uint8Array(),
    });
    const hash = await cache.computeLocalHash({
      "math/Add": {
        sigHash: "a".repeat(64),
        type: "elementary",
      },
    });
    assert.equal(typeof hash, "string");
    assert.ok(hash.length > 0);
  });
});
