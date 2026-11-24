//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     NoFlo may be freely distributed under the MIT license
//     @file spec/schema-table.js
//     @description The schema-table loader (work document #37 phase 2):
//       installed packages' noflo.json schemas tables load into the
//       grow-only store, digest-verified; packages without tables
//       contribute nothing.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { digestSchema } from "@noflo/fbp-protocol";
import { SchemaTable } from "@noflo/runtime";
import {
  loadSchemaPackage,
  schemaTableFromNodeModules,
} from "../src/schema-table.js";

/** @type {string} */
let baseDir;
/** @type {string} */
let pointDigest;

const POINT = { $id: "canvas/point", type: "object", required: ["x"] };

beforeEach(async () => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "noflo-schematable-"));
  // An isolated node_modules: the real workspace tree must stay untouched
  fs.mkdirSync(path.join(baseDir, "node_modules", "noflo-dep"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(baseDir, "node_modules", "noflo-dep", "noflo.json"),
    JSON.stringify({
      schemas: {
        "canvas/line": { digest: "0".repeat(64), path: "schemas/line.json" },
      },
    }),
  );
  fs.mkdirSync(path.join(baseDir, "schemas", "canvas"), { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "schemas", "canvas", "point.json"),
    `${JSON.stringify(POINT, null, 2)}\n`,
  );
  pointDigest = await digestSchema(POINT);
  // The project itself ships a schemas table
  fs.writeFileSync(
    path.join(baseDir, "noflo.json"),
    JSON.stringify({
      schemas: {
        "canvas/point": {
          digest: pointDigest,
          path: "schemas/canvas/point.json",
        },
      },
    }),
  );
  // An installed dependency with no schemas table
  fs.mkdirSync(path.join(baseDir, "node_modules", "noflo-plain"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(baseDir, "node_modules", "noflo-plain", "noflo.json"),
    JSON.stringify({ components: [] }),
  );
});

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

describe("schemaTableFromNodeModules", () => {
  it("loads installed packages' schemas tables, digest-verified", async () => {
    const table = await schemaTableFromNodeModules(baseDir);
    assert.ok(table.has(pointDigest));
    assert.ok(table.size >= 1);
  });

  it("answers all-nil when no readable body ships", async () => {
    fs.rmSync(path.join(baseDir, "noflo.json"));
    const table = await schemaTableFromNodeModules(baseDir);
    assert.equal(table.size, 0);
    const answer = table.request([pointDigest], true);
    assert.equal(answer.get(pointDigest), null);
  });

  it("fails loudly on a digest mismatch at startup", async () => {
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "point.json"),
      `${JSON.stringify({ $id: "canvas/point", type: "string" })}\n`,
    );
    await assert.rejects(
      () => schemaTableFromNodeModules(baseDir),
      /Digest mismatch/,
    );
  });
});

describe("loadSchemaPackage", () => {
  it("loads one package's schema set, digest-verified", async () => {
    const table = new SchemaTable();
    assert.equal(await loadSchemaPackage(table, baseDir), 1);
    assert.ok(table.has(pointDigest));
  });

  it("contributes nothing when the package ships no manifest", async () => {
    const table = new SchemaTable();
    const empty = path.join(baseDir, "node_modules", "noflo-plain");
    assert.equal(await loadSchemaPackage(table, empty), 0);
    const missing = path.join(baseDir, "node_modules", "not-installed");
    assert.equal(await loadSchemaPackage(table, missing), 0);
    assert.equal(table.size, 0);
  });

  it("skips manifest entries without a readable body path", async () => {
    fs.writeFileSync(
      path.join(baseDir, "noflo.json"),
      JSON.stringify({
        schemas: {
          "canvas/point": {
            digest: pointDigest,
            path: "schemas/canvas/point.json",
          },
          "canvas/ghost": { digest: "0".repeat(64), path: undefined },
          "canvas/missing": {
            digest: "0".repeat(64),
            path: "schemas/canvas/missing.json",
          },
        },
      }),
    );
    const table = new SchemaTable();
    assert.equal(await loadSchemaPackage(table, baseDir), 1);
    assert.ok(table.has(pointDigest));
  });
});

// The shipped noflo schema artifact (work document #44): the noflo
// package ships the port-behavior catalog and pins it in its manifest's
// schemas table — a deployment loading installed packages' manifests
// serves the noflo.* vocabulary to clients through the Two-Step Cache
// without any project-authored writes.
describe("the shipped noflo schema artifact", () => {
  it("loads the port-behavior catalog from the @noflo/noflo package manifest", async () => {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const entryPath = req.resolve("@noflo/noflo");
    // The main entry is src/lib/NoFlo.js; the package root is two levels up
    const pkgDir = path.resolve(path.dirname(entryPath), "..", "..");
    const table = new SchemaTable();
    const loaded = await loadSchemaPackage(table, pkgDir);
    assert.ok(loaded >= 1, "the package's schema set loaded");

    const manifest = JSON.parse(
      fs.readFileSync(path.join(pkgDir, "noflo.json"), "utf8"),
    );
    for (const [id, entryDef] of Object.entries(manifest.schemas ?? {})) {
      assert.ok(table.has(entryDef.digest), `${id} is in the table by digest`);
    }
    const pin = manifest.schemas["noflo/port-behavior"];
    const bodyPath = path.join(pkgDir, pin.path);
    const body = JSON.parse(fs.readFileSync(bodyPath, "utf8"));
    const served = table.entry(pin.digest);
    assert.ok(served?.body, "the table holds the pinned body");
    assert.deepEqual(
      served.body,
      body,
      "the served body is the shipped artifact",
    );
    assert.equal(served.body.entries["noflo.control"].class, "config");
  });
});
