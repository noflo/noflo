//     (c) 2021-2026 Henri Bergius

/**
 * @file loadJsonGraph module
 * @description Spec helper: load a committed FBP JSON fixture into a native
 *   graph model. The `.fbp` DSL fixtures were pre-converted to FBP JSON so
 *   that core specs do not depend on the `@noflo/fbp` parser (work document
 *   #16); the pre-conversion ran with legacy `caseSensitive: false` semantics
 *   matching what the original corpus meant.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { importFbpJson } from "@noflo/graph";

/**
 * @param {string} name - Fixture name under spec/fixtures/fbp/ (without extension)
 * @returns {import("@noflo/graph").GraphModel}
 */
export function loadJsonGraphFixture(name) {
  const file = fileURLToPath(
    new URL(`../fixtures/fbp/${name}.json`, import.meta.url),
  );
  return importFbpJson(JSON.parse(readFileSync(file, "utf-8")));
}

/**
 * Build a graph model from an FBP JSON object.
 *
 * @param {Object<string, any>} json
 * @returns {import("@noflo/graph").GraphModel}
 */
export function graphFromJson(json) {
  return importFbpJson(json);
}
