//     @noflo/fbp-protocol - FBP Protocol 2.0 over Reticulum
//     SPDX-License-Identifier: EUPL-1.2
//     @file spec/schema-protocol.js
//     @description The schema retrieval and write block (work document #37
//       §6): 0x28/0x29 round-trips with raw digests on the wire, the
//       all-nil answer, the inline size cap, and the 0x2a write forms.

import assert from "node:assert";
import { describe, it } from "node:test";

import { fromHex, MsgPack, toHex } from "@reticulum/core";
import {
  CMD_SCHEMA_REQ,
  CMD_SCHEMA_RES,
  CMD_SCHEMA_WRITE,
  decodeSchemaReq,
  decodeSchemaRes,
  decodeSchemaWrite,
  encodeSchemaReq,
  encodeSchemaRes,
  encodeSchemaWrite,
  SCHEMA_INLINE_LIMIT,
} from "../src/index.js";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

describe("0x28 CMD_SCHEMA_REQ", () => {
  it("round-trips digests and the bundle flag", () => {
    const decoded = decodeSchemaReq(
      encodeSchemaReq([fromHex(DIGEST_A), fromHex(DIGEST_B)], false),
    );
    assert.equal(decoded.cmd, CMD_SCHEMA_REQ);
    assert.deepEqual(decoded.digests.map(toHex), [DIGEST_A, DIGEST_B]);
    assert.equal(decoded.bundle, false);
  });

  it("defaults to closure bundling", () => {
    const decoded = decodeSchemaReq(encodeSchemaReq([fromHex(DIGEST_A)]));
    assert.equal(decoded.bundle, true);
  });

  it("carries digests as raw 32-byte bins on the wire", () => {
    const frame = MsgPack.decode(encodeSchemaReq([fromHex(DIGEST_A)]));
    assert.ok(frame[1][0] instanceof Uint8Array);
    assert.equal(frame[1][0].length, 32);
  });

  it("rejects malformed requests", () => {
    assert.throws(() => encodeSchemaReq([]));
    assert.throws(() => encodeSchemaReq(["nothex"]));
    assert.throws(() => encodeSchemaReq([fromHex(DIGEST_A)], "yes"));
  });
});

describe("0x29 CMD_SCHEMA_RES", () => {
  it("round-trips inline bodies, resource refs, and nil", () => {
    const body = { $id: "canvas/point", type: "object" };
    const decoded = decodeSchemaRes(
      encodeSchemaRes({
        [DIGEST_A]: body,
        [DIGEST_B]: "rns:resource-hash",
        ["c".repeat(64)]: null,
      }),
    );
    assert.equal(decoded.cmd, CMD_SCHEMA_RES);
    assert.deepEqual(decoded.bodies[DIGEST_A], body);
    assert.equal(decoded.bodies[DIGEST_B], "rns:resource-hash");
    assert.equal(decoded.bodies["c".repeat(64)], null);
  });

  it("answers all-nil legitimately", () => {
    const decoded = decodeSchemaRes(encodeSchemaRes({ [DIGEST_A]: null }));
    assert.equal(decoded.bodies[DIGEST_A], null);
  });

  it("carries bodies as [raw_digest, entry] tuples on the wire", () => {
    const frame = MsgPack.decode(
      encodeSchemaRes({ [DIGEST_A]: { type: "string" } }),
    );
    const [digest, entry] = frame[1][0];
    assert.ok(digest instanceof Uint8Array);
    assert.equal(digest.length, 32);
    assert.deepEqual([...digest], [...fromHex(DIGEST_A)]);
    assert.deepEqual(entry, { type: "string" });
  });

  it("rejects an inline body over the size cap", () => {
    const oversized = {
      type: "object",
      description: "x".repeat(SCHEMA_INLINE_LIMIT),
    };
    assert.throws(
      () => encodeSchemaRes({ [DIGEST_A]: oversized }),
      /resource form/,
    );
  });

  it("rejects malformed entries", () => {
    assert.throws(() => encodeSchemaRes({ nothex: null }));
    assert.throws(() => encodeSchemaRes({ [DIGEST_A]: 42 }));
    assert.throws(() => encodeSchemaRes({ [DIGEST_A]: "" }));
  });
});

describe("0x2a CMD_SCHEMA_WRITE", () => {
  it("round-trips the inline form", () => {
    const body = { $id: "canvas/point", type: "object" };
    const decoded = decodeSchemaWrite(encodeSchemaWrite(DIGEST_A, body));
    assert.equal(decoded.cmd, CMD_SCHEMA_WRITE);
    assert.equal(decoded.digest, DIGEST_A);
    assert.deepEqual(decoded.body, body);
    assert.equal(decoded.ref, null);
  });

  it("round-trips the resource-ref form", () => {
    const decoded = decodeSchemaWrite(
      encodeSchemaWrite(DIGEST_B, "rns:resource-hash"),
    );
    assert.equal(decoded.digest, DIGEST_B);
    assert.equal(decoded.body, null);
    assert.equal(decoded.ref, "rns:resource-hash");
  });

  it("carries the digest as a raw 32-byte bin", () => {
    const frame = MsgPack.decode(
      encodeSchemaWrite(DIGEST_A, { type: "string" }),
    );
    assert.ok(frame[1] instanceof Uint8Array);
    assert.equal(frame[1].length, 32);
  });

  it("rejects malformed writes", () => {
    assert.throws(() => encodeSchemaWrite("short", { type: "string" }));
    assert.throws(() => encodeSchemaWrite(DIGEST_A, null));
    assert.throws(() => encodeSchemaWrite(DIGEST_A, ""));
  });
});
