/**
 * @file graphFile module
 * @description Loading and saving native graph models from files and JSON
 *   documents (work document #10). FBP JSON is the interchange format; the
 *   .fbp DSL gains its own parser package separately.
 */

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
 * Load a graph model from a `.json` graph file. Node.js only.
 *
 * @param {string} file
 * @returns {Promise<GraphModel>}
 */
export async function loadGraphFile(file) {
  if (file.endsWith(".fbp")) {
    throw new Error(
      "Loading .fbp DSL files is not supported yet; the DSL parser ships as a separate package",
    );
  }
  const { readFile } = await import("node:fs/promises");
  return loadGraphJson(await readFile(file, "utf-8"));
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
