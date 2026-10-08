import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkAll, checkPackage } from "./check-browser-sources.js";

/**
 * (c) 2021-2026 Henri Bergius
 * Build a fake package dir under `root` with one runtime source file.
 *
 * @param {string} pkgDir
 * @param {string} src Source content for `src/index.js`
 * @returns {string} The package dir
 */
function fixture(pkgDir, src) {
  mkdirSync(join(pkgDir, "src"), { recursive: true });
  writeFileSync(join(pkgDir, "src", "index.js"), src);
  return pkgDir;
}

test("clean browser-friendly source passes", () => {
  const root = mkdtempSync(join(tmpdir(), "cbs-"));
  try {
    const pkg = fixture(
      join(root, "packages", "noflo"),
      `import { GraphModel } from "@noflo/graph";\nexport const x = 1;\n`,
    );
    assert.deepEqual(checkPackage(pkg, root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [kind, src] of [
  ["node-import", `import fs from "node:fs";\nexport const x = 1;\n`],
  ["eval", `export const f = eval("1");\n`],
  ["new-function", `export const f = new Function("return 1");\n`],
  ["require", `const fs = require("fs");\nexport const x = 1;\n`],
  ["process-global", `export const debug = process.env.DEBUG;\n`],
]) {
  test(`flags ${kind}`, () => {
    const root = mkdtempSync(join(tmpdir(), "cbs-"));
    try {
      const pkg = fixture(join(root, "packages", "noflo"), src);
      const problems = checkPackage(pkg, root);
      assert.equal(problems.length, 1);
      assert.equal(problems[0].kind, kind);
      assert.equal(problems[0].line, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("comments mentioning banned APIs do not trip the guard", () => {
  const root = mkdtempSync(join(tmpdir(), "cbs-"));
  try {
    const pkg = fixture(
      join(root, "packages", "noflo"),
      `/** Never call eval() or require() here; no node: imports either. */\n// process.env is not available in browsers\nexport const x = 1;\n`,
    );
    assert.deepEqual(checkPackage(pkg, root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("FBP entity vocabulary does not trip the process guard", () => {
  const root = mkdtempSync(join(tmpdir(), "cbs-"));
  try {
    // Graph nodes are called "processes" in FBP; `process.component` and
    // friends are NoFlo domain objects, not the Node.js global.
    const pkg = fixture(
      join(root, "packages", "noflo"),
      `if (!process.component) { throw new Error("No inport"); }
export const id = process.id;
`,
    );
    assert.deepEqual(checkPackage(pkg, root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("type-only declaration files are ignored", () => {
  const root = mkdtempSync(join(tmpdir(), "cbs-"));
  try {
    const pkgDir = join(root, "packages", "noflo");
    mkdirSync(join(pkgDir, "src"), { recursive: true });
    writeFileSync(
      join(pkgDir, "src", "index.d.ts"),
      `import type { x } from "node:fs";\n`,
    );
    assert.deepEqual(checkPackage(pkgDir, root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkAll only scans the browser-reachable packages", () => {
  const root = mkdtempSync(join(tmpdir(), "cbs-"));
  try {
    fixture(
      join(root, "packages", "loader-node"),
      `import fs from "node:fs";\n`,
    );
    fixture(join(root, "packages", "noflo"), `export const x = 1;\n`);
    // loader-node is the server side: node: imports are fine there
    assert.deepEqual(checkAll(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkAll reports problems with package and file attribution", () => {
  const root = mkdtempSync(join(tmpdir(), "cbs-"));
  try {
    fixture(join(root, "packages", "graph"), `const p = process.platform;\n`);
    const problems = checkAll(root);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].pkg, "graph");
    assert.match(problems[0].file, /packages[\\/]graph[\\/]src[\\/]index\.js$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
