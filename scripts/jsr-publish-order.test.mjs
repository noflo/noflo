import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { computePublishOrder } from "./jsr-publish-order.mjs";

/**
 * Creates a fixture packages tree.
 * @param {string} root
 * @param {Record<string, { deps?: string[], jsr?: boolean }>} pkgs - dir →
 *   package.json `dependencies` map + whether it has a jsr.json.
 */
function fixture(root, pkgs) {
  mkdirSync(join(root, "packages"), { recursive: true });
  for (const [dir, spec] of Object.entries(pkgs)) {
    const dirPath = join(root, "packages", dir);
    mkdirSync(dirPath, { recursive: true });
    const deps = Object.fromEntries(
      (spec.deps ?? []).map((d) => [
        d.startsWith("@") ? d : `@noflo/${d}`,
        "^1.6.0",
      ]),
    );
    writeFileSync(
      join(dirPath, "package.json"),
      JSON.stringify({
        name: `@noflo/${dir}`,
        dependencies: deps,
      }),
    );
    if (spec.jsr !== false) {
      writeFileSync(
        join(dirPath, "jsr.json"),
        JSON.stringify({ name: `@noflo/${dir}`, version: "1.6.0" }),
      );
    }
  }
}

/** @returns {string} */
function makeRoot() {
  return mkdtempSync(join(tmpdir(), "jsr-order-"));
}

test("dependencies publish before dependents", () => {
  // The 0.9.0 reticulum-js regression shape: an alphabetical glob published
  // a dependent before its dependency, and JSR resolves `jsr:` deps at
  // publish time.
  const root = makeRoot();
  try {
    fixture(root, {
      noflo: { deps: [] },
      runner: { deps: ["noflo"] },
      runtime: { deps: ["noflo", "runner"] },
    });
    const order = computePublishOrder(root);
    assert.ok(order.indexOf("noflo") < order.indexOf("runner"));
    assert.ok(order.indexOf("runner") < order.indexOf("runtime"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("independent packages keep alphabetical order among ready peers", () => {
  const root = makeRoot();
  try {
    fixture(root, {
      core: { deps: [] },
      zebra: { deps: [] },
      alpha: { deps: [] },
    });
    assert.deepEqual(computePublishOrder(root), ["alpha", "core", "zebra"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directories without a jsr.json are skipped; external deps ignored", () => {
  const root = makeRoot();
  try {
    fixture(root, {
      noflo: { deps: [] },
      "not-a-jsr-package": { deps: [], jsr: false },
      runner: {
        deps: [
          "noflo",
          // External deps appear in package.json dependencies; they must not
          // be waited for.
          "fbp",
        ],
      },
    });
    const order = computePublishOrder(root);
    assert.deepEqual(order, ["noflo", "runner"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a dependency cycle throws instead of looping forever", () => {
  const root = makeRoot();
  try {
    fixture(root, {
      a: { deps: ["b"] },
      b: { deps: ["a"] },
    });
    assert.throws(() => computePublishOrder(root), /Cyclic @noflo dependency/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no jsr.json anywhere → empty order (dormant JSR setup)", () => {
  const root = makeRoot();
  try {
    fixture(root, {
      noflo: { deps: [], jsr: false },
    });
    assert.deepEqual(computePublishOrder(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
