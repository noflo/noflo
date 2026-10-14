//     @noflo/fbp-protocol - FBP Protocol 2.0 over Reticulum
//     SPDX-License-Identifier: EUPL-1.2
//     @file spec/catalogs.js
//     @description The default catalogs (work document #37 §3.2, §3.3):
//       shipped-byte identity, digest stability, conformance to the
//       meta-catalog document format, and the std mapping's completeness.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CATALOGS, catalogBody, catalogDigest } from "../src/catalogs.js";
import { canonicalizeJson, metaSchemaDigest } from "../src/index.js";

const FILE_NAMES = {
  std: "catalog-std.json",
  ui: "catalog-ui.json",
  runtime: "catalog-runtime.json",
};

const CORE_DATATYPES = [
  "all",
  "array",
  "bang",
  "boolean",
  "buffer",
  "color",
  "date",
  "function",
  "int",
  "number",
  "object",
  "stream",
  "string",
];

const ENTITY_KINDS = ["node", "edge", "iip", "export", "group", "graph"];

describe("default catalogs", () => {
  it("ships bodies identical to the schemas/ artifacts", async () => {
    for (const [namespace, body] of Object.entries(CATALOGS)) {
      const fileBody = JSON.parse(
        readFileSync(
          new URL(`../schemas/${FILE_NAMES[namespace]}`, import.meta.url),
          "utf8",
        ),
      );
      assert.deepEqual(
        canonicalizeJson(body),
        canonicalizeJson(fileBody),
        `${FILE_NAMES[namespace]} and its src mirror diverged`,
      );
      assert.equal(
        await catalogDigest(/** @type {any} */ (namespace)),
        await (async () => {
          const bytes = new TextEncoder().encode(canonicalizeJson(fileBody));
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          return [...new Uint8Array(digest)]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        })(),
      );
    }
  });

  it("pins the ui and runtime catalogs at the shipped meta-catalog", async () => {
    const meta = await metaSchemaDigest("noflo/meta-catalog");
    for (const namespace of ["ui", "runtime"]) {
      const body = catalogBody(/** @type {any} */ (namespace));
      assert.equal(body.$schema, `urn:noflo:noflo/meta-catalog@${meta}`);
    }
  });

  it("conforms the metadata catalogs to the meta-catalog format", () => {
    for (const namespace of ["ui", "runtime"]) {
      const body = catalogBody(/** @type {any} */ (namespace));
      assert.ok(body.entries, `${namespace} carries entries`);
      for (const [key, entry] of Object.entries(body.entries)) {
        assert.ok(key.includes("."), `${key} is a namespaced key`);
        assert.ok(entry.schema, `${key} declares a schema`);
        assert.ok(
          ["positional", "config"].includes(entry.class),
          `${key} declares a class from the vocabulary`,
        );
        assert.ok(
          entry.kinds.every((/** @type {string} */ kind) =>
            ENTITY_KINDS.includes(kind),
          ),
          `${key} declares entity kinds from the vocabulary`,
        );
      }
    }
  });

  it("maps exactly the 13 core datatypes in std", () => {
    const std = catalogBody("std");
    assert.deepEqual(Object.keys(std.types).sort(), CORE_DATATYPES);
  });

  it("gives every JSON-mappable datatype a schema and the rest opaque", () => {
    const std = catalogBody("std");
    const mappable = [
      "string",
      "number",
      "int",
      "boolean",
      "array",
      "object",
      "color",
      "date",
      "all",
    ];
    for (const datatype of mappable) {
      assert.ok(std.types[datatype].schema, `${datatype} carries a schema`);
      assert.ok(
        !("opaque" in std.types[datatype]),
        `${datatype} is not opaque`,
      );
    }
    const opaque = ["bang", "buffer", "function", "stream"];
    for (const datatype of opaque) {
      assert.equal(std.types[datatype].opaque, true, `${datatype} is opaque`);
      assert.ok(
        !("schema" in std.types[datatype]),
        `${datatype} carries no schema`,
      );
    }
  });

  it("classifies canvas metadata positional and backpressure config", () => {
    const ui = catalogBody("ui");
    for (const key of ["ui.x", "ui.y", "ui.route", "ui.routePoints"]) {
      assert.equal(ui.entries[key].class, "positional");
    }
    const runtime = catalogBody("runtime");
    assert.equal(runtime.entries["runtime.highWaterMark"].class, "config");
    assert.deepEqual(runtime.entries["runtime.highWaterMark"].kinds, ["edge"]);
  });

  it("computes stable digests", async () => {
    for (const namespace of Object.keys(CATALOGS)) {
      const digest = await catalogDigest(/** @type {any} */ (namespace));
      assert.match(digest, /^[0-9a-f]{64}$/);
      assert.equal(digest, await catalogDigest(/** @type {any} */ (namespace)));
    }
  });

  it("rejects unknown namespaces", () => {
    assert.throws(() => catalogBody(/** @type {any} */ ("assembly")));
  });
});
