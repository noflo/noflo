/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file assertions module
 * @description fbp-spec expectation operators mapped to `node:assert/strict`.
 *
 *   Mirrors the operator vocabulary and semantics of fbp-spec's
 *   `lib/expectation.js` (verified against fbp-spec@0.8.0): one expectation
 *   object carries exactly one operator — the first key that isn't `path` —
 *   and an optional `path` JSONPath selector applied to the packet data
 *   first. Every JSONPath match must satisfy the operator; zero matches is
 *   a failure.
 */

import assert from "node:assert/strict";
import { JSONPath } from "../vendor/jsonpath-plus-11.1.0.js";

/**
 * Chai-compatible type name for `type` assertions (includes `array`/`null`).
 *
 * @param {any} value
 * @returns {string}
 */
const typeName = (value) => {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
};

/**
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
      typeof actual === "number" && actual > expected,
      `Failed on port ${portName}: expected ${JSON.stringify(actual)} to be above ${expected}`,
    );
  },
  below(actual, expected, portName) {
    assert.ok(
      typeof actual === "number" && actual < expected,
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
    assert.ok(
      actual !== null && typeof actual === "object",
      `Failed on port ${portName}: haveKeys expects an object, got ${typeName(actual)}`,
    );
    const actualKeys = Object.keys(/** @type {object} */ (actual)).sort();
    const expectedKeys = [...expected].sort();
    assert.deepEqual(
      actualKeys,
      expectedKeys,
      `Failed on port ${portName}: expected exactly keys [${expectedKeys}], got [${actualKeys}]`,
    );
  },
  includeKeys(actual, expected, portName) {
    assert.ok(
      actual !== null && typeof actual === "object",
      `Failed on port ${portName}: includeKeys expects an object, got ${typeName(actual)}`,
    );
    for (const key of expected) {
      assert.ok(
        key in /** @type {object} */ (actual),
        `Failed on port ${portName}: expected key '${key}' to be included`,
      );
    }
  },
  contains(actual, expected, portName) {
    if (typeof actual === "string") {
      assert.ok(
        actual.includes(String(expected)),
        `Failed on port ${portName}: expected '${actual}' to contain '${expected}'`,
      );
      return;
    }
    if (Array.isArray(actual)) {
      assert.ok(
        actual.includes(expected),
        `Failed on port ${portName}: expected array to contain ${JSON.stringify(expected)}`,
      );
      return;
    }
    assert.fail(
      `Failed on port ${portName}: contains expects a string or array, got ${typeName(actual)}`,
    );
  },
  noterror(actual, _expected, portName) {
    if (actual && /** @type {Error} */ (actual).message) {
      throw actual;
    }
    assert.ok(
      actual !== undefined,
      `Failed on port ${portName}: noterror received no data`,
    );
  },
};

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
