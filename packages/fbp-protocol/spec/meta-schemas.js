//     @noflo/fbp-protocol - FBP Protocol 2.0 over Reticulum
//     SPDX-License-Identifier: EUPL-1.2
//     @file spec/meta-schemas.js
//     @description The pinned meta-schemas (work document #37 §3.2, §11):
//       shipped-byte identity between the JS modules and the `schemas/`
//       artifacts, digest stability, and the vocabulary declaration rules.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  META_SCHEMAS,
  metaSchemaBody,
  metaSchemaDigest,
} from "../src/meta-schemas.js";
import { canonicalizeJson } from "../src/schema-identity.js";

describe("pinned meta-schemas", () => {
  it("ships bodies byte-identical to the schemas/ artifacts", async () => {
    for (const [id, body] of Object.entries(META_SCHEMAS)) {
      const fileName =
        id.replace("noflo/", "") === "extension-vocabulary"
          ? "noflo-extension-vocabulary.json"
          : "noflo-meta-catalog.json";
      const fileBody = JSON.parse(
        readFileSync(
          new URL(`../schemas/${fileName}`, import.meta.url),
          "utf8",
        ),
      );
      assert.deepEqual(
        canonicalizeJson(body),
        canonicalizeJson(fileBody),
        `${fileName} and its src mirror diverged`,
      );
      assert.equal(
        await metaSchemaDigest(/** @type {any} */ (id)),
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

  it("declares the extension vocabulary as optional", () => {
    const vocabulary = metaSchemaBody("noflo/extension-vocabulary").$vocabulary;
    assert.equal(vocabulary["urn:noflo:vocab/extension"], false);
    for (const [uri, required] of Object.entries(vocabulary)) {
      if (uri !== "urn:noflo:vocab/extension") {
        assert.equal(required, true, `${uri} must be required`);
      }
    }
  });

  it("declares the NoFlo keywords through the vocabulary meta-schema", () => {
    const body = metaSchemaBody("noflo/extension-vocabulary");
    assert.ok(body.properties.discriminator);
    assert.ok(body.properties.implements);
    assert.ok(body.$defs.discriminator);
  });

  it("describes the catalog document format", () => {
    const body = metaSchemaBody("noflo/meta-catalog");
    assert.ok(body.properties.entries);
    const entry = body.properties.entries.additionalProperties;
    assert.deepEqual(entry.required, ["schema", "class", "kinds"]);
    assert.deepEqual(entry.properties.class.enum, ["positional", "config"]);
  });

  it("computes stable digests", async () => {
    for (const id of Object.keys(META_SCHEMAS)) {
      const digest = await metaSchemaDigest(/** @type {any} */ (id));
      assert.match(digest, /^[0-9a-f]{64}$/);
      assert.equal(digest, await metaSchemaDigest(/** @type {any} */ (id)));
    }
  });

  it("rejects unknown ids", () => {
    assert.throws(() => metaSchemaBody(/** @type {any} */ ("noflo/meta-2")));
  });
});
