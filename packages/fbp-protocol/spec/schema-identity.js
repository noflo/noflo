//     @noflo/fbp-protocol - FBP Protocol 2.0 over Reticulum
//     SPDX-License-Identifier: EUPL-1.2
//     @file spec/schema-identity.js
//     @description Schema artifact identity (work document #37 §2): RFC 8785
//       canonicalization, `$id` normalization and digest stability, reference
//       parsing/pinning, and Merkle cycle detection.

import assert from "node:assert";
import { describe, it } from "node:test";

import { MsgPack } from "@reticulum/core";

import {
  canonicalizeJson,
  collectSchemaRefs,
  detectRefCycles,
  digestSchema,
  isValidSchemaId,
  normalizeSchemaBody,
  parseSchemaRef,
  pinSchemaRefs,
  SCHEMA_URN_PREFIX,
  schemaUrn,
} from "../src/schema-identity.js";

describe("schema ids", () => {
  it("accepts ns/name authoring ids", () => {
    assert.ok(isValidSchemaId("canvas/point"));
    assert.ok(isValidSchemaId("strings/pipeline-options"));
    assert.ok(isValidSchemaId("std/geo-coordinate"));
  });

  it("rejects non-id shapes", () => {
    assert.ok(!isValidSchemaId("point"));
    assert.ok(!isValidSchemaId("/point"));
    assert.ok(!isValidSchemaId("canvas/"));
    assert.ok(!isValidSchemaId("canvas/point/extra"));
    assert.ok(!isValidSchemaId("canvas/point@deadbeef"));
    assert.ok(!isValidSchemaId("canvas/point#fragment"));
    assert.ok(!isValidSchemaId(""));
    assert.ok(!isValidSchemaId(/** @type {any} */ (42)));
  });
});

describe("parseSchemaRef", () => {
  it("parses authoring sugar", () => {
    assert.deepEqual(parseSchemaRef("canvas/point"), {
      id: "canvas/point",
      digest: null,
      fragment: null,
    });
  });

  it("parses authoring sugar with a $defs fragment", () => {
    assert.deepEqual(parseSchemaRef("canvas/point#/$defs/axis"), {
      id: "canvas/point",
      digest: null,
      fragment: "/$defs/axis",
    });
  });

  it("parses the digest-pinned form", () => {
    const digest = "a".repeat(64);
    assert.deepEqual(parseSchemaRef(`canvas/point@${digest}`), {
      id: "canvas/point",
      digest,
      fragment: null,
    });
  });

  it("parses the published absolute URN form", () => {
    const digest = "b".repeat(64);
    assert.deepEqual(
      parseSchemaRef(`urn:noflo:canvas/point@${digest}#/$defs/x`),
      { id: "canvas/point", digest, fragment: "/$defs/x" },
    );
  });

  it("rejects URLs, foreign URNs, and MIME types", () => {
    assert.throws(() => parseSchemaRef("https://noflojs.org/#point"));
    assert.throws(() => parseSchemaRef("urn:example:point"));
    assert.throws(() => parseSchemaRef("application/vnd.foo+json"));
    assert.throws(() => parseSchemaRef("application/json; charset=utf-8"));
    assert.throws(() => parseSchemaRef("canvas/point@nothex"));
    assert.throws(() => parseSchemaRef(""));
  });
});

describe("schemaUrn", () => {
  it("round-trips through parseSchemaRef", () => {
    const digest = "c".repeat(64);
    const urn = schemaUrn("canvas/point", digest, "/$defs/x");
    assert.ok(urn.startsWith(SCHEMA_URN_PREFIX));
    assert.deepEqual(parseSchemaRef(urn), {
      id: "canvas/point",
      digest,
      fragment: "/$defs/x",
    });
  });

  it("rejects malformed inputs", () => {
    assert.throws(() => schemaUrn("point", "d".repeat(64)));
    assert.throws(() => schemaUrn("canvas/point", "short"));
  });
});

