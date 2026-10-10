//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     NoFlo may be freely distributed under the MIT license

/**
 * @module library
 * @description The programmatic entry: run a NoFlo program on Node.js with
 *   an attached FBP Protocol 2.0 runtime, from inside an application —
 *   the modernization of legacy `library.js`. The application supplies its
 *   own graph (model or path) and optional pre-start hook, e.g. for
 *   registering additional components before discovery.
 */
/* @ts-self-types="./library.d.ts" */

import { createHost } from "./runner.js";
import { loadForLibrary } from "./settings.js";

/**
 * Run a main graph with the runtime attached.
 *
 * @param {import("@noflo/graph").GraphModel|string} mainGraph Graph model or
 *   path to the graph file to run
 * @param {object} [options] Settings overrides, as taken by
 *   `loadForLibrary`
 * @param {(host: import("./runner.js").HostHandle, config: Record<string, any>) => Promise<void>} [preStart]
 *   Hook run after the host is created but before the mesh binding, e.g.
 *   to register components
 * @returns {Promise<import("./runner.js").HostHandle>} The running host;
 *   stop it with `handle.stop()`
 */
export async function run(mainGraph, options = {}, preStart = undefined) {
  const config = await loadForLibrary({
    ...options,
    graph: mainGraph,
  });
  const host = await createHost(config);
  if (preStart) {
    await preStart(host, config);
  }
  return host;
}
