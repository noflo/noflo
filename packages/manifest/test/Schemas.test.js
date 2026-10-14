//     @noflo/manifest - Publish-time component manifest generator
//     SPDX-License-Identifier: EUPL-1.2
//     @file test/Schemas.test.js
//     @description The schemas table, hoisting, pinning, guard derivation,
//       and the publish gate (work document #37 phase 1). Fixtures are
//       built fresh in a temp directory because the generator is a publish
//       step: it pins references and materializes hoisted documents.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { generateManifest } from "../src/index.js";

/** @type {string} */
let baseDir;

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "noflo-schemas-"));
  fs.writeFileSync(
    path.join(baseDir, "package.json"),
    JSON.stringify({ name: "@noflo/schemalib", description: "Schema fixture" }),
  );
  // The fixture lives outside the monorepo; link the workspace's hoisted
  // dependencies so component imports resolve
  fs.symlinkSync(
    fileURLToPath(new URL("../../../node_modules", import.meta.url)),
    path.join(baseDir, "node_modules"),
    "dir",
  );
  fs.mkdirSync(path.join(baseDir, "components"));
  fs.writeFileSync(
    path.join(baseDir, "components", "Typed.js"),
    `import { Component } from "@noflo/noflo";
export function getComponent() {
  const c = new Component({
    inPorts: {
      count: { datatype: "string", schema: { enum: ["a", "b"] } },
      shape: { datatype: "object", schema: { required: ["x"] } },
      labeled: { datatype: "object", schema: "canvas/point" },
    },
    outPorts: { out: { datatype: "all" } },
  });
  c.process(() => {});
  return c;
}
`,
  );
  fs.mkdirSync(path.join(baseDir, "schemas", "canvas"), { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "schemas", "canvas", "point.json"),
    `${JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "canvas/point",
        type: "object",
        required: ["x"],
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(baseDir, "schemas", "canvas", "line.json"),
    `${JSON.stringify(
      {
        $id: "canvas/line",
        allOf: [{ $ref: "canvas/point" }],
        properties: { y: { type: "number" } },
      },
      null,
      2,
    )}\n`,
  );
});

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

describe("schema tables", () => {
  it("records named schemas with digests and the implements closure", async () => {
    const manifest = await generateManifest(baseDir);
    assert.ok(manifest.schemas["canvas/point"]);
    assert.match(manifest.schemas["canvas/point"].digest, /^[0-9a-f]{64}$/);
    assert.equal(
      manifest.schemas["canvas/point"].path,
      "schemas/canvas/point.json",
    );
    assert.deepEqual(manifest.schemas["canvas/line"].implements, [
      "canvas/point",
    ]);
    assert.ok(!("implements" in manifest.schemas["canvas/point"]));
  });

  it("pins authoring sugar into absolute URN form, idempotently", async () => {
    await generateManifest(baseDir);
    const pinned = JSON.parse(
      fs.readFileSync(
        path.join(baseDir, "schemas", "canvas", "line.json"),
        "utf8",
      ),
    );
    const pointDigest = JSON.parse(
      fs.readFileSync(
        path.join(baseDir, "schemas", "canvas", "point.json"),
        "utf8",
      ),
    );
    const { digestSchema } = await import("@noflo/fbp-protocol");
    assert.equal(
      pinned.allOf[0].$ref,
      `urn:noflo:canvas/point@${await digestSchema(pointDigest)}`,
    );
    const before = fs.readFileSync(
      path.join(baseDir, "schemas", "canvas", "line.json"),
      "utf8",
    );
    const manifest = await generateManifest(baseDir);
    assert.equal(
      fs.readFileSync(
        path.join(baseDir, "schemas", "canvas", "line.json"),
        "utf8",
      ),
      before,
    );
    assert.ok(manifest.schemas["canvas/line"]);
  });

  it("hoists inline anonymous schemas into content-addressed entries", async () => {
    const manifest = await generateManifest(baseDir);
    const entries = Object.entries(manifest.anonymousSchemas);
    assert.equal(entries.length, 2);
    for (const [digest, entry] of entries) {
      assert.match(digest, /^[0-9a-f]{64}$/);
      assert.equal(entry.path, `schemas/${digest}.json`);
      const body = JSON.parse(
        fs.readFileSync(path.join(baseDir, entry.path), "utf8"),
      );
      assert.ok(!("$id" in body));
    }
  });

  it("carries resolved references and derived guards on ports", async () => {
    const manifest = await generateManifest(baseDir);
    const typed = manifest.components.find((c) => c.name === "schemalib/Typed");
    const count = typed.signature.inports.find((p) => p.name === "count");
    assert.deepEqual(count.schema, {
      digest: Object.keys(manifest.anonymousSchemas)[0],
    });
    assert.deepEqual(count.guard, { enum: ["a", "b"] });
    const labeled = typed.signature.inports.find((p) => p.name === "labeled");
    assert.deepEqual(labeled.schema, {
      id: "canvas/point",
      digest: manifest.schemas["canvas/point"].digest,
    });
    assert.deepEqual(labeled.guard, { type: "object", required: ["x"] });
  });

  it("rejects guard/schema disagreement", async () => {
    // canvas/point requires `x`; a guard omitting that required key disagrees
    fs.writeFileSync(
      path.join(baseDir, "components", "Typed.js"),
      `import { Component } from "@noflo/noflo";
export function getComponent() {
  const c = new Component({
    inPorts: {
      shape: { datatype: "object", schema: "canvas/point", guard: { type: "object" } },
    },
    outPorts: { out: { datatype: "all" } },
  });
  c.process(() => {});
  return c;
}
`,
    );
    await assert.rejects(
      () => generateManifest(baseDir),
      /does not equal the projection of its schema/,
    );
  });

  it("accepts an explicit guard equal to the projection", async () => {
    fs.writeFileSync(
      path.join(baseDir, "components", "Typed.js"),
      `import { Component } from "@noflo/noflo";
export function getComponent() {
  const c = new Component({
    inPorts: {
      shape: {
        datatype: "object",
        schema: "canvas/point",
        guard: { type: "object", required: ["x"] },
      },
    },
    outPorts: { out: { datatype: "all" } },
  });
  c.process(() => {});
  return c;
}
`,
    );
    const manifest = await generateManifest(baseDir);
    const shape = manifest.components
      .find((c) => c.name === "schemalib/Typed")
      .signature.inports.find((p) => p.name === "shape");
    assert.deepEqual(shape.guard, { type: "object", required: ["x"] });
    assert.deepEqual(shape.schema, {
      id: "canvas/point",
      digest: manifest.schemas["canvas/point"].digest,
    });
  });

  it("rejects reserved namespaces outside their owning packages", async () => {
    fs.mkdirSync(path.join(baseDir, "schemas", "ui"), { recursive: true });
    fs.writeFileSync(
      path.join(baseDir, "schemas", "ui", "widget.json"),
      JSON.stringify({ $id: "ui/widget", type: "object" }),
    );
    await assert.rejects(
      () => generateManifest(baseDir),
      /reserved namespace 'ui', owned by @noflo\/fbp-protocol/,
    );
  });

  it("rejects cross-document reference cycles", async () => {
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "line.json"),
      JSON.stringify({
        $id: "canvas/line",
        allOf: [{ $ref: "canvas/loop" }],
      }),
    );
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "loop.json"),
      JSON.stringify({
        $id: "canvas/loop",
        allOf: [{ $ref: "canvas/line" }],
      }),
    );
    await assert.rejects(
      () => generateManifest(baseDir),
      /Cross-document schema reference cycle/,
    );
  });

  it("rejects closed interfaces named as allOf bases", async () => {
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "point.json"),
      JSON.stringify({
        $id: "canvas/point",
        type: "object",
        additionalProperties: false,
      }),
    );
    await assert.rejects(
      () => generateManifest(baseDir),
      /closed interface.*composition-safe alternative/,
    );
  });

  it("rejects unknown meta-schema pins", async () => {
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "point.json"),
      JSON.stringify({
        $schema: `urn:noflo:noflo/meta-2@${"0".repeat(64)}`,
        $id: "canvas/point",
        type: "object",
      }),
    );
    await assert.rejects(
      () => generateManifest(baseDir),
      /unknown meta-schema/,
    );
  });

  it("rejects bodies pinned at a stale meta-schema digest", async () => {
    const { metaSchemaDigest } = await import("@noflo/fbp-protocol");
    const shipped = await metaSchemaDigest("noflo/extension-vocabulary");
    const stale = shipped.slice(0, 63) + (shipped[63] === "0" ? "1" : "0");
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "point.json"),
      JSON.stringify({
        $schema: `urn:noflo:noflo/extension-vocabulary@${stale}`,
        $id: "canvas/point",
        type: "object",
      }),
    );
    await assert.rejects(
      () => generateManifest(baseDir),
      /pins meta-schema.*but the shipped artifact digests to/,
    );
  });

  it("accepts bodies pinned at the shipped meta-schema digest", async () => {
    const { metaSchemaDigest } = await import("@noflo/fbp-protocol");
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "point.json"),
      JSON.stringify({
        $schema: `urn:noflo:noflo/extension-vocabulary@${await metaSchemaDigest("noflo/extension-vocabulary")}`,
        $id: "canvas/point",
        type: "object",
      }),
    );
    const manifest = await generateManifest(baseDir);
    assert.ok(manifest.schemas["canvas/point"]);
  });

  it("records examples in the schemas table", async () => {
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "point.json"),
      JSON.stringify({
        $id: "canvas/point",
        type: "object",
        required: ["x"],
        examples: [{ x: 1 }],
      }),
    );
    const manifest = await generateManifest(baseDir);
    assert.deepEqual(manifest.schemas["canvas/point"].examples, [{ x: 1 }]);
  });

  it("rejects a revision that no longer accepts a prior example", async () => {
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "point.json"),
      JSON.stringify({ $id: "canvas/point", type: "object", required: ["x"] }),
    );
    const manifest = await generateManifest(baseDir);
    // Simulate the previously generated manifest carrying the prior
    // revision's acceptance data
    fs.writeFileSync(
      path.join(baseDir, "noflo.json"),
      JSON.stringify({
        ...manifest,
        schemas: {
          ...manifest.schemas,
          "canvas/point": {
            digest: "0".repeat(64),
            path: "schemas/canvas/point.json",
            examples: [{ x: 1 }, { x: 2 }],
          },
        },
      }),
    );
    // The new revision narrows `x` to strings: prior numeric examples fail
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "point.json"),
      JSON.stringify({
        $id: "canvas/point",
        type: "object",
        required: ["x"],
        properties: { x: { type: "string" } },
      }),
    );
    await assert.rejects(
      () => generateManifest(baseDir),
      /revision acceptance failed for 'canvas\/point'.*breaking changes mint a new id/,
    );
  });

  it("accepts a revision that still accepts the prior examples", async () => {
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "point.json"),
      JSON.stringify({ $id: "canvas/point", type: "object", required: ["x"] }),
    );
    const manifest = await generateManifest(baseDir);
    fs.writeFileSync(
      path.join(baseDir, "noflo.json"),
      JSON.stringify({
        ...manifest,
        schemas: {
          ...manifest.schemas,
          "canvas/point": {
            digest: "0".repeat(64),
            path: "schemas/canvas/point.json",
            examples: [{ x: 1 }, { x: 2, y: 2 }],
          },
        },
      }),
    );
    // Additive revision: an optional property joins, prior examples stay valid
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "point.json"),
      JSON.stringify({
        $id: "canvas/point",
        type: "object",
        required: ["x"],
        properties: { y: { type: "number" } },
      }),
    );
    const regenerated = await generateManifest(baseDir);
    assert.ok(regenerated.schemas["canvas/point"]);
  });

  it("rejects a body whose own declared examples do not validate", async () => {
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "point.json"),
      JSON.stringify({
        $id: "canvas/point",
        type: "object",
        required: ["x"],
        examples: [{ y: 1 }],
      }),
    );
    await assert.rejects(
      () => generateManifest(baseDir),
      /declares an example its own schema rejects/,
    );
  });
});

describe("schema-less packages", () => {
  it("carries empty schema tables", async () => {
    const manifest = await generateManifest(
      path.join("test", "fixtures", "library"),
    );
    assert.deepEqual(manifest.schemas, {});
    assert.deepEqual(manifest.anonymousSchemas, {});
    assert.deepEqual(manifest.foreignSchemas, {});
  });
});
