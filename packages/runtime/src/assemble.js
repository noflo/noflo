/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module assemble
 * @description The one-call assembly of the FBP runtime stack (work document
 *   #28): a {@link RuntimeServer} with every protocol handler registered —
 *   registry, graph synchronization, telemetry, execution control — plus the
 *   optional Reticulum binding that puts it on the mesh.
 *
 *   The application supplies the engine-side pieces: the live graph, the
 *   component catalog (signatures, plus optional source-write and install
 *   hooks — the same philosophy as the engine's application-supplied
 *   registry, work documents #6/#16), and an optional component loader for
 *   the network host. Isomorphic throughout.
 */

import { ExecutionProtocol } from "./execution-protocol.js";
import { GraphProtocol } from "./graph-protocol.js";
import { NetworkHost } from "./network-host.js";
import { RegistryProtocol } from "./registry-protocol.js";
import { DEFAULT_ASPECT, ReticulumBinding } from "./reticulum-binding.js";
import { RuntimeServer } from "./runtime-server.js";
import { TelemetryProtocol } from "./telemetry-protocol.js";

/**
 * @typedef {object} AssembledRuntime
 * @property {RuntimeServer} server
 * @property {NetworkHost} host
 * @property {RegistryProtocol} registry
 * @property {GraphProtocol} graph
 * @property {TelemetryProtocol} telemetry
 * @property {ExecutionProtocol} execution
 */

/**
 * Wire the full protocol stack. The returned parts are plain objects —
 * applications can hold on to any of them (e.g. `host` to restart the
 * network, `telemetry` to flush) — and every handler is already registered
 * on the server.
 *
 * @param {object} options
 * @param {import("@noflo/graph").GraphModel} options.graph The live graph.
 * @param {import("./registry-protocol.js").RuntimeCatalog} options.catalog
 *   The component catalog: signatures, plus optional `writeSource` and
 *   `install` hooks.
 * @param {import("@noflo/noflo").ComponentLoader} [options.componentLoader]
 *   Loader for the network host.
 * @param {string[]|number} [options.capabilities] Capability mask the
 *   runtime advertises; defaults to the read surface.
 * @param {string} [options.clientId] Client id the runtime stamps on its
 *   own CRDT operations; defaults to `runtime`.
 * @param {boolean} [options.asyncDelivery]
 * @param {boolean} [options.autostart] Build and start the network as part
 *   of assembly — the typical case of a running program that is observable
 *   and modifiable at runtime. Off by default: a runtime that only ever
 *   starts on a client's `0x40 RUN_CTRL START` is also valid. A rejected
 *   start fails the assembly: the program did not come up.
 * @param {(bytes: Uint8Array, context: any) => void} [options.send] Deliver
 *   a frame to one client context; defaults to a no-op until a transport
 *   provides one.
 * @param {(bytes: Uint8Array, exceptContext?: any) => void} [options.broadcast]
 *   Deliver a frame to every authorized client context.
 * @returns {Promise<AssembledRuntime>}
 */
export async function assembleRuntime(options) {
  const server = new RuntimeServer({
    send: options.send,
    broadcast: options.broadcast,
    capabilities: options.capabilities,
  });
  const host = new NetworkHost({
    graph: options.graph,
    componentLoader: options.componentLoader,
    asyncDelivery: options.asyncDelivery,
  });
  const registry = new RegistryProtocol({ catalog: options.catalog });
  const graph = new GraphProtocol({
    graph: options.graph,
    clientId: options.clientId,
  });
  const telemetry = new TelemetryProtocol({ host });
  const execution = new ExecutionProtocol({ host, telemetry });
  registry.register(server);
  graph.register(server);
  telemetry.register(server);
  execution.register(server);
  // The registry state must be derived before the first registry sync.
  await registry.refresh();
  if (options.autostart) {
    // The typical use: the program is already running, observable and
    // modifiable at runtime. Lifecycle control stays available to clients
    // (0x40 RUN_CTRL stop/start restarts it).
    await host.start();
  }
  return { server, host, registry, graph, telemetry, execution };
}

/**
 * Bind an assembled runtime to the mesh: destination, announce app_data,
 * link lifecycle, and baseline resource serving. The binding's resource
 * server backs the graph protocol's `0x12` stale-epoch replies.
 *
 * @param {object} options
 * @param {AssembledRuntime} options.runtime An {@link assembleRuntime} result.
 * @param {import("@reticulum/core").Reticulum} options.reticulum The
 *   application's RNS instance.
 * @param {import("@reticulum/core").Identity} options.identity The runtime's
 *   long-term identity.
 * @param {string} options.nodeName
 * @param {string} [options.aspect] Destination aspect; defaults to
 *   {@link DEFAULT_ASPECT}.
 * @param {number} [options.announceIntervalMs]
 * @param {boolean} [options.authorizeUnidentified] Grant the permissions
 *   store's default mask to peers that never identify; off by default
 *   (unidentified links are denied everything).
 * @param {number} [options.maxResources] Budget for concurrently served
 *   baseline resources; defaults to 16.
 * @returns {Promise<ReticulumBinding>}
 */
export async function bindReticulum(options) {
  const { runtime } = options;
  const binding = new ReticulumBinding({
    server: runtime.server,
    reticulum: options.reticulum,
    identity: options.identity,
    nodeName: options.nodeName,
    aspect: options.aspect,
    announceIntervalMs: options.announceIntervalMs,
    authorizeUnidentified: options.authorizeUnidentified,
    maxResources: options.maxResources,
  });
  // Baseline snapshots for stale clients travel over the link
  // REQUEST/RESPONSE API, served by the binding.
  runtime.graph.resourceProvider = async (bytes) =>
    binding.serveResource(bytes);
  await binding.start();
  binding.addEventListener("linkclosed", (/** @type {any} */ event) => {
    runtime.telemetry.dropContext(event.detail.link);
  });
  return binding;
}
