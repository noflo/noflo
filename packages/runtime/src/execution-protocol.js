/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module execution-protocol
 * @description Execution control and debugging (work document #28 phase 5,
 *   wire per work document #4 §8): the `0x40` block server side.
 *
 *   Implemented for real against today's engine: `START`/`STOP` drive the
 *   network lifecycle through the host, and `HWM_SET` records the
 *   network-global backpressure default applied at the next network build.
 *
 *   Honest about what the engine cannot do (work document #4 update #9,
 *   work document #28): pause/resume/step, data breakpoints, and
 *   per-process disable have no engine primitive — `stop()` tears down
 *   sockets and loses queued packets, violating pause semantics. Those
 *   commands surface as `unsupported` events for the operator and as `0x04
 *   ERROR` flowtrace events for subscribed clients, instead of being
 *   silently ignored or falsely acknowledged. There are no ack frames;
 *   subscribed clients see the state of the world through the telemetry
 *   stream.
 */
/* @ts-self-types="./execution-protocol.d.ts" */

import {
  CMD_BREAKPOINT_CLEAR,
  CMD_BREAKPOINT_SET,
  CMD_GET_STATUS,
  CMD_HWM_SET,
  CMD_PACKET_SEND,
  CMD_PROCESS_CTRL,
  CMD_PROCESS_LIST_REQ,
  CMD_RUN_CTRL,
  CMD_STREAM_EOT,
  CMD_STREAM_OPEN,
  COMPONENT_TYPE,
  EVENT_TYPE,
  EXECUTION_STATE,
  encodeGetStatusRes,
  encodeOpRejected,
  encodeProcessList,
  LIFECYCLE_CODE,
  REASON,
  RUN_ACTION,
  RUN_STATE,
} from "@noflo/fbp-protocol";
import { IP } from "@noflo/noflo";
import { checkPacketGuard } from "./guards.js";

/**
 * @typedef {object} EngineGap
 * @property {string} action Human-readable name of the unsupported action.
 * @property {string} reason Why the running engine cannot honor it.
 */

/**
 * The `0x40`–`0x46` protocol handler, bound to a
 * {@link import("./runtime-server.js").RuntimeServer} via
 * {@link ExecutionProtocol#register}.
 */
export class ExecutionProtocol {
  static #packetSeq = 0;
  /**
   * @param {object} options
   * @param {import("./network-host.js").NetworkHost} options.host
   * @param {import("./telemetry-protocol.js").TelemetryProtocol} options.telemetry
   * @param {import("./graph-protocol.js").GraphProtocol} [options.graphProtocol] The
   *   graph protocol, for access to the plane registry (multi-plane support).
   *   Control failures and lifecycle outcomes reach subscribed clients as
   *   flowtrace events through it.
   */
  /** @type {Map<string|number, import("./network-host.js").NetworkHost>} */
  #planeHosts = new Map();

  /**
   * Client-driven streams: one driver socket per plane-and-port, keyed as
   * `${planeId ?? "main"}::${port}`. The value is the `addDriver` promise;
   * senders await it so a stream opened and immediately used does not
   * race the socket attach.
   *
   * @type {Map<string, Promise<import("@noflo/noflo").internalSocket.InternalSocket>>}
   */
  #drivers = new Map();

  constructor(options) {
    this.host = options.host;
    this.telemetry = options.telemetry;
    /** The graph protocol, for access to the plane registry. */
    this.graphProtocol = options.graphProtocol ?? null;
    /**
     * Tier A guard diagnostics (work document #37 §6): the signature
     * resolver for comparison-only packet checks at `0x47`; null when the
     * runtime has no catalog hook.
     *
     * @type {import("./guards.js").SignatureResolver|null}
     */
    this.signatureResolver = options.signatureResolver ?? null;
    /**
     * Host-side sink for guard violations; diagnostic-only, the packet is
     * delivered regardless.
     *
     * @type {((detail: { opType: number, entityId: string|null, detail: string }) => void)|null}
     */
    this.onGuardViolation = options.onGuardViolation ?? null;
    /**
     * The declared component kinds (work document #4 update #11): a
     * snapshot getter over the registry's details, so the process listing
     * reports declared data, never inferred kinds. Null when the runtime
     * has no catalog.
     *
     * @type {(() => Record<string, import("@noflo/fbp-protocol").ComponentDetail>) | null}
     */
    this.componentDetails = options.componentDetails ?? null;
  }
  /**
   * Register the `0x40`–`0x46` handlers on a runtime server. Requires the
   * server to advertise `LIFECYCLE_CTRL`; enforcement happens in the server
   * core.
   *
   * @param {import("./runtime-server.js").RuntimeServer} server
   * @returns {void}
   */
  register(server) {
    this.server = server;
    server.registerHandler(CMD_RUN_CTRL, async (decoded) => {
      switch (decoded.action) {
        case RUN_ACTION.START:
          if (decoded.planeId !== null && decoded.planeId !== undefined) {
            await this.#startPlane(decoded.planeId);
          } else {
            await this.#start();
          }
          break;
        case RUN_ACTION.STOP:
          if (decoded.planeId !== null && decoded.planeId !== undefined) {
            const ph = this.#planeHosts.get(decoded.planeId);
            if (ph) await ph.stop();
          } else {
            await this.host.stop();
          }
          break;
        case RUN_ACTION.PAUSE:
          this.#engineGap("pause", decoded);
          break;
        case RUN_ACTION.RESUME:
          this.#engineGap("resume", decoded);
          break;
        case RUN_ACTION.STEP:
          this.#engineGap("step", decoded);
          break;
        default:
          break;
      }
    });
    server.registerHandler(CMD_BREAKPOINT_SET, (decoded, context) => {
      this.#engineGap("breakpoint", decoded, context);
    });
    server.registerHandler(CMD_BREAKPOINT_CLEAR, (decoded, context) => {
      this.#engineGap("breakpoint clearing", decoded, context);
    });
    server.registerHandler(CMD_PROCESS_CTRL, (decoded, context) => {
      this.#engineGap("per-process disable", decoded, context);
    });
    server.registerHandler(CMD_PACKET_SEND, (decoded, context) => {
      this.#withStreamTarget(
        server,
        context,
        CMD_PACKET_SEND,
        decoded.planeId,
        decoded.port,
        (network, target, planeId) => {
          // Tier A guard diagnostics: comparison-only, diagnostic-only —
          // the packet is delivered regardless (work document #37 §6)
          const guardVerdict = checkPacketGuard({
            resolveSignature: this.signatureResolver,
            component: this.#targetComponent(decoded.planeId, target),
            port: target.port,
            isInport: true,
            value: decoded.payload,
          });
          if (guardVerdict.checked && !guardVerdict.ok) {
            this.onGuardViolation?.({
              opType: CMD_PACKET_SEND,
              entityId: null,
              detail: guardVerdict.detail ?? "value fails the port's guard",
            });
          }
          const driver = this.#drivers.get(
            this.#driverKey(planeId, decoded.port),
          );
          if (driver) {
            // A client-driven stream is open on this port: the packet
            // flows through the driver socket — the port stays connected,
            // back pressure respected, until the client sends EOT
            driver
              .then((socket) => socket.post(new IP("data", decoded.payload)))
              .catch((/** @type {any} */ err) => {
                server.send(
                  encodeOpRejected({
                    rejectedCmd: CMD_PACKET_SEND,
                    planeId: planeId ?? null,
                    detail: {
                      reason: REASON.INVALID_STATE,
                      message: err?.message ?? "stream send failed",
                    },
                  }),
                  context,
                );
              });
            return;
          }
          network
            .addInitial({
              entity_id: `packet-send-${++ExecutionProtocol.#packetSeq}`,
              from: { data: decoded.payload },
              to: { node: target.node, port: target.port },
            })
            .catch((/** @type {any} */ err) => {
              server.send(
                encodeOpRejected({
                  rejectedCmd: CMD_PACKET_SEND,
                  planeId: planeId ?? null,
                  detail: {
                    reason: REASON.INVALID_STATE,
                    message: err?.message ?? "injection failed",
                  },
                }),
                context,
              );
            });
        },
      );
    });
    server.registerHandler(CMD_STREAM_OPEN, (decoded, context) => {
      this.#withStreamTarget(
        server,
        context,
        CMD_STREAM_OPEN,
        decoded.planeId,
        decoded.port,
        (network, target, planeId) => {
          const key = this.#driverKey(planeId, decoded.port);
          if (this.#drivers.has(key)) {
            server.send(
              encodeOpRejected({
                rejectedCmd: CMD_STREAM_OPEN,
                planeId: planeId ?? null,
                detail: {
                  reason: REASON.INVALID_STATE,
                  message: "a client stream is already open on that port",
                },
              }),
              context,
            );
            return;
          }
          const attached = network
            .addDriver({ node: target.node, port: target.port })
            .then((socket) => {
              // The stream opens at attach: the boundary socket connects,
              // the port leaves the fresh state, and the network's end
              // predicate sees an open external sender
              socket.connect();
              return socket;
            })
            .catch((/** @type {any} */ err) => {
              this.#drivers.delete(key);
              server.send(
                encodeOpRejected({
                  rejectedCmd: CMD_STREAM_OPEN,
                  planeId: planeId ?? null,
                  detail: {
                    reason: REASON.INVALID_STATE,
                    message: err?.message ?? "stream open failed",
                  },
                }),
                context,
              );
              return null;
            });
          this.#drivers.set(key, attached);
        },
      );
    });
    server.registerHandler(CMD_STREAM_EOT, (decoded, context) => {
      this.#withStreamTarget(
        server,
        context,
        CMD_STREAM_EOT,
        decoded.planeId,
        decoded.port,
        (_network, _target, planeId) => {
          const key = this.#driverKey(planeId, decoded.port);
          const driver = this.#drivers.get(key);
          if (!driver) {
            server.send(
              encodeOpRejected({
                rejectedCmd: CMD_STREAM_EOT,
                planeId: planeId ?? null,
                detail: {
                  reason: REASON.INVALID_STATE,
                  message: "no open client stream on that port",
                },
              }),
              context,
            );
            return;
          }
          // Delete the registration first: a send racing the EOT falls
          // back to the IIP path rather than resurrecting a closing stream
          this.#drivers.delete(key);
          driver
            .then((socket) => socket.disconnect())
            .catch((/** @type {any} */ err) => {
              server.send(
                encodeOpRejected({
                  rejectedCmd: CMD_STREAM_EOT,
                  planeId: planeId ?? null,
                  detail: {
                    reason: REASON.INVALID_STATE,
                    message: err?.message ?? "stream close failed",
                  },
                }),
                context,
              );
            });
        },
      );
    });
    server.registerHandler(CMD_GET_STATUS, async (_decoded, context) => {
      const network = this.host.network;
      const runState = network?.isRunning?.()
        ? RUN_STATE.RUNNING
        : RUN_STATE.STOPPED;
      const uptime = network?.uptime?.() ?? 0;
      const epoch = this.graphProtocol
        ? await this.graphProtocol.epoch()
        : (this.host.graph?.name ?? "main");
      this.server.send(
        encodeGetStatusRes({
          epochId: epoch,
          runState,
          uptimeMs: uptime,
          advertisedMask: this.server.capabilityMask,
        }),
        context,
      );
    });
    server.registerHandler(CMD_PROCESS_LIST_REQ, async (_decoded, context) => {
      // §8: the listing is the authoritative runtime view of the main
      // graph's current epoch. The kinds are declared data from the
      // catalog — a node whose component the catalog does not know lists
      // as `stub`, the unimplemented marker — and the execution state is
      // network-scoped until per-process disable (`0x43`) is more than an
      // engine gap.
      const details = this.componentDetails?.() ?? {};
      /** @type {Record<string, { component: string, type: string, state: number }>} */
      const entries = {};
      for (const node of this.host.graph.nodes()) {
        // Placeholder nodes have no component and no process to list —
        // they reach clients through graph sync. Skipping keeps the
        // listing answerable: encoding an empty component name would
        // throw and leave the request in wire silence (silence never
        // carries semantics).
        const component = node.component;
        if (!component) continue;
        entries[node.entity_id] = {
          component,
          type: details[component]?.type ?? COMPONENT_TYPE.STUB,
          state: this.host.running
            ? EXECUTION_STATE.ENABLED
            : EXECUTION_STATE.DISABLED,
        };
      }
      const epoch = this.graphProtocol
        ? await this.graphProtocol.epoch()
        : (this.host.graph?.name ?? "main");
      server.send(encodeProcessList(epoch, entries), context);
    });
    server.addEventListener("planedrop", (/** @type {any} */ event) => {
      const planeHost = this.#planeHosts.get(event.detail.planeId);
      if (planeHost) {
        planeHost.stop().catch(() => {});
        this.#planeHosts.delete(event.detail.planeId);
      }
    });
    server.registerHandler(CMD_HWM_SET, (decoded) => {
      this.host.setHighWaterMark(decoded.highWaterMark);
      if (this.host.network) {
        // The engine resolves the high-water mark at edge construction: a
        // change while a network runs is deferred to the next build.
        this.telemetry.record(
          EVENT_TYPE.ERROR,
          "high-water mark applies at the next network build",
        );
      }
    });
  }

  /**
   * Build and start the network. A rejected start is an honest lifecycle
   * event: `0x04 FAILED` with the detail in an accompanying `0x04 ERROR`
   * (work document #4 update #1).
   *
   * @returns {Promise<void>}
   */
  async #start() {
    try {
      await this.host.start();
      // Register the built network's subgraph planes (work document #4
      // update #42): the walk runs per build and reconciles.
      this.graphProtocol?.registerSubgraphPlanes(null, this.host.network);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.telemetry.record(EVENT_TYPE.LIFECYCLE, LIFECYCLE_CODE.FAILED);
      this.telemetry.record(EVENT_TYPE.ERROR, `start failed: ${message}`);
    }
  }

  /**
   * Resolve an exported inport name on a graph model.
   *
   * @param {import("@noflo/graph").GraphModel|undefined} model
   * @param {string} portName
   * @returns {{ node: string, port: string }|null}
   */
  #resolveExport(model, portName) {
    for (const exp of model?.exports?.() ?? []) {
      if (exp.direction === "inport" && exp.public === portName) {
        return { node: exp.internal.node, port: exp.internal.port };
      }
    }
    return null;
  }

  /**
   * Resolve a plane-and-port pair to the network and the owning node,
   * rejecting on the wire when either is missing. Shared by the
   * packet-send and client-driven stream commands.
   *
   * @param {import("./runtime-server.js").RuntimeServer} server
   * @param {any} context
   * @param {number} rejectedCmd
   * @param {string|number|null|undefined} planeId
   * @param {string} port
   * @param {(network: any, target: { node: string, port: string }, planeId: string|number|null) => void} fn
   * @returns {void}
   */
  #withStreamTarget(server, context, rejectedCmd, planeId, port, fn) {
    const isMain = planeId === null || planeId === undefined;
    const network = isMain
      ? this.host.network
      : this.#planeHosts.get(planeId)?.network;
    if (!network) {
      server.send(
        encodeOpRejected({
          rejectedCmd,
          planeId: planeId ?? null,
          detail: {
            reason: REASON.INVALID_STATE,
            message: "plane network not running",
          },
        }),
        context,
      );
      return;
    }
    const model = isMain
      ? this.host.graph
      : this.graphProtocol?.getPlane(planeId)?.model;
    if (!model) {
      server.send(
        encodeOpRejected({
          rejectedCmd,
          planeId: planeId ?? null,
          detail: {
            reason: REASON.UNKNOWN_TARGET,
            message: "plane model not found",
          },
        }),
        context,
      );
      return;
    }
    const target = this.#resolveExport(model, port);
    if (!target) {
      server.send(
        encodeOpRejected({
          rejectedCmd,
          planeId: planeId ?? null,
          detail: {
            reason: REASON.UNKNOWN_TARGET,
            message: `no exported inport named ${port}`,
          },
        }),
        context,
      );
      return;
    }
    fn(network, target, isMain ? null : planeId);
  }

  /**
   * The owning component name of a resolved target, for guard checks.
   *
   * @param {string|number|null|undefined} planeId
   * @param {{ node: string, port: string }} target
   * @returns {string}
   */
  #targetComponent(planeId, target) {
    if (planeId === null || planeId === undefined) {
      return this.host.graph.node(target.node)?.component ?? "";
    }
    return (
      this.graphProtocol?.getPlane(planeId)?.model?.node(target.node)
        ?.component ?? ""
    );
  }

  /**
   * The client-stream registry key for a plane-and-port pair.
   *
   * @param {string|number|null|undefined} planeId
   * @param {string} port
   * @returns {string}
   */
  #driverKey(planeId, port) {
    return `${planeId === null || planeId === undefined ? "main" : planeId}::${port}`;
  }

  /**
   * Start a network for an ephemeral plane: create a NetworkHost for the
   * plane's model, build the network, and start it.
   *
   * @param {string|number} planeId
   * @returns {Promise<void>}
   */
  async #startPlane(planeId) {
    const existing = this.#planeHosts.get(planeId);
    if (existing?.network) return;
    const model = this.graphProtocol?.getPlane(planeId)?.model;
    if (!model) return;
    const host = new /** @type {any} */ (this.host).constructor({
      graph: model,
      componentLoader: this.host.componentLoader,
    });
    this.#planeHosts.set(planeId, host);
    // Wire the ephemeral plane's network events into the telemetry stream
    this.telemetry.observeHost(host, planeId);
    try {
      await host.start();
      // Register the plane's built-network subgraph planes (update #42)
      this.graphProtocol?.registerSubgraphPlanes(planeId, host.network);
    } catch (error) {
      // Honest lifecycle: a rejected ephemeral START is FAILED + ERROR,
      // matching the main plane's behavior (work document #4 update #1).
      const message = error instanceof Error ? error.message : String(error);
      this.telemetry.record(
        EVENT_TYPE.LIFECYCLE,
        LIFECYCLE_CODE.FAILED,
        planeId,
      );
      this.telemetry.record(
        EVENT_TYPE.ERROR,
        `start failed: ${message}`,
        planeId,
      );
      this.#planeHosts.delete(planeId);
      throw error;
    }
  }

  /**
   * @param {string} action
   * @param {any} [decoded]
   * @param {any} [context]
   * @returns {void}
   */
  #engineGap(action, decoded, context) {
    const message = `${action} is not supported by the running engine`;
    this.server.dispatchEvent(
      new globalThis.CustomEvent("unsupported", {
        detail: { hook: action, decoded, context },
      }),
    );
    // The rejection reaches the requesting context explicitly (update
    // #43: reason codes — a client must be able to tell "may not" from
    // "cannot") and the telemetry stream for other subscribers.
    this.server.send(
      encodeOpRejected({
        rejectedCmd: decoded?.cmd ?? 0,
        planeId: null,
        detail: { reason: REASON.UNSUPPORTED, message },
      }),
      context,
    );
    this.telemetry.record(EVENT_TYPE.ERROR, message);
  }
}
