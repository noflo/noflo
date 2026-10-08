/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/registry.js
 * @description Two-Step Cache codecs: round-trips, golden vectors, the #25
 *   port field set on the wire, stub-tolerant manifest state, and the
 *   canonical signature serialization backing `sig_hash`.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import { MsgPack } from "@reticulum/core";
import {
  CMD_COMP_MANIFEST,
  CMD_COMP_SYNC_REQ,
  CMD_COMP_UP_TO_DATE,
  COMPONENT_TYPE,
  canonicalSignature,
  decodeCompDetailReq,
  decodeCompDetailRes,
  decodeCompInstallReq,
  decodeCompManifest,
  decodeCompSyncReq,
  decodeCompUpToDate,
  decodeCompWrite,
  encodeCompDetailReq,
  encodeCompDetailRes,
  encodeCompInstallReq,
  encodeCompManifest,
  encodeCompSyncReq,
  encodeCompUpToDate,
  encodeCompWrite,
  ProtocolError,
  sigHash,
} from "../src/index.js";

const addSignature = {
  type: COMPONENT_TYPE.ELEMENTARY,
  in: [
    { id: "a", type: "number" },
    { id: "b", type: "number", required: true },
  ],
  out: [{ id: "sum", type: "number" }],
};

describe("0x20 CMD_COMP_SYNC_REQ", () => {
  it("round-trips the local registry hash", () => {
    const decoded = decodeCompSyncReq(encodeCompSyncReq("reg-hash-1"));
    assert.equal(decoded.cmd, CMD_COMP_SYNC_REQ);
    assert.equal(decoded.localRegistryHash, "reg-hash-1");
  });

  it("rejects an empty hash", () => {
    assert.throws(() => encodeCompSyncReq(""), ProtocolError);
  });
});

describe("0x22 CMD_COMP_MANIFEST", () => {
  it("round-trips name to sig_hash and declared kind entries", () => {
    const decoded = decodeCompManifest(
      encodeCompManifest("reg-hash-2", {
        "math/Add": {
          sigHash: "sig-hash-1",
          type: COMPONENT_TYPE.ELEMENTARY,
        },
        "graphs/Pipeline": {
          sigHash: "sig-hash-2",
          type: COMPONENT_TYPE.SUBGRAPH,
        },
        "stub/Only": { sigHash: "sig-hash-3", type: COMPONENT_TYPE.STUB },
      }),
    );
    assert.equal(decoded.cmd, CMD_COMP_MANIFEST);
    assert.equal(decoded.newRegistryHash, "reg-hash-2");
    assert.deepEqual(decoded.entries, {
      "math/Add": {
        sigHash: "sig-hash-1",
        type: COMPONENT_TYPE.ELEMENTARY,
      },
      "graphs/Pipeline": {
        sigHash: "sig-hash-2",
        type: COMPONENT_TYPE.SUBGRAPH,
      },
      "stub/Only": { sigHash: "sig-hash-3", type: COMPONENT_TYPE.STUB },
    });
  });

  it("encodes entries as [sig_hash, kind] tuples on the wire", () => {
    const frame = MsgPack.decode(
      encodeCompManifest("h", {
        "math/Add": {
          sigHash: "sig-hash-1",
          type: COMPONENT_TYPE.ELEMENTARY,
        },
      }),
    );
    assert.deepEqual(frame[2]["math/Add"], ["sig-hash-1", "elementary"]);
  });

  it("tolerates a stub entry as declared-signature state; the hash is opaque", () => {
    // Update #8: a sig_hash with no source is valid registry state. The
    // manifest frame itself carries no source, so this is structurally true.
    const decoded = decodeCompManifest(
      encodeCompManifest("h", {
        "stub/Only": { sigHash: "sig-hash", type: COMPONENT_TYPE.STUB },
      }),
    );
    assert.deepEqual(Object.keys(decoded.entries), ["stub/Only"]);
  });

  it("rejects non-string sig_hash values", () => {
    assert.throws(
      () =>
        encodeCompManifest("h", {
          "math/Add": { sigHash: 42, type: COMPONENT_TYPE.ELEMENTARY },
        }),
      ProtocolError,
    );
  });

  it("rejects an undeclared kind (kind is never inferred, update #11)", () => {
    assert.throws(
      () =>
        encodeCompManifest("h", {
          "math/Add": { sigHash: "sig-hash-1", type: "inferred" },
        }),
      ProtocolError,
    );
    assert.throws(
      () =>
        encodeCompManifest("h", {
          "math/Add": { sigHash: "sig-hash-1", type: 0x01 },
        }),
      ProtocolError,
    );
  });

  it("rejects malformed wire entries", () => {
    // A legacy name → sig_hash string is not a [sig_hash, kind] tuple.
    const frame = MsgPack.encode([
      CMD_COMP_MANIFEST,
      "h",
      { "math/Add": "sig-hash-1" },
    ]);
    assert.throws(() => decodeCompManifest(frame), ProtocolError);
  });
});

