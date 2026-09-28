/**
 * @file loader module
 * @description Load fbp-spec suites from YAML or JSON files.
 *
 *   A file may contain a single suite object or an array of suites. YAML
 *   files may additionally use `---` document separators for multiple
 *   suites (the multi-suite format used by fbp-spec), handled via the
 *   vendored YAML parser.
 */

import { readFile } from "node:fs/promises";
import { parseAllDocuments } from "../vendor/yaml-2.9.1.js";

/**
 * Validate and normalize a parsed suite object.
 *
 * @param {any} suite
 * @param {string} source - File path for error messages
 * @returns {Record<string, any>}
 */
function validateSuite(suite, source) {
  if (typeof suite !== "object" || suite === null || Array.isArray(suite)) {
    throw new Error(`Suite in ${source} is not an object`);
  }
  if (typeof suite.topic !== "string" || !suite.topic) {
    throw new Error(`Suite in ${source} is missing a 'topic'`);
  }
  if (suite.cases !== undefined && !Array.isArray(suite.cases)) {
    throw new Error(
      `Suite '${suite.topic}' in ${source} has non-array 'cases'`,
    );
  }
  return suite;
}

/**
 * Load suites from a spec file. Returns one suite per entry, in file order.
 *
 * @param {string} filePath - Path to a `.yaml`, `.yml` or `.json` file
 * @returns {Promise<Record<string, any>[]>}
 */
export async function loadSuitesFromFile(filePath) {
  const text = await readFile(filePath, "utf8");
  /** @type {any[]} */
  let docs;
  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(text);
    docs = Array.isArray(parsed) ? parsed : [parsed];
  } else if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    docs = parseAllDocuments(text).map((document) => document.toJS());
    // A single YAML document that is itself an array is an array of suites
    if (docs.length === 1 && Array.isArray(docs[0])) {
      docs = docs[0];
    }
  } else {
    throw new Error(`Unsupported spec file format: ${filePath}`);
  }
  return docs.map((suite) => validateSuite(suite, filePath));
}

export { validateSuite };