describe("RFC 8785 canonicalization", () => {
  it("sorts object keys by UTF-16 code unit order", () => {
    assert.equal(
      canonicalizeJson({ b: 1, a: 2, A: 3, "€": 4, ü: 5, "〖": 6 }),
      '{"A":3,"a":2,"b":1,"ü":5,"€":4,"〖":6}',
    );
  });

  it("emits no whitespace and keeps array order", () => {
    assert.equal(
      canonicalizeJson({ list: [3, 1, { z: 0, y: [true, false, null] }] }),
      '{"list":[3,1,{"y":[true,false,null],"z":0}]}',
    );
  });

  it("serializes numbers per ECMAScript Number::toString", () => {
    assert.equal(canonicalizeJson(1), "1");
    assert.equal(canonicalizeJson(1.0), "1");
    assert.equal(canonicalizeJson(-0), "0");
    assert.equal(canonicalizeJson(1e21), "1e+21");
    assert.equal(canonicalizeJson(1e-7), "1e-7");
    assert.equal(canonicalizeJson(0.000001), "0.000001");
    // Precision loss at parse time is the point: the literal denotes the
    // nearest IEEE-754 double, and its canonical form must match
    // biome-ignore lint/correctness/noPrecisionLoss: RFC 8785 test vector
    assert.equal(canonicalizeJson(333333333.33333329), "333333333.3333333");
  });

  it("escapes strings minimally", () => {
    assert.equal(
      canonicalizeJson('a"b\\c\bd\fe\f\ng\rh\u0001i\u001f'),
      '"a\\"b\\\\c\\bd\\fe\\f\\ng\\rh\\u0001i\\u001f"',
    );
    assert.equal(canonicalizeJson("kąt-π-禅"), '"kąt-π-禅"');
  });

  it("rejects non-I-JSON input", () => {
    assert.throws(() => canonicalizeJson(Number.NaN));
    assert.throws(() => canonicalizeJson(Number.POSITIVE_INFINITY));
    assert.throws(() => canonicalizeJson("\ud800"));
    assert.throws(() => canonicalizeJson({ k: "\udfff" }));
    assert.throws(() => canonicalizeJson(/** @type {any} */ (undefined)));
    assert.throws(() => canonicalizeJson(/** @type {any} */ (10n)));
  });

  it("produces the RFC 8785 Appendix B vectors verbatim", () => {
    // The two normative test documents from RFC 8785 Appendix B: every
    // conforming JCS implementation in any language emits exactly these
    // bytes, which is what makes the digest definition implementable
    // across producers (work document #37 §11)
    const sorting = JSON.parse(
      '{"\\r":"Carriage Return","1":"One","\u0080":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","\ufb33":"Hebrew Letter Dalet With Dagesh"}',
    );
    assert.equal(
      canonicalizeJson(sorting),
      '{"\\r":"Carriage Return","1":"One","\u0080":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","\ufb33":"Hebrew Letter Dalet With Dagesh"}',
    );
    const document = JSON.parse(
      '{"numbers":[333333333.33333329,1E30,4.50,2e-3,-0.000000000000000000000000001],"string":"\\u20ac\\t\\n\\u000b\\f\\r \\"\\\\/","literals":[null,true,false]}',
    );
    assert.equal(
      canonicalizeJson(document),
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,-1e-27],"string":"€\\t\\n\\u000b\\f\\r \\"\\\\/"}',
    );
  });
});

describe("digestSchema", () => {
  it("is stable across key order", async () => {
    const one = {
      $id: "canvas/point",
      type: "object",
      x: { type: "number" },
    };
    const reordered = {
      x: { type: "number" },
      type: "object",
      $id: "canvas/point",
    };
    assert.equal(await digestSchema(one), await digestSchema(reordered));
  });

  it("gives anonymous bodies their own stable digest", async () => {
    const anonymous = { type: "string", enum: ["a", "b"] };
    assert.equal(
      await digestSchema(anonymous),
      await digestSchema({ ...anonymous }),
    );
  });

  it("does not mutate the input body", async () => {
    const body = { $id: "canvas/point", type: "string" };
    const before = JSON.stringify(body);
    await digestSchema(body);
    assert.equal(JSON.stringify(body), before);
  });

  it("distinguishes 1 from true and from the string '1'", async () => {
    const number = await digestSchema({ const: 1 });
    const boolean = await digestSchema({ const: true });
    const string = await digestSchema({ const: "1" });
    assert.notEqual(number, boolean);
    assert.notEqual(number, string);
    assert.notEqual(boolean, string);
  });

  it("rejects unsupported bodies", async () => {
    await assert.rejects(() => digestSchema(/** @type {any} */ ("schema")));
    await assert.rejects(() =>
      digestSchema({ $id: "https://example.com/point", type: "string" }),
    );
  });
});

describe("collectSchemaRefs", () => {
  it("collects cross-document refs, skipping same-document recursion", () => {
    const body = {
      $id: "canvas/line",
      allOf: [
        { $ref: "canvas/point" },
        { $ref: "#/$defs/local" },
        { $ref: "canvas/point#/$defs/axis" },
      ],
      $defs: {
        local: { $ref: "#/$defs/local" },
        nested: { properties: { p: { $ref: "strings/name" } } },
      },
    };
    assert.deepEqual(collectSchemaRefs(body), [
      "canvas/point",
      "canvas/point#/$defs/axis",
      "strings/name",
    ]);
  });
});