describe("0x21 CMD_COMP_UP_TO_DATE", () => {
  it("encodes and decodes the bare match reply", () => {
    const decoded = decodeCompUpToDate(encodeCompUpToDate());
    assert.equal(decoded.cmd, CMD_COMP_UP_TO_DATE);
  });

  it("mirrors the graph block's 0x11 wire layout", () => {
    assert.deepEqual([...encodeCompUpToDate()], [0x91, 0x21]);
  });

  it("rejects frames with a payload", () => {
    const frame = MsgPack.encode([CMD_COMP_UP_TO_DATE, "extra"]);
    assert.throws(() => decodeCompUpToDate(frame), ProtocolError);
  });
});

describe("0x23/0x24 detail request and response", () => {
  it("round-trips a detail request for unknown definitions only", () => {
    const decoded = decodeCompDetailReq(
      encodeCompDetailReq(["math/Add", "strings/Replace"]),
    );
    assert.deepEqual(decoded.names, ["math/Add", "strings/Replace"]);
  });

  it("carries the full #25 port field set and the declared kind", () => {
    const decoded = decodeCompDetailRes(
      encodeCompDetailRes({
        "math/Add": {
          type: COMPONENT_TYPE.ELEMENTARY,
          in: [
            { id: "a", type: "number", description: "First addend" },
            { id: "b", type: "number", required: true },
            { id: "options", type: "object", control: true },
          ],
          out: [{ id: "sum", type: "number", addressable: false }],
        },
        "graphs/Pipeline": {
          type: COMPONENT_TYPE.SUBGRAPH,
          in: [{ id: "in", type: "all" }],
          out: [{ id: "out", type: "all" }],
        },
        "stub/Missing": {
          type: COMPONENT_TYPE.STUB,
          in: [{ id: "in", type: "all" }],
          out: [{ id: "out", type: "all" }],
        },
      }),
    );
    const detail = decoded.components["math/Add"];
    assert.equal(detail.type, COMPONENT_TYPE.ELEMENTARY);
    assert.deepEqual(detail.in[0], {
      id: "a",
      type: "number",
      description: "First addend",
    });
    assert.equal(detail.in[1].required, true);
    assert.equal(detail.in[2].control, true);
    // An explicit `addressable: false` still travels — only *absent* fields
    // are omitted.
    assert.deepEqual(Object.keys(decoded.components["math/Add"].out[0]), [
      "id",
      "type",
      "addressable",
    ]);
    assert.equal(decoded.components["math/Add"].out[0].addressable, false);
    assert.equal(
      decoded.components["graphs/Pipeline"].type,
      COMPONENT_TYPE.SUBGRAPH,
    );
    assert.equal(decoded.components["stub/Missing"].type, COMPONENT_TYPE.STUB);
  });

  it("omits absent optional port fields from the wire", () => {
    const bytes = encodeCompDetailRes({ "math/Add": addSignature });
    const decoded = JSON.parse(
      JSON.stringify(decodeCompDetailRes(bytes).components["math/Add"]),
    );
    // The `a` inport carries only id and type; no absent optional fields.
    assert.deepEqual(Object.keys(decoded.in[0]), ["id", "type"]);
    // The `b` inport carries its required flag.
    assert.deepEqual(Object.keys(decoded.in[1]), ["id", "type", "required"]);
    // The `sum` outport has no optional fields at all.
    assert.deepEqual(Object.keys(decoded.out[0]), ["id", "type"]);
  });

  it("rejects an unknown component kind (kind is declared data, update #11)", () => {
    assert.throws(
      () =>
        encodeCompDetailRes({
          "x/Weird": { type: "inferred", in: [], out: [] },
        }),
      ProtocolError,
    );
  });

  it("rejects a port without an id", () => {
    assert.throws(
      () =>
        encodeCompDetailRes({
          "x/Bad": {
            type: COMPONENT_TYPE.ELEMENTARY,
            in: [{ type: "all" }],
            out: [],
          },
        }),
      ProtocolError,
    );
  });

  it("rejects a non-boolean control flag", () => {
    assert.throws(
      () =>
        encodeCompDetailRes({
          "x/Bad": {
            type: COMPONENT_TYPE.ELEMENTARY,
            in: [{ id: "in", type: "all", control: "yes" }],
            out: [],
          },
        }),
      ProtocolError,
    );
  });
});

