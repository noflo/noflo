//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     NoFlo may be freely distributed under the MIT license

/**
 * @module dacar
 * @description The host's authorization plane: Dacar, the decentralized
 *   CRDT-based access control the FBP Protocol's capability model rides on
 *   (work document #4). The host does not sync the plane itself — the
 *   `dacar` CLI (shipped by `@reticulum/dacar`, mirrored by the Python
 *   reference implementation) populates a node store via `dacar sync`, and
 *   the host evaluates against that store. Trust anchors, privacy salts,
 *   and grants therefore never appear in the host configuration: the store
 *   *is* the authorization configuration.
 *
 *   Refresh model: the store is read at startup and re-read on demand
 *   (`SIGHUP` in the CLI entry) — run `dacar sync`, then signal the host.
 *   Evaluation is deny-closed at all times: an empty or unreachable store
 *   grants nobody anything.
 */
/* @ts-self-types="./dacar.d.ts" */

import { DacarCapabilityPolicy } from "@noflo/runtime/dacar";
import { Engine } from "@reticulum/dacar";
import { DacarFileAdapter } from "@reticulum/dacar/cli/fileStore";
import { DacarStore } from "@reticulum/dacar/cli/store";

/**
 * Load the Dacar policy from a node store.
 *
 * @param {object} options
 * @param {string} options.storePath The Dacar node store directory — the
 *   same store the `dacar` CLI reads and writes (`DACAR_HOME`, default
 *   `~/.dacar`).
 * @param {string} [options.objectId] The Dacar object the runtime's
 *   commands address; defaults to `noflo.runtime/<name>`.
 * @param {string} [options.allRelation] A relation whose grant on the
 *   object confers the full capability mask.
 * @returns {Promise<{ policy: import("@noflo/runtime/dacar").DacarCapabilityPolicy, refresh: () => Promise<void> }|null>}
 *   The policy with a refresh function, or null when the store does not
 *   exist or is not initialized — the caller then runs fully deny-closed.
 */
export async function loadDacarPolicy({
  storePath,
  objectId = undefined,
  allRelation = undefined,
}) {
  // DacarFileAdapter reads and writes the Python-parity loose-file layout
  // (config INI, state.msgpack, ...) — the same store the dacar CLIs use.
  const store = new DacarStore(new DacarFileAdapter(storePath));
  /** @type {import("@reticulum/dacar").Config} */
  let config;
  try {
    config = await store.loadConfigValidated();
  } catch (err) {
    const code = /** @type {any} */ (err)?.code;
    const message = /** @type {any} */ (err)?.message ?? String(err);
    if (code === "ENOENT" || /not initialized/.test(message)) {
      return null;
    }
    throw err;
  }
  const state = await store.loadState(config);
  const engine = new Engine(config, state);
  const policy = new DacarCapabilityPolicy({
    engine,
    objectId,
    allRelation,
  });
  return {
    policy,
    /**
     * Re-read the grant state from the store after an external
     * `dacar sync`, without restarting the host.
     *
     * @returns {Promise<void>}
     */
    refresh: async () => {
      engine.state = await store.loadState(config);
    },
  };
}