describe("pinSchemaRefs", () => {
  it("rewrites authoring sugar into absolute URN form", async () => {
    const body = {
      $id: "canvas/line",
      allOf: [{ $ref: "canvas/point" }, { $ref: "canvas/point#/$defs/axis" }],
    };
    const digest = "e".repeat(64);
    const pinned = await pinSchemaRefs(body, async (ref) =>
      ref.startsWith("canvas/point") ? digest : null,
    );
    assert.equal(pinned.allOf[0].$ref, `urn:noflo:canvas/point@${digest}`);
    assert.equal(
      pinned.allOf[1].$ref,
      `urn:noflo:canvas/point@${digest}#/$defs/axis`,
    );
    // The document's own $id stays bare: a body cannot name a revision
    // of itself
    assert.equal(pinned.$id, "canvas/line");
    assert.deepEqual(body, {
      $id: "canvas/line",
      allOf: [{ $ref: "canvas/point" }, { $ref: "canvas/point#/$defs/axis" }],
    });
  });

  it("fails loudly on unresolvable references", async () => {
    await assert.rejects(
      () => pinSchemaRefs({ $ref: "ghost/thing" }, async () => null),
      /unresolvable schema reference 'ghost\/thing'/,
    );
  });
});

describe("detectRefCycles", () => {
  it("accepts an acyclic set and same-document recursion", () => {
    const documents = [
      { id: "canvas/point", body: { $ref: "#/$defs/recursive" } },
      {
        id: "canvas/line",
        body: { allOf: [{ $ref: "canvas/point" }] },
      },
    ];
    assert.equal(detectRefCycles(documents), null);
  });

  it("reports a cross-document cycle", () => {
    const documents = [
      { id: "a/one", body: { $ref: "a/two" } },
      { id: "a/two", body: { $ref: "a/three" } },
      { id: "a/three", body: { $ref: "a/one" } },
    ];
    const cycle = detectRefCycles(documents);
    assert.ok(cycle);
    assert.equal(cycle[0], cycle[cycle.length - 1]);
    assert.deepEqual(cycle.slice(0, -1).sort(), ["a/one", "a/three", "a/two"]);
  });
});

describe("normalizeSchemaBody", () => {
  it("passes the bare id through", () => {
    assert.equal(
      normalizeSchemaBody({ $id: "canvas/point", type: "object" }).$id,
      "canvas/point",
    );
  });

  it("keeps anonymous bodies anonymous", () => {
    const normalized = normalizeSchemaBody({ type: "string" });
    assert.ok(!("$id" in normalized));
  });

  it("rejects self-naming $ids", () => {
    assert.throws(() =>
      normalizeSchemaBody({ $id: `urn:noflo:canvas/point@${"0".repeat(64)}` }),
    );
  });
});

describe("golden digest fixture", () => {
  // The canonical form below is hand-derived from the JCS rules — sorted
  // keys ($ < letters), ECMAScript numbers, minimal escaping — not copied
  // from the implementation. Its SHA-256 is computed by the system's
  // OpenSSL (shasum), independently of the WebCrypto call the module
  // makes: two independent hash implementations over an independently
  // derived canonical form.
  const canonical =
    '{"$id":"canvas/point","$schema":"https://json-schema.org/draft/2020-12/schema","examples":[{"x":0,"y":0}],"properties":{"label":{"maxLength":64,"type":"string"},"x":{"type":"number"},"y":{"type":"number"}},"required":["x","y"],"title":"Canvas point","type":"object"}';
  const golden =
    "d2f0fb8fbc7beb6ca58435084d7e10ec1a335d2377cad38979de316dbb21f127";

  it("reproduces the hand-derived canonical form byte-for-byte", async () => {
    const { readFileSync } = await import("node:fs");
    const body = JSON.parse(
      readFileSync(
        new URL("./fixtures/schema-golden.json", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(canonicalizeJson(normalizeSchemaBody(body)), canonical);
  });

  it("matches the OpenSSL-computed digest of the canonical form", async () => {
    const { readFileSync } = await import("node:fs");
    const body = JSON.parse(
      readFileSync(
        new URL("./fixtures/schema-golden.json", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(await digestSchema(body), golden);
  });

  it("erases the MsgPack int/float divergence at the digest", async () => {
    // MsgPack encodes `1` (int) and `1.0` (float64) differently on the
    // wire; two producers shipping "the same" body produce different
    // frames. Verification is decode → canonicalize → hash, so both must
    // yield the same digest: the float64 1.0 encoding is crafted by hand
    // and decoded through the real MsgPack decoder
    const intDigest = await digestSchema({ const: 1 });
    const floatFrame = new Uint8Array([
      0x81, // fixmap(1)
      0xa5,
      0x63,
      0x6f,
      0x6e,
      0x73,
      0x74, // "const"
      0xcb,
      0x3f,
      0xf0,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00, // float64 1.0
    ]);
    const decoded = MsgPack.decode(floatFrame);
    assert.equal(decoded.const, 1);
    assert.equal(await digestSchema(decoded), intDigest);
  });
});
