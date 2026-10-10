/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: MIT
 * @file canonical module
 * @description Deterministic serialization helpers for the graph model.
 *
 *   Epoch snapshots (work document #10) must hash stably regardless of the
 *   order operations arrived in. `stableStringify` produces a canonical
 *   JSON string: object keys sorted, arrays kept in their given order, and
 *   cycles rejected up front. Entity collections handed to it are expected
 *   to be sorted by `entity_id` by the caller (see `GraphModel.serialize`).
 */
/* @ts-self-types="./canonical.d.ts" */

import { GraphModelError } from "./entities.js";

/**
 * Serialize a JSON-able value to a canonical string: object keys sorted
 * alphabetically at every level, array element order preserved, cycles
 * rejected with a `GraphModelError`.
 *
 * @param {any} value
 * @returns {string}
 */
export function stableStringify(value) {
  return JSON.stringify(canonicalize(value, new Set()));
}

/**
 * @param {any} value
 * @param {Set<any>} ancestors
 * @returns {any}
 */
function canonicalize(value, ancestors) {
  if (Array.isArray(value)) {
    return value.map((element) => canonicalize(element, ancestors));
  }
  if (value !== null && typeof value === "object") {
    if (ancestors.has(value)) {
      throw new GraphModelError("Cannot canonicalize a cyclic structure");
    }
    ancestors.add(value);
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize(value[key], ancestors);
    }
    ancestors.delete(value);
    return out;
  }
  return value;
}
