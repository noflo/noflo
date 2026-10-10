//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     NoFlo may be freely distributed under the MIT license

/**
 * @module noflo-nodejs
 * @description The `noflo-nodejs` CLI: runs a NoFlo program on Node.js as
 *   an observable, mesh-reachable FBP Protocol 2.0 runtime (work document
 *   #31). The legacy flow — starting a WebSocket server and handing an IDE
 *   URL to noflo-ui — is replaced by announcing on the Reticulum mesh under
 *   the `fbp.runtime` aspect, with DACAR capability grants instead of
 *   secrets.
 */
/* @ts-self-types="./noflo-nodejs.d.ts" */

import { toHex } from "@reticulum/core";
import { loadDacarPolicy } from "./dacar.js";
import { createHost } from "./runner.js";
import { load } from "./settings.js";
import { slugify, writeTrace } from "./trace.js";

/**
 * Write the trace when enabled, tolerating flush failures on shutdown.
 *
 * @param {Record<string, any>} options
 * @param {import("@noflo/noflo").Flowtrace|null} flowtrace
 * @param {string} graphName
 * @returns {Promise<void>}
 */
async function flushTrace(options, flowtrace, graphName) {
  if (!flowtrace) {
    return;
  }
  try {
    await writeTrace(options.baseDir, flowtrace, graphName);
  } catch (err) {
    console.error(err);
  }
}

/**
 * Run the CLI.
 *
 * @returns {Promise<void>}
 */
export async function main() {
  const options = await load();
  if (!options.graph) {
    console.error(
      "No graph to run. Pass --graph <file>, or set a project graph.",
    );
    process.exit(1);
  }
  const dacar = await loadDacarPolicy({
    storePath: options.dacarStore,
    objectId:
      options.dacarObject ??
      `noflo.runtime/${slugify(options.name ?? "runtime")}`,
    allRelation: options.dacarAllRelation,
  });
  if (!dacar) {
    console.warn(
      `No Dacar store found at ${options.dacarStore} — every client will be denied. Initialize one with: dacar init`,
    );
  }
  const host = await createHost({
    ...options,
    dacar,
    batch: options.batch,
    onEnd: options.batch
      ? () => {
          process.exit(0);
        }
      : undefined,
  });
  console.log(
    `NoFlo runtime announced on the mesh as "${options.name}" (identity: ${toHex(host.binding?.identity?.identityHash ?? new Uint8Array())})`,
  );

  const shutdown = async (code) => {
    const name = host.network?.graph?.name ?? "main";
    try {
      await host.stop();
    } catch (err) {
      console.error(err);
    }
    await flushTrace(options, host.flowtrace, name);
    process.exit(code);
  };
  process.on("SIGTERM", () => {
    shutdown(0);
  });
  process.on("SIGINT", () => {
    shutdown(0);
  });
  process.on("SIGUSR2", () => {
    const name = host.network?.graph?.name ?? "main";
    flushTrace(options, host.flowtrace, name);
  });
  process.on("SIGHUP", () => {
    // Re-read the Dacar grant store after an external `dacar sync`
    dacar
      ?.refresh()
      .then(() => console.log("Dacar grant state reloaded"))
      .catch((err) => console.error(err));
  });
  if (!options.catchExceptions) {
    process.on("uncaughtException", (err) => {
      console.error(err);
      shutdown(1);
    });
  }
}
