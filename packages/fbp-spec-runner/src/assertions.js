/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file assertions module
 * @description fbp-spec expectation operators mapped to `node:assert/strict`.
 *
 *   Mirrors the operator vocabulary and semantics of the released
 *   fbp-spec@0.8.0 (`lib/expectation.js`, chai-based): one expectation
 *   object carries exactly one operator — the first key that isn't `path` —
 *   and an optional `path` JSONPath selector applied to the packet data
 *   first. Every JSONPath match must satisfy the operator; zero matches is
 *   a failure.
 *
 *   Note: the `type` operator deliberately keeps chai `a()` type-name
 *   semantics (`array`, `null`, `date`, `regexp`), matching the released
 *   chai-based fbp-spec; `../fbp-spec`'s expectation library implements
 *   the same naming since the chai removal there.
 */
/* @ts-self-types="./assertions.d.ts" */

import assert from "node:assert/strict";
import { JSONPath } from "../vendor/jsonpath-plus-11.1.0.js";

/**
 * Chai-compatible type name for `type` assertions (includes `array`/`null`).
 * Matches the released fbp-spec's chai `a()` semantics; `../fbp-spec`'s
 * expectation library implements the same naming.
 *
 * @param {any} value
 * @returns {string}
 */
const typeName = (value) => {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (value instanceof Date) return "date";
  if (value instanceof RegExp) return "regexp";
  return typeof value;
};

/**
 * A single fbp-spec expectation operator: validates the JSONPath-extracted
 * packet payload against the expectation's value, failing the enclosing
 * `node:test` assertion when it does not match.
 *
 * @typedef {(actual: any, expected: any, portName: string) => void} Operator
 */

/** @type {Record<string, Operator>} */
const operators = {
  equals(actual, expected, portName) {
    assert.deepStrictEqual(
      actual,
      expected,
      `Failed on port ${portName}: expected deep equality with ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  },
  above(actual, expected, portName) {
    assert.ok(
      actual > expected,
      `Failed on port ${portName}: expected ${JSON.stringify(actual)} to be above ${expected}`,
    );
  },
  below(actual, expected, portName) {
    assert.ok(
      actual < expected,
      `Failed on port ${portName}: expected ${JSON.stringify(actual)} to be below ${expected}`,
    );
  },
  type(actual, expected, portName) {
    assert.strictEqual(
      typeName(actual),
      expected,
      `Failed on port ${portName}: expected type '${expected}', got '${typeName(actual)}'`,
    );
  },
  haveKeys(actual, expected, portName) {
    // Like fbp-spec, keys are taken from any value; non-objects simply
    // contribute no or index keys rather than failing upfront
    const actualKeys = Object.keys(actual ?? {}).sort();
    const expectedKeys = [...expected].sort();
    assert.deepEqual(
      actualKeys,
      expectedKeys,
      `Failed on port ${portName}: expected ${JSON.stringify(actual)} to have keys ${JSON.stringify(expectedKeys)}, got ${JSON.stringify(actualKeys)}`,
    );
  },
  includeKeys(actual, expected, portName) {
    const actualKeys = Object.keys(actual ?? {});
    for (const key of expected) {
      assert.ok(
        actualKeys.includes(key),
        `Failed on port ${portName}: expected ${JSON.stringify(actual)} to include key ${key}`,
      );
    }
  },
  contains(actual, expected, portName) {
    if (typeof actual === "string") {
      assert.ok(
        actual.includes(expected),
        `Failed on port ${portName}: expected '${actual}' to contain '${expected}'`,
      );
      return;
    }
    if (Array.isArray(actual)) {
      // Members are matched with deep equality, like chai's include
      assert.ok(
        actual.some((member) => deepEqual(member, expected)),
        `Failed on port ${portName}: expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`,
      );
      return;
    }
    if (actual !== null && typeof actual === "object") {
      // Objects are matched as a deep-equal subset
      for (const key of Object.keys(expected)) {
        assert.ok(
          deepEqual(actual[key], expected[key]),
          `Failed on port ${portName}: expected ${JSON.stringify(actual)} to contain { '${key}': ${JSON.stringify(expected[key])} }`,
        );
      }
      return;
    }
    assert.fail(
      `Failed on port ${portName}: cannot check contains on ${JSON.stringify(actual)}`,
    );
  },
  noterror(actual) {
    // Like fbp-spec, any error-like value fails the expectation by being
    // thrown; non-errors pass silently
    if (actual?.message) {
      throw actual;
    }
  },
};

/**
 * Structural comparison used by `contains` and `equals`-style checks.
 *
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the operator of an expectation object: the first key that isn't
 * `path` and matches a known operator. Matches fbp-spec's findOperator.
 *
 * @param {Record<string, any>} expectation
 * @returns {{ name: string, predicate: Operator }}
 */
export function findOperator(expectation) {
  for (const opname of Object.keys(expectation)) {
    if (opname === "path") continue;
    const op = operators[opname];
    if (op) return { name: opname, predicate: op };
  }
  throw new Error(
    `fbp-spec: No operator matching ${Object.keys(expectation)}. Available: ${Object.keys(operators)}`,
  );
}

/**
 * Apply the expectation's JSONPath (if any) and return the matches to check.
 * Zero matches is a failure, mirroring fbp-spec's extractMatches.
 *
 * @param {Record<string, any>} expectation
 * @param {any} data
 * @returns {any[]}
 */
export function extractMatches(expectation, data) {
  if (!expectation.path) return [data];
  const matches = /** @type {any[]} */ (
    JSONPath({ path: expectation.path, json: data, wrap: true })
  );
  if (!matches.length) {
    throw new Error(
      `expected JSONPath '${expectation.path}' to match data in ${JSON.stringify(data)}`,
    );
  }
  return matches;
}

/**
 * Evaluate one expectation object against a received packet payload.
 *
 * @param {any} actualPayload
 * @param {Record<string, any>} expectation
 * @param {string} portName
 */
export function evaluatePacket(actualPayload, expectation, portName) {
  const { name, predicate } = findOperator(expectation);
  const matches = extractMatches(expectation, actualPayload);
  for (const match of matches) {
    predicate(match, expectation[name], portName);
  }
}

/**
 * Evaluate a full expect step ({ port: expectation | expectation[] })
 * against the data received on each referenced port. All expectations for
 * a port are applied to the same message, per fbp-spec semantics.
 *
 * @param {Record<string, any>} expectStep
 * @param {Record<string, any>} received - Port name → packet data
 */
export function evaluateExpectStep(expectStep, received) {
  for (const [portName, expectations] of Object.entries(expectStep || {})) {
    const list = Array.isArray(expectations) ? expectations : [expectations];
    const data = received[portName];
    if (data === undefined) {
      throw new Error(`No data received on port ${portName}`);
    }
    for (const expectation of list) {
      evaluatePacket(data, expectation, portName);
    }
  }
}
