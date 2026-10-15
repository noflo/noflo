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
import { schemaTableFromNodeModules } from "../src/schema-table.js";

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
