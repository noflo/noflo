//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     NoFlo may be freely distributed under the MIT license

/**
 * @module runner
 * @description The host core (work document #31): loads the project's
 *   graph, builds the component catalog, assembles the FBP Protocol 2.0
 *   runtime stack, starts the network, and — when a mesh uplink is
 *   configured — binds it to the Reticulum network with the host's
 *   long-term identity.
 *
 *   The 1.x host *was* the runtime: it served the fbp-protocol wire itself
 *   over WebSockets or WebRTC. In 2.x the runtime lives in `@noflo/runtime`;
 *   the host is the Node.js application around it — configuration, loading,
 *   lifecycle, and the local conveniences (debug output, trace files).
 */
/* @ts-self-types="./runner.d.ts" */

import { GraphModel } from "@noflo/graph";
import { createNodeModulesRegistry, loadGraphFile } from "@noflo/loader-node";
import { ComponentLoader, Flowtrace } from "@noflo/noflo";
import { assembleRuntime, bindReticulum } from "@noflo/runtime";
import { Reticulum } from "@reticulum/core";
import {
  AutoInterface,
  FileStorageAdapter,
  LocalClientInterface,
  TCPClientInterface,
} from "@reticulum/node";
import { catalogFromLoader } from "./catalog.js";
import { addDebug } from "./debug.js";
import { loadOrCreateIdentity } from "./identity.js";
import { writeTrace } from "./trace.js";

/**
 * @typedef {object} HostHandle
 * @property {import("@noflo/runtime/assemble").AssembledRuntime} runtime
 * @property {import("@noflo/runtime").ReticulumBinding|null} binding The
 *   mesh binding, null when the graph ended before the mesh attach
 *   completed.
 * @property {import("@reticulum/core").Reticulum|null} reticulum
 * @property {import("@noflo/noflo").Flowtrace|null} flowtrace
 * @property {import("@noflo/noflo").Network} network
 * @property {() => Promise<void>} stop Stop the network and detach from the
 *   mesh.
 */

/**
 * Create the host's Reticulum instance and attach its interfaces, using the
 * ecosystem connection chain: prefer the local shared Reticulum instance (a
 * running rnsd — it already owns the mesh interfaces, so we attach over the
 * shared-instance socket instead of opening our own), fall back to
 * AutoInterface, with an optional explicit rnsd uplink alongside it when
 * configured.
 *
 * @param {object} options
 * @param {string} [options.rnsHost] rnsd uplink hostname (used when no
 *   shared instance is available)
 * @param {number} [options.rnsPort] rnsd uplink port
 * @param {string} options.storage Reticulum transport storage directory
 * @returns {Promise<Reticulum>}
 */
async function createReticulum(options) {
  const rns = new Reticulum({
    logLevel: "warning",
    storageAdapter: new FileStorageAdapter(options.storage),
  });
  const shared = await LocalClientInterface.connectToSharedInstance();
  if (shared) {
    rns.addInterface(shared, true);
  } else {
    try {
      const auto = new AutoInterface({ name: "noflo-nodejs" });
      await auto.connect();
      rns.addInterface(auto, true);
    } catch (err) {
      // A host without a usable LAN (CI containers, offline machines) still
      // runs: without interfaces it executes the program and stays locally
      // observable, it just announces to nobody.
      console.log(
        `No Reticulum interface available (${/** @type {any} */ (err)?.message ?? err}); running without mesh attachment`,
      );
    }
    if (options.rnsHost && options.rnsPort) {
      const tcp = new TCPClientInterface({
        name: "rnsd",
        host: options.rnsHost,
        port: options.rnsPort,
      });
      await tcp.connect();
      rns.addInterface(tcp, true);
    }
  }
  // Wait for persistor hydration and background services before touching
  // storage or the transport.
  await rns.ready();
  return rns;
}

