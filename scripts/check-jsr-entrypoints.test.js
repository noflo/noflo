import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkAll, checkPackage } from "./check-jsr-entrypoints.js";

/** Minimal valid entrypoint module: leading doc + a self-types pointer.
 * The fixture writes this as `src/index.js`, so the pointer is one level up. */
const GOOD_SRC = `/**
 * @file index.js
 * @description example
 */

/* @ts-self-types="../types/src/index.d.ts" */

export const x = 1;
`;

/**
 * Build a fake monorepo package dir under `root` with a `jsr.json`, a src
 * entrypoint, and (optionally) a generated `types/` declaration.
 *
 * @param {string} pkgDir
 * @param {{ src?: string, dts?: boolean|string, exports?: Record<string,string> }} [opts]
 */
function fixture(pkgDir, opts = {}) {
  mkdirSync(join(pkgDir, "src"), { recursive: true });
  const exports = opts.exports ?? { ".": "./src/index.js" };
  writeFileSync(
    join(pkgDir, "jsr.json"),
    JSON.stringify({ name: "@noflo/fake", version: "0.0.0", exports }),
  );
  writeFileSync(join(pkgDir, "src", "index.js"), opts.src ?? GOOD_SRC);
  if (opts.dts) {
    const dtsRel = typeof opts.dts === "string" ? opts.dts : "index.d.ts";
    mkdirSync(join(pkgDir, "types", "src"), { recursive: true });
    writeFileSync(
      join(pkgDir, "types", "src", dtsRel),
      "export const x: number;\n",
    );
  }
}

test("checkPackage: clean entrypoint (doc + pointer + emitted d.ts) → no problems", () => {
  const root = mkdtempSync(join(tmpdir(), "jsr-ep-clean-"));
  try {
    const pkgDir = join(root, "packages", "fake");
    fixture(pkgDir, { dts: true }); // GOOD_SRC points at ../types/src/index.d.ts
    assert.deepEqual(checkPackage(pkgDir), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkPackage: no leading module doc → flagged", () => {
  const root = mkdtempSync(join(tmpdir(), "jsr-ep-nodoc-"));
  try {
    const pkgDir = join(root, "packages", "fake");
    // Doc placed *after* an import — the leading-char check must not count it
    // as a module doc.
    fixture(pkgDir, {
      src: `import { x } from "y";

/**
 * @file misplaced.js
 */
/* @ts-self-types="../../types/src/index.d.ts" */
export { x };
`,
    });
    const problems = checkPackage(pkgDir);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "no-module-doc");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkPackage: missing @ts-self-types pointer → flagged (the slow-type regression)", () => {
  const root = mkdtempSync(join(tmpdir(), "jsr-ep-noptr-"));
  try {
    const pkgDir = join(root, "packages", "fake");
    fixture(pkgDir, {
      src: `/**
 * @file no-pointer.js
 * @description has a doc but no pointer
 */

export const x = 1;
`,
    });
    const problems = checkPackage(pkgDir);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "no-ts-self-types");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkPackage: pointer to a .d.ts tsc never emitted → flagged when types/ is present", () => {
  const root = mkdtempSync(join(tmpdir(), "jsr-ep-baddts-"));
  try {
    const pkgDir = join(root, "packages", "fake");
    fixture(pkgDir, { dts: true }); // types/ exists, but …
    rmSync(join(pkgDir, "types", "src", "index.d.ts")); // …the pointed file is gone
    const problems = checkPackage(pkgDir);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "missing-dts");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkPackage: missing .d.ts is NOT flagged when types/ is absent (fresh checkout)", () => {
  const root = mkdtempSync(join(tmpdir(), "jsr-ep-notypes-"));
  try {
    const pkgDir = join(root, "packages", "fake");
    fixture(pkgDir); // no types/ generated yet
    assert.deepEqual(checkPackage(pkgDir), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkPackage: skips non-JS / conditional exports entries", () => {
  const root = mkdtempSync(join(tmpdir(), "jsr-ep-skip-"));
  try {
    const pkgDir = join(root, "packages", "fake");
    fixture(pkgDir, {
      exports: {
        ".": "./src/index.js",
        "./data.json": "./src/data.json",
        "./browser": { browser: "./src/index.js", default: "./src/index.js" },
      },
    });
    // Only the "." (string, .js) entry is checked; it's clean.
    assert.deepEqual(checkPackage(pkgDir), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkAll: aggregates problems across packages/* and skips dirs without jsr.json", () => {
  const root = mkdtempSync(join(tmpdir(), "jsr-ep-all-"));
  try {
    const goodPkg = join(root, "packages", "good");
    const badPkg = join(root, "packages", "bad");
    const noJsr = join(root, "packages", "nojsr");
    fixture(goodPkg, { dts: true }); // clean: doc + pointer + emitted d.ts
    fixture(badPkg, {
      src: `export const x = 1;\n`, // no doc, no pointer
    });
    mkdirSync(noJsr, { recursive: true }); // no jsr.json → ignored

    const problems = checkAll(root);
    assert.equal(problems.length, 2); // no-module-doc + no-ts-self-types on bad
    assert.ok(
      problems.every((p) => p.pkg === "@noflo/fake"),
      "all problems come from the bad package",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
