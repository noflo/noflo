/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file fixture module
 * @description Resolve the fixture graph for an fbp-spec suite.
 *
 *   A suite without a `fixture` runs against its `topic` component directly
 *   (the component's own ports are the test surface). A suite with an
 *   explicit fixture runs against a graph: `fixture.type` is either `json`
 *   (an FBP graph JSON document) or `fbp` (a `.fbp` DSL source string).
 *
 *   Semantics follow the reference fbp-spec runner: the `.fbp` DSL is parsed
 *   case-insensitively (mirroring the reference `fbp` parser default), and
 *   parse failures are reported with the same error messages as fbp-spec.
 */
/* @ts-self-types="./fixture.d.ts" */

import { parse as parseFbp } from "@noflo/fbp";

/**
 * @typedef {object} Fixture
 * @property {"json" | "fbp"} type - Fixture graph format
 * @property {string} data - Fixture graph source
 */

/**
 * Resolve the fixture graph JSON for a suite.
 *
 * @param {Record<string, any>} suite - fbp-spec suite
 * @returns {Record<string, any> | null} FBP graph JSON document, or null
 *   when the suite has no explicit fixture (run against the topic component)
 * @throws {Error} When the fixture type is unknown or the fixture data
 *   cannot be parsed
 */
export function resolveFixtureGraph(suite) {
  const fixture = suite.fixture;
  if (!fixture) return null;

  const { type, data } = fixture;
  if (type === "json") {
    try {
      return JSON.parse(data);
    } catch (error) {
      const err = /** @type {Error} */ (error);
      throw new Error(`Could not parse JSON fixture: ${err.message}`);
    }
  }
  if (type === "fbp") {
    let graph;
    try {
      // The reference fbp parser defaults to case-insensitive port names;
      // fbp-spec fixtures are written against that behavior.
      graph = parseFbp(data, { caseSensitive: false });
    } catch (error) {
      const err = /** @type {Error} */ (error);
      throw new Error(`Could not parse FBP fixture: ${err.message}`);
    }
    if (!graph.properties) {
      graph.properties = {};
    }
    return graph;
  }
  throw new Error(`Unknown fixture type ${type}`);
}