describe("0x25 CMD_COMP_WRITE", () => {
  it("round-trips an atomic source write", () => {
    const decoded = decodeCompWrite(
      encodeCompWrite("math/Add", "export function getComponent() {}"),
    );
    assert.equal(decoded.componentName, "math/Add");
    assert.equal(decoded.source, "export function getComponent() {}");
  });

  it("rejects empty source", () => {
    assert.throws(() => encodeCompWrite("math/Add", ""), ProtocolError);
  });
});

describe("0x27 CMD_COMP_INSTALL_REQ", () => {
  it("round-trips a package uri", () => {
    const decoded = decodeCompInstallReq(
      encodeCompInstallReq("npm:@noflo/noflo-strings@2.0.0"),
    );
    assert.equal(decoded.packageUri, "npm:@noflo/noflo-strings@2.0.0");
  });

  it("rejects an empty uri", () => {
    assert.throws(() => encodeCompInstallReq(""), ProtocolError);
  });
});

describe("canonical signature and sig_hash", () => {
  it("serializes with sorted keys and minimal optional fields", () => {
    const canonical = canonicalSignature(addSignature);
    assert.equal(
      canonical,
      '{"in":[{"id":"a","type":"number"},{"id":"b","required":true,"type":"number"}],"out":[{"id":"sum","type":"number"}],"type":"elementary"}',
    );
  });

  it("is stable under port property reordering", () => {
    // Array order is semantic (ports are ordered); object property order is
    // not. Same ports, same array positions, different property order.
    const reordered = {
      type: COMPONENT_TYPE.ELEMENTARY,
      in: [
        { type: "number", id: "a" },
        { id: "b", type: "number", required: true },
      ],
      out: [{ type: "number", id: "sum" }],
    };
    assert.equal(
      canonicalSignature(reordered),
      canonicalSignature(addSignature),
    );
  });

  it("distinguishes signatures that differ only in optional fields", async () => {
    const withDescription = {
      ...addSignature,
      in: [
        { ...addSignature.in[0], description: "First addend" },
        ...addSignature.in.slice(1),
      ],
    };
    assert.notEqual(
      await sigHash(withDescription),
      await sigHash(addSignature),
    );
  });

  it("computes a stable sha-256 hex digest", async () => {
    const hash = await sigHash(addSignature);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hash, await sigHash(addSignature));
  });

  it("rejects an invalid signature", () => {
    assert.throws(
      () => canonicalSignature({ type: "bogus", in: [], out: [] }),
      ProtocolError,
    );
  });
});
