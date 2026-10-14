//     (c) 2021-2026 Henri Bergius

/**
 * Differential parity tests: `@noflo/fbp` must produce output deep-equal to
 * the reference `fbp` parser for the same input under the same explicitly-set
 * options, and reject the same inputs.
 *
 * Per the case-sensitivity policy (#15) the option value is always passed
 * explicitly here; the package-level default is covered by its own test.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import { parse } from "../src/index.js";
import { accepted, rejected } from "./fixtures/corpus.js";

/** Reference parser, CommonJS. */
const require = createRequire(import.meta.url);
const reference = require("fbp");

const optionSets = [
  {
    name: "caseSensitive: false (legacy parity)",
    options: { caseSensitive: false },
  },
  {
    name: "caseSensitive: true (2.x policy)",
    options: { caseSensitive: true },
  },
];

for (const { name, options } of optionSets) {
  for (const entry of accepted) {
    test(`parity [${name}] accept: ${entry.name}`, () => {
      const expected = reference.parse(entry.source, { ...options });
      const actual = parse(entry.source, { ...options });
      assert.deepStrictEqual(actual, expected);
    });
  }
  for (const entry of rejected) {
    test(`parity [${name}] reject: ${entry.name}`, () => {
      assert.throws(() => reference.parse(entry.source, { ...options }));
      assert.throws(() => parse(entry.source, { ...options }));
    });
  }
}

test("package default matches reference caseSensitive: true", () => {
  for (const entry of accepted) {
    const expected = reference.parse(entry.source, { caseSensitive: true });
    assert.deepStrictEqual(parse(entry.source), expected);
    assert.deepStrictEqual(parse(entry.source, {}), expected);
  }
});

test("options default tolerates missing options argument", () => {
  // The reference parser crashes when called with `undefined` options; ours
  // must not.
  assert.doesNotThrow(() => parse("A(a) -> B(b)", undefined));
});
