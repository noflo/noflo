//     @noflo/fbp-client - Command-line tool for FBP Protocol 2.0
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @file index module
 * @description The scriptable front for FBP Protocol 2.0 runtimes (work
 *   document #34): thin command functions over `@noflo/runtime-client`
 *   that return plain data — the same functions the `fbp-client` binary
 *   renders. Keeping the CLI a thin layer over this API keeps the client
 *   library honest for noflo-ui and the fbp-spec runner: if a command is
 *   awkward to script here, the library surface needs work before it is
 *   frozen.
 *
 *   Isomorphic: plain ESM, no Node builtins in library code. The binary
 *   (`bin/fbp-client.js`) is a leaf entry that owns the platform wiring
 *   (`@reticulum/node` transports, process I/O).
 */

import { RUN_STATE } from "@noflo/fbp-protocol";
import {
  connectRuntime,
  discoverRuntime,
  RUN_ACTIONS,
} from "@noflo/runtime-client";

export {
  RegistryCache,
  RuntimeClient,
  TelemetryClient,
  UiEventSurface,
} from "@noflo/runtime-client";
export { connectRuntime, discoverRuntime, RUN_ACTIONS };

/** The human names for the `0x48` run-state vocabulary. @type {Record<number, string>} */
export const RUN_STATE_NAMES = {
  [RUN_STATE.STOPPED]: "stopped",
  [RUN_STATE.RUNNING]: "running",
  [RUN_STATE.PAUSED]: "paused",
  [RUN_STATE.FAILED]: "failed",
};

/**
 * A connected client session: the protocol client plus the identity the
 * runtime saw, ready for the command functions.
 *
 * @typedef {Object} Session
 * @property {import("@noflo/runtime-client").RuntimeClient} client
 * @property {{ protocolVersion: number, capabilityMask: number }} auth
 * @property {string} nodeName - The runtime's announced name
 */

/**
 * Discover a runtime by announce and connect a protocol session.
 *
 * @param {Object} options
 * @param {import("@reticulum/core").Reticulum} options.reticulum - The local Reticulum instance
 * @param {import("@reticulum/core").Identity} options.identity - The client identity
 * @param {string} [options.nodeName] - Pin discovery to one runtime name
 * @param {Uint8Array} [options.destinationHash] - Skip discovery, connect straight to this announce hash
 * @param {number} [options.timeoutMs]
 * @returns {Promise<Session>}
 */
export async function connectSession(options) {
  const {
    reticulum,
    identity,
    nodeName = null,
    destinationHash,
    timeoutMs,
  } = options;
  const discovered = destinationHash
    ? { destinationHash, nodeName: nodeName ?? "unknown" }
    : await discoverRuntime({ reticulum, nodeName, timeoutMs });
  const { auth, client } = await connectRuntime({
    reticulum,
    destinationHash: discovered.destinationHash,
    identity,
    timeoutMs,
  });
  return { client, auth, nodeName: discovered.nodeName };
}

/**
 * `status`: ask the runtime for its `0x48` status and return the
 * decoded view.
 *
 * @param {Session} session
 * @returns {Promise<{ epochId: number|string, runState: string, uptimeMs: number, advertisedMask: number, grantedMask: number }>}
 */
export async function status(session) {
  const reply = await session.client.status();
  return {
    epochId: reply.epochId,
    runState: RUN_STATE_NAMES[reply.runState] ?? `unknown(${reply.runState})`,
    uptimeMs: reply.uptimeMs,
    advertisedMask: reply.advertisedMask,
    grantedMask: session.auth.capabilityMask,
  };
}

/**
 * `planes`: the runtime's graph planes.
 *
 * @param {Session} session
 * @returns {Promise<any[]>}
 */
export async function planes(session) {
  const reply = await session.client.planes();
  return reply.entries ?? [];
}

/**
 * `graph`: sync the mirror and return the canonical graph document.
 *
 * @param {Session} session
 * @param {Object} [options]
 * @param {string} [options.format] - `json` (default; `fbp` and `dot` land with phase 5)
 * @returns {Promise<any>} The serialized graph document
 */
export async function graph(session, options = {}) {
  const { format = "json" } = options;
  if (format !== "json") {
    throw new Error(
      `unsupported graph format '${format}' (fbp and dot land with wd #34 phase 5)`,
    );
  }
  const sync = await session.client.syncGraph();
  return sync.graph.serialize();
}
