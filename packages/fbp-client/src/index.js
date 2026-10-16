/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module @noflo/fbp-client
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

/* @ts-self-types="./index.d.ts" */

import { toFBP } from "@noflo/fbp";
import { checkGuard, RUN_STATE } from "@noflo/fbp-protocol";
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
 * @property {string|null} clientId - This client's CRDT identity, stamped on `0x14` ops
 */

/**
 * Discover a runtime by announce and connect a protocol session.
 *
 * @param {Object} options
 * @param {import("@reticulum/core").Reticulum} options.reticulum - The local Reticulum instance
 * @param {import("@reticulum/core").Identity} options.identity - The client identity
 * @param {string} [options.nodeName] - Pin discovery to one runtime name
 * @param {Uint8Array} [options.destinationHash] - Skip discovery, connect straight to this announce hash
 * @param {string} [options.clientId] - This client's CRDT identity for `0x14` ops (required for modification)
 * @param {number} [options.timeoutMs]
 * @returns {Promise<Session>}
 */
export async function connectSession(options) {
  const {
    reticulum,
    identity,
    nodeName = null,
    destinationHash,
    clientId = null,
    timeoutMs,
  } = options;
  const discovered = destinationHash
    ? { destinationHash, nodeName: nodeName ?? "unknown" }
    : await discoverRuntime({ reticulum, nodeName, timeoutMs });
  let session;
  try {
    session = await connectRuntime({
      reticulum,
      destinationHash: discovered.destinationHash,
      identity,
      timeoutMs,
    });
  } catch (error) {
    if (destinationHash) {
      throw error;
    }
    // The cached path turned out stale (the destination cache outlives
    // runtime restarts): solicit a fresh announce and retry once
    const fresh = await discoverRuntime({
      reticulum,
      nodeName,
      timeoutMs,
      solicit: true,
    });
    session = await connectRuntime({
      reticulum,
      destinationHash: fresh.destinationHash,
      identity,
      timeoutMs,
    });
    return finalize(session, fresh, clientId, reticulum);
  }
  return finalize(session, discovered, clientId, reticulum);
}

/**
 * Stamp the CRDT identity onto the connected client, mark the runtime
 * destination contacted (so the transport persists it and future runs
 * connect from the cache without waiting for an announce echo), and
 * assemble the session.
 *
 * @param {{ client: import("@noflo/runtime-client").RuntimeClient, auth: any }} session
 * @param {{ nodeName: string, destinationHash?: Uint8Array }} discovered
 * @param {string|null} clientId
 * @param {import("@reticulum/core").Reticulum} reticulum
 * @returns {Session}
 */
