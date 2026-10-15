//     @noflo/runtime-client - FBP Protocol 2.0 client over Reticulum
//     SPDX-License-Identifier: EUPL-1.2
//     @file spec/schema-cache.js
//     @description The client-side schema store (work document #37 §6):
//       digest-verified bodies only, closure completeness client-checked,
//       and poisoned entries discarded rather than trusted.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodeSchemaReq,
  digestSchema,
  encodeSchemaRes,
} from "@noflo/fbp-protocol";
import { SchemaCache } from "../src/schema-cache.js";

const POINT = { $id: "canvas/point", type: "object", required: ["x"] };
const POINT_DIGEST = await digestSchema(POINT);
// Published bodies pin their references: the $ref carries the digest
const LINE = {
  $id: "canvas/line",
  allOf: [{ $ref: `urn:noflo:canvas/point@${POINT_DIGEST}` }],
  properties: { y: { type: "number" } },
};
const LINE_DIGEST = await digestSchema(LINE);

/** Scripted transport: one 0x29 reply per 0x28 request. */
function scripted(replies) {
  /** @type {Array<{ digests: Uint8Array[], bundle: boolean }>} */
  const requests = [];
  return {
    requests,
    requestReply: async (payload) => {
      requests.push(decodeSchemaReq(payload));
      const reply = replies.shift();
      if (!reply) {
        throw new Error("no scripted reply");
      }
      return reply;
    },
  };
}

describe("SchemaCache", () => {
  it("fetches digest-verified bodies and serves them locally", async () => {
    const { requestReply, requests } = scripted([
      encodeSchemaRes({ [POINT_DIGEST]: POINT }),
    ]);
    const cache = new SchemaCache({ requestReply });
    const fetched = await cache.fetch([POINT_DIGEST]);
    assert.deepEqual(fetched.get(POINT_DIGEST), POINT);
    assert.ok(cache.has(POINT_DIGEST));
    assert.deepEqual(cache.body(POINT_DIGEST), POINT);
    // The request carried the raw digest and the default bundle flag
    assert.equal(requests[0].bundle, true);
    assert.equal(requests[0].digests.length, 1);
  });

  it("discards a body failing its digest check and treats it as absent", async () => {
    const digest = "a".repeat(64);
    const poisoned = { $id: "canvas/point", type: "string" };
    const { requestReply } = scripted([
      encodeSchemaRes({ [digest]: poisoned }),
    ]);
    const cache = new SchemaCache({ requestReply });
    const fetched = await cache.fetch([digest]);
    assert.equal(fetched.size, 0);
    assert.ok(!cache.has(digest));
  });

  it("skips nil and resource-backed entries", async () => {
    const digest = "b".repeat(64);
    const { requestReply } = scripted([
      encodeSchemaRes({ [digest]: "rns:resourcehash" }),
    ]);
    const cache = new SchemaCache({ requestReply });
    const fetched = await cache.fetch([digest]);
    assert.equal(fetched.size, 0);
    assert.ok(!cache.has(digest));
  });

  it("reports closure completeness against the local cache", async () => {
    const { requestReply } = scripted([
      // The bundle brings the line's $ref closure along
      encodeSchemaRes({ [LINE_DIGEST]: LINE, [POINT_DIGEST]: POINT }),
    ]);
    const cache = new SchemaCache({ requestReply });
    const fetched = await cache.fetch([LINE_DIGEST]);
    assert.ok(fetched.has(LINE_DIGEST));
    assert.ok(fetched.has(POINT_DIGEST));
    assert.ok(cache.isClosureComplete([LINE_DIGEST]));
    assert.deepEqual(cache.missing([LINE_DIGEST]), []);
  });

  it("marks a fetched root unusable while its closure is incomplete", async () => {
    const { requestReply, requests } = scripted([
      // No bundling honored: only the root comes back
      encodeSchemaRes({ [LINE_DIGEST]: LINE }),
      // The follow-up request for the missing digest is served
      encodeSchemaRes({ [POINT_DIGEST]: POINT }),
    ]);
    const cache = new SchemaCache({ requestReply });
    await cache.fetch([LINE_DIGEST]);
    assert.ok(cache.has(LINE_DIGEST));
    // The referenced point digest is missing from the local cache
    const missing = cache.missing([LINE_DIGEST]);
    assert.equal(missing.length, 1);
    assert.equal(missing[0], POINT_DIGEST);
    assert.equal(cache.isClosureComplete([LINE_DIGEST]), false);
    // The follow-up request targets the missing digest only
    await cache.fetch(missing, { bundle: false });
    assert.equal(requests[1].digests.length, 1);
    assert.equal(requests[1].bundle, false);
  });

  it("makes no wire round trip for already-held digests", async () => {
    const { requestReply, requests } = scripted([
      encodeSchemaRes({ [POINT_DIGEST]: POINT }),
    ]);
    const cache = new SchemaCache({ requestReply });
    await cache.fetch([POINT_DIGEST]);
    await cache.fetch([POINT_DIGEST]);
    assert.equal(requests.length, 1);
    assert.ok(cache.isClosureComplete([POINT_DIGEST]));
  });
});
