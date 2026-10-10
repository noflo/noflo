//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     NoFlo may be freely distributed under the MIT license

/**
 * @module trace
 * @description Trace-file writing for the host: flushes a recorded
 *   `Flowtrace` to the project's `.flowtrace/` directory as a streamable
 *   trace file (work document #4 §10) — the `0xF0` topology snapshot frame
 *   followed by `0x32` execution chunks, self-delimiting and parseable
 *   while still being written. Flushing happens on network end, on
 *   SIGTERM/SIGINT, and on SIGUSR2 (snapshot without stopping).
 */
/* @ts-self-types="./trace.d.ts" */

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assembleTraceFileFromRecorder } from "@noflo/fbp-protocol";

/**
 * Sanitize a name into a filename-safe slug without a dependency.
 *
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Ensure the project's trace directory exists and is a directory.
 *
 * @param {string} baseDir
 * @returns {Promise<string>}
 */
export async function ensureTraceDir(baseDir) {
  const traceDir = path.resolve(baseDir, ".flowtrace");
  try {
    const stats = await stat(traceDir);
    if (!stats.isDirectory()) {
      throw new Error(`${traceDir} is not a directory`);
    }
  } catch (err) {
    if (/** @type {any} */ (err)?.code !== "ENOENT") {
      throw err;
    }
    await mkdir(traceDir, { recursive: true });
  }
  return traceDir;
}

/**
 * Write the recording to a trace file. Returns the path written.
 *
 * @param {string} baseDir Project base directory
 * @param {import("@noflo/noflo").Flowtrace} flowtrace
 * @param {string} graphName Name under which the network was recorded
 * @returns {Promise<string|null>} The path written, or null when the
 *   recording holds no graphs
 */
export async function writeTrace(baseDir, flowtrace, graphName) {
  if (!flowtrace?.mainGraph) {
    return null;
  }
  const state = flowtrace.toJSON();
  const bytes = assembleTraceFileFromRecorder(state);
  const date = new Date().toISOString().slice(0, 10);
  const fileName = slugify(`${date}-noflo-nodejs-${graphName}`);
  const traceDir = await ensureTraceDir(baseDir);
  const tracePath = path.resolve(traceDir, `${fileName}.trace`);
  await writeFile(tracePath, bytes);
  console.log(`Wrote flowtrace to: ${tracePath}`);
  return tracePath;
}
