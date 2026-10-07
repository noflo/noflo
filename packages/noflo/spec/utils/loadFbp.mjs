/**
 * @file loadFbp module
 * @description Spec helper: parse .fbp DSL source into a native graph model
 *   via `@noflo/fbp` and the FBP JSON import adapter. The spec fixtures
 *   predate the 2.x case-sensitivity policy, so they parse with
 *   `caseSensitive: false`; the library default stays case-sensitive.
 */

import { importFbpJson } from "@noflo/graph";
import { parse } from "@noflo/fbp";

/**
 * @param {string} source
 * @returns {import("@noflo/graph").GraphModel}
 */
export function loadFbp(source) {
  return importFbpJson(parse(source, { caseSensitive: false }));
}