function finalize(session, discovered, clientId, reticulum) {
  if (clientId) {
    session.client.clientId = clientId;
  }
  /** @type {any} */ (reticulum.transport)?.persistor?.markContacted?.(
    discovered.destinationHash,
  );
  return {
    client: session.client,
    auth: session.auth,
    nodeName: discovered.nodeName,
    clientId,
  };
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
 * `graph`: sync the mirror and return the rendered graph document.
 *
 * @param {Session} session
 * @param {Object} [options]
 * @param {string} [options.format] - `json` (canonical document, default) or `fbp` (DSL source); `dot` lands with a later phase
 * @returns {Promise<string|any>} The serialized document, or the DSL source for the `fbp` format
 */
export async function graph(session, options = {}) {
  const { format = "json" } = options;
  if (format !== "json" && format !== "fbp") {
    throw new Error(
      `unsupported graph format '${format}' (dot lands with a later wd #34 phase)`,
    );
  }
  const sync = await session.client.syncGraph();
  const canonical = sync.graph.serialize();
  return format === "fbp" ? toFBP(canonical) : canonical;
}

/**
 * `components`: the Two-Step Cache catalog after a full sync — manifest
 * plus cached signatures for every entry.
 *
 * @param {Session} session
 * @returns {Promise<import("@noflo/runtime-client").RegistryCatalog>}
 */
export function components(session) {
  return session.client.syncComponents();
}

/**
 * `schemas`: the schema bodies the synced catalog references, fetched over
 * `0x28`/`0x29` and digest-verified (work document #37 phase 2). A runtime
 * without a schema table answers all-nil and the map stays empty — the
 * degradation ladder, not an error. Each entry carries the id, when the
 * catalog's references name one, and the verified body.
 *
 * @param {Session} session
 * @returns {Promise<Record<string, { id?: string, body: Record<string, any> }>>}
 */
export async function schemas(session) {
  const catalog = await session.client.syncComponents();
  await session.client.syncSchemaBodies(catalog);
  /** @type {Map<string, string>} */
  const ids = new Map();
  for (const entry of Object.values(catalog)) {
    const signature = /** @type {any} */ (entry).signature;
    if (!signature) continue;
    for (const side of ["in", "out"]) {
      for (const port of signature[side] ?? []) {
        if (port.schema?.id && port.schema?.digest) {
          ids.set(port.schema.digest, port.schema.id);
        }
      }
    }
    if (signature.metadata?.id && signature.metadata?.digest) {
      ids.set(signature.metadata.digest, signature.metadata.id);
    }
  }
  /** @type {Record<string, { id?: string, body: Record<string, any> }>} */
  const out = {};
  for (const [digest, body] of session.client.schemas.bodies()) {
    out[digest] = { body };
    const id = ids.get(digest);
    if (id) out[digest].id = id;
  }
  return out;
}

/**
 * The guard advisory for a value entering an inport (work document #37
 * §3.1): the signature's in-band guard, comparison-only, advisory-only —
 * the CLI tells the author before the value ships, and the runtime records
 * violations diagnostic-only either way. Resolves the node's component
 * through the graph mirror (syncing it when the session has not yet) and
 * the port's guard through the Two-Step catalog.
 *
 * @param {Session} session
 * @param {Object} spec
 * @param {string} [spec.node] The target node (for a direct inport).
 * @param {string} [spec.exportName] The exported inport name (for `0x47`).
 * @param {string} [spec.port] The inport name; defaults to the export's internal port.
 * @param {any} spec.value The value about to be sent.
 * @returns {Promise<string|null>} The advisory message, or null when no guard applies.
 */
export async function guardAdvisory(
  session,
  { node, exportName, port, value },
) {
  const client = session.client;
  if (Object.keys(client.registry.catalog()).length === 0) {
    await client.syncComponents();
  }
  let graph = client.graph;
  if (!graph) {
    graph = (await client.syncGraph()).graph;
  }
  let componentName = null;
  let portName = port ?? null;
  if (exportName !== undefined) {
    const exp = graph
      .exports()
      .find((e) => e.direction === "inport" && e.public === exportName);
    if (!exp) {
      return null;
    }
    componentName = graph.node(exp.internal.node)?.component ?? null;
    portName = portName ?? exp.internal.port;
  } else if (node !== undefined) {
    componentName = graph.node(node)?.component ?? null;
  }
  if (!componentName || !portName) {
    return null;
  }
  const signature = /** @type {any} */ (
    client.registry.catalog()[componentName]
  )?.signature;
  const guard = signature?.in?.find((p) => p.id === portName)?.guard;
  if (!guard) {
    return null;
  }
  if (checkGuard(guard, value)) {
    return null;
  }
  return `value for ${componentName}.${portName} fails the port's in-band guard ${JSON.stringify(guard)} — sending anyway; the runtime records this diagnostic-only`;
}

/**
 * `component <name>`: one catalog entry with its cached signature.
 *
 * @param {Session} session
 * @param {string} name - Library-namespaced component name
 * @returns {Promise<import("@noflo/runtime-client").CachedComponent>}
 */
export async function component(session, name) {
  const catalog = await session.client.syncComponents();
  const entry = catalog[name];
  if (!entry) {
    throw new Error(`component "${name}" is not in the runtime's registry`);
  }
  return entry;
}

/**
 * `source get <name>`: the component's source from the runtime (nil
 * when the runtime holds none).
 *
 * @param {Session} session
 * @param {string} name - Library-namespaced component name
 * @returns {Promise<string|null>}
 */
export async function getSource(session, name) {
  const reply = await session.client.getSource(name);
  return reply.source;
}

/**
 * `source set <name> <file>`: write the component's full source to the
 * runtime. The registry hash changes; the next Two-Step sync picks up
 * the new signature.
 *
 * @param {Session} session
 * @param {string} name - Library-namespaced component name
 * @param {string} source - Full source string or RNS resource hash
 * @returns {Promise<void>}
 */
export function setSource(session, name, source) {
  return session.client.setSource(name, source);
}

/**
 * `run`/`pause`/`step`/`stop`: run control over the network (`0x40`).
 *
 * @param {Session} session
 * @param {"start"|"pause"|"resume"|"step"|"stop"} action
 * @param {number|string|null} [planeId] - nil addresses the main plane
 * @returns {Promise<void>}
 */
export function runControl(session, action, planeId = null) {
  return session.client.execution.runControl(action.toUpperCase(), planeId);
}

/**
 * `send`: inject one packet into a running network's inport (`0x47`) —
 * the remote counterpart of feeding IIPs.
 *
 * @param {Session} session
 * @param {Object} packet
 * @param {number|string|null} [packet.planeId] - nil = main plane
 * @param {string} packet.port - Inport name
 * @param {any} packet.payload
 * @returns {Promise<void>}
 */
export function sendPacket(session, packet) {
  return session.client.execution.injectPacket(packet);
}

/**
 * `breakpoint set`: pause the network when a packet arrives at the
 * node's triggering inport (`0x41`).
 *
 * @param {Session} session
 * @param {Object} bp
 * @param {string} bp.breakpointId
 * @param {string} bp.nodeId
 * @param {string|null} [bp.port] - nil matches any port
 * @returns {Promise<void>}
 */
export function setBreakpoint(session, bp) {
  return session.client.execution.setBreakpoint(bp);
}

/**
 * `breakpoint clear`: clear one breakpoint, or all when no id is given
 * (`0x42`).
 *
 * @param {Session} session
 * @param {string|null} [breakpointId] - nil clears every breakpoint
 * @returns {Promise<void>}
 */
export function clearBreakpoints(session, breakpointId = null) {
  return session.client.execution.clearBreakpoints(breakpointId);
}

/**
 * `processes`: request the live process listing (`0x44`) and await the
 * runtime's `0x45` reply.
 *
 * @param {Session} session
 * @param {Object} [options]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<Object<string, any>>} Node id to process entry
 */
export function processes(session, options = {}) {
  const { timeoutMs = 15_000 } = options;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.client.removeEventListener("processlist", listener);
      reject(new Error("timed out waiting for the process listing"));
    }, timeoutMs);
    /** @type {(event: any) => void} */
    const listener = (event) => {
      clearTimeout(timer);
      session.client.removeEventListener("processlist", listener);
      resolve(event.detail.entries ?? {});
    };
    session.client.addEventListener("processlist", listener);
    session.client.execution.requestProcesses();
  });
}

/**
 * `enable`/`disable`: per-process execution control (`0x43`) — a
 * disabled node stops activating; queued packets are kept.
 *
 * @param {Session} session
 * @param {string} nodeId
 * @param {"enable"|"disable"} action
 * @returns {Promise<void>}
 */
export function setProcessState(session, nodeId, action) {
  return session.client.execution.processControl(nodeId, action.toUpperCase());
}

/**
 * `hwm`: set the default edge capacity (high-water mark) for the
 * runtime (`0x46`) — the global default in the backpressure hierarchy.
 *
 * @param {Session} session
 * @param {number|null} highWaterMark - `0` synchronous, `n` up to `n` admitted in-flight packets, nil unbounded
 * @returns {Promise<void>}
 */
export function setHwm(session, highWaterMark) {
  return session.client.execution.setHwm(highWaterMark);
}

export {
  addEdge,
  addExport,
  addGroup,
  addIip,
  addNode,
  applyGraphOp,
  describeRejection,
  OpRejectedError,
  REASON_NAMES,
  removeEntity,
  setMetadata,
} from "./modify.js";
export { capture, replayTraceFile, watch } from "./trace.js";