/**
 * Build and start a NoFlo host from settings.
 *
 * @param {object} options Loaded settings
 * @param {import("@noflo/graph").GraphModel|string} [options.graph] Graph
 *   model or path to a graph file to run
 * @param {string} [options.baseDir] Project base directory for component
 *   loading
 * @param {boolean} [options.cache] Read the component catalog from the
 *   manifest cache
 * @param {boolean} [options.trace] Record a flowtrace of the execution
 * @param {{ default?: string[], identities?: Record<string, string[]> }} [options.permissions]
 *   DACAR capability grants
 * @param {string} [options.rnsHost] rnsd uplink hostname
 * @param {number} [options.rnsPort] rnsd uplink port
 * @param {string} [options.storage] Reticulum transport storage directory
 * @param {string} [options.name] Node name announced on the mesh
 * @param {boolean} [options.debug] Log packet events to stdout
 * @param {boolean} [options.verbose] Log packet contents to stdout
 * @param {boolean} [options.batch] Own the full shutdown on network end:
 *   stop the host, flush the trace, and call `onEnd` for the exit
 * @param {{ policy: import("@noflo/runtime/dacar").DacarCapabilityPolicy, refresh: () => Promise<void> }} [options.dacar]
 *   The loaded Dacar authorization plane; when absent every client is
 *   denied
 * @param {() => void} [options.onEnd] Called when the network ends — the
 *   batch-mode exit hook. Registered before the network starts, so an
 *   immediately-finishing graph cannot race the listener.
 * @returns {Promise<HostHandle>}
 */
export async function createHost(options = {}) {
  const fromFile = !(options.graph instanceof GraphModel);
  const graph = fromFile
    ? await loadGraphFile(/** @type {string} */ (options.graph))
    : /** @type {GraphModel} */ (options.graph);
  if (fromFile && !graph.name) {
    // Name the graph after its file, like the 1.x runtime did — the name
    // keys the trace recording and the runtime's graph registration.
    const { basename, extname } = await import("node:path");
    graph.name = basename(
      /** @type {string} */ (options.graph),
      extname(/** @type {string} */ (options.graph)),
    );
  }

  const registry = await createNodeModulesRegistry(options.baseDir, {
    cache: options.cache,
  });
  const loader = new ComponentLoader({ registry });

  const runtime = await assembleRuntime({
    graph,
    catalog: await catalogFromLoader(loader),
    componentLoader: loader,
    autostart: false,
    ...(options.dacar?.policy
      ? {
          capabilityPolicy: (identityHash, context) =>
            options.dacar.policy.resolve(identityHash, context),
        }
      : {}),
    ...(options.trace
      ? {
          flowtrace: new Flowtrace({
            runtimeMetadata: {
              type: "noflo-nodejs",
              name: options.name ?? null,
            },
          }),
        }
      : {}),
  });

  const flowtrace = /** @type {import("@noflo/noflo").Flowtrace|null} */ (
    runtime.host.flowtrace ?? null
  );

  // Event listeners attach before the network starts: a graph that finishes
  // immediately would otherwise end before the application observes it.
  if (options.debug || options.verbose) {
    addDebug(runtime.host, { verbose: options.verbose });
  }

  let binding = null;
  let reticulum = null;
  let ended = false;
  /**
   * Stop the network and detach from the mesh.
   *
   * @returns {Promise<void>}
   */
  const stop = async () => {
    await runtime.host.stop();
    if (binding) {
      binding.stop();
    }
    if (reticulum) {
      await reticulum.stop();
    }
  };

  if (options.batch) {
    // Batch mode owns its shutdown: stop the host and flush the trace
    // before handing control back to the application for the exit.
    const name = graph.name || "main";
    runtime.host.addEventListener("end", () => {
      ended = true;
      const finish = async () => {
        await stop();
        if (flowtrace) {
          await writeTrace(options.baseDir, flowtrace, name);
        }
      };
      finish().then(
        () => options.onEnd?.(),
        (/** @type {any} */ err) => {
          console.error(err);
          options.onEnd?.();
        },
      );
    });
  } else if (options.onEnd) {
    runtime.host.addEventListener("end", () => {
      options.onEnd();
    });
  }

  await runtime.host.start();

  if (ended) {
    // The graph finished while the mesh was being attached: the batch
    // handler already stopped and flushed everything.
    return {
      runtime,
      binding: null,
      reticulum: null,
      flowtrace,
      network: runtime.host.network,
      stop,
    };
  }

  reticulum = await createReticulum({
    rnsHost: options.rnsHost,
    rnsPort: options.rnsPort,
    storage: /** @type {string} */ (options.storage),
  });
  const identity = await loadOrCreateIdentity(reticulum);
  binding = await bindReticulum({
    runtime,
    reticulum,
    identity,
    nodeName: options.name ?? "noflo-nodejs",
  });

  return {
    runtime,
    binding,
    reticulum,
    flowtrace,
    network: runtime.host.network,
    stop,
  };
}
