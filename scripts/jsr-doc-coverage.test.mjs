import assert from "node:assert/strict";
import { test } from "node:test";
import { hasDescription, parseExports } from "./jsr-doc-coverage.mjs";

test("hasDescription: a non-empty `doc` is documented (the JSR rule)", () => {
  assert.equal(hasDescription({ doc: "Creates a packet." }), true);
  assert.equal(hasDescription({ doc: "x", tags: [{ kind: "returns" }] }), true);
});

test("hasDescription: tag-only or empty doc is NOT documented", () => {
  // The whole point: prose must precede @-tags.
  assert.equal(hasDescription({ doc: "", tags: [{ kind: "returns" }] }), false);
  assert.equal(hasDescription({ tags: [{ kind: "param", name: "x" }] }), false);
  assert.equal(hasDescription({ doc: "   \n  " }), false);
  assert.equal(hasDescription({}), false);
  assert.equal(hasDescription(null), false);
});

test("parseExports: local declarations (class/function/const)", () => {
  const out = parseExports(`
    export class Foo {}
    export function bar() {}
    export const X = 1;
    export let y = 2;
  `);
  assert.deepEqual(out.map((o) => o.name).sort(), ["Foo", "X", "bar", "y"]);
  assert.ok(out.every((o) => o.kind === "local"));
});

test("parseExports: named re-export with `a as b` keeps the original name", () => {
  const out = parseExports(
    `export { APP_NAME as DISCOVERY_APP_NAME, ASPECT } from "./discovery.js";`,
  );
  const renamed = out.find((o) => o.name === "DISCOVERY_APP_NAME");
  assert.equal(renamed.origName, "APP_NAME");
  assert.equal(renamed.fromSpec, "./discovery.js");
  const plain = out.find((o) => o.name === "ASPECT");
  assert.equal(plain.origName, "ASPECT");
});

test("parseExports: named export without `from` is local", () => {
  const out = parseExports(`export { a, b };`);
  assert.equal(out.length, 2);
  assert.ok(out.every((o) => o.fromSpec === undefined && o.kind === "named"));
});

test("parseExports: wildcard and namespace re-exports", () => {
  const out = parseExports(`
    export * from "./constants.js";
    export * as NoFloConstants from "./constants.js";
  `);
  const star = out.find((o) => o.kind === "star");
  assert.equal(star.fromSpec, "./constants.js");
  const ns = out.find((o) => o.kind === "star-as");
  assert.equal(ns.name, "NoFloConstants");
  assert.equal(ns.fromSpec, "./constants.js");
});
