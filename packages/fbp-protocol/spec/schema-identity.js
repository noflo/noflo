//     @noflo/fbp-protocol - FBP Protocol 2.0 over Reticulum
//     SPDX-License-Identifier: EUPL-1.2
//     @file spec/schema-identity.js
//     @description Schema artifact identity (work document #37 §2): RFC 8785
//       canonicalization, `$id` normalization and digest stability, reference
//       parsing/pinning, and Merkle cycle detection.

import assert from "node:assert";
import { describe, it } from "node:test";

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

  it("produces the RFC 8785 test vector bytes", () => {
    // From the JCS test suite: the expected canonical form of the input
    // document in RFC 8785 Appendix B, abbreviated to the number/string
    // edge cases this module must match
    const input = JSON.parse(
      '{"numbers":[333333333.33333329,1E30,4.50,2e-3,-0.000000000000000000000000001],"string":"\\u20ac\\t\\n\\u000b\\f\\r \\"\\\\"}',
    );
    assert.equal(
      canonicalizeJson(input),
      '{"numbers":[333333333.3333333,1e+30,4.5,0.002,-1e-27],"string":"€\\t\\n\\u000b\\f\\r \\"\\\\"}',
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
