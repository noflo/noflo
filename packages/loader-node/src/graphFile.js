//     @noflo/loader-node - Node.js component discovery for NoFlo
//     (c) 2013-2026 Flowhub UG
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @file graphFile module
 * @description Loading and saving native graph models from files and JSON
 *   documents (work document #10). `.json` files are FBP JSON; `.fbp` files
 *   are parsed with `@noflo/fbp` into FBP JSON and imported. FBP JSON is the
 *   interchange format.
 */

import { parse } from "@noflo/fbp";
import { exportFbpJson, importFbpJson } from "@noflo/graph";

/**
 * @typedef {import("@noflo/graph").GraphModel} GraphModel
 */

/**
 * Parse an FBP JSON document into a graph model.
 *
 * @param {Object<string, any>|string} contents - Parsed or raw FBP JSON
 * @returns {GraphModel}
 */
export function loadGraphJson(contents) {
  const json = typeof contents === "string" ? JSON.parse(contents) : contents;
  return importFbpJson(json);
}

/**
 * Load a graph model from a `.json` or `.fbp` graph file. Node.js only.
 *
 * `.fbp` files are parsed with legacy case-insensitive semantics: that is
 * what the existing .fbp corpus in the ecosystem means. The `@noflo/fbp`
 * package default (`caseSensitive: true`) is the 2.x policy for new code.
 *
 * @param {string} file
 * @returns {Promise<GraphModel>}
 */
export async function loadGraphFile(file) {
  const { readFile } = await import("node:fs/promises");
  const contents = await readFile(file, "utf-8");
  if (file.endsWith(".fbp")) {
    return loadGraphJson(parse(contents, { caseSensitive: false }));
  }
  return loadGraphJson(contents);
}

/**
 * Save a graph model as an FBP JSON file. Node.js only.
 *
 * @param {GraphModel} model
 * @param {string} file
 * @returns {Promise<string>} The file path written
 */
export async function saveGraphFile(model, file) {
  const { writeFile } = await import("node:fs/promises");
  const contents = `${JSON.stringify(exportFbpJson(model), null, 2)}\n`;
  await writeFile(file, contents, "utf-8");
  return file;
}
