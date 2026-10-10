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
  CMD_RUN_CTRL,
  EVENT_TYPE,
  encodeGetStatusRes,
  LIFECYCLE_CODE,
  RUN_ACTION,
  RUN_STATE,
} from "@noflo/fbp-protocol";

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
  /**
   * @param {object} options
   * @param {import("./network-host.js").NetworkHost} options.host
   * @param {import("./telemetry-protocol.js").TelemetryProtocol} options.telemetry
   * @param {import("./graph-protocol.js").GraphProtocol} [options.graphProtocol]
   * @param {import("./graph-protocol.js").GraphProtocol} [options.graphProtocol] The
   *   graph protocol, for access to the plane registry (multi-plane support).
   *   Control failures and lifecycle outcomes reach subscribed clients as
   *   flowtrace events through it.
   */
  constructor(options) {
    this.host = options.host;
    this.telemetry = options.telemetry;
    /** The graph protocol, for access to the plane registry. */
    this.graphProtocol = options.graphProtocol ?? null;
    /** Ephemeral plane hosts, keyed by plane id.
     * @type {Map<string|number, import("./network-host.js").NetworkHost>}
     */
    this.#planeHosts = new Map();
  }
  /**
   * Ephemeral plane hosts, keyed by plane id.
   * @type {Map<string|number, import("./network-host.js").NetworkHost>}
   */
  #planeHosts;

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
          this.#engineGap("pause");
          break;
        case RUN_ACTION.RESUME:
          this.#engineGap("resume");
          break;
        case RUN_ACTION.STEP:
          this.#engineGap("step");
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
    server.registerHandler(CMD_PACKET_SEND, (decoded) => {
      const planeId = decoded.planeId;
      const isMain = planeId === null || planeId === undefined;
      const network = isMain
        ? this.host.network
        : this.#planeHosts.get(planeId)?.network;
      if (!network) return;
      const model = isMain
        ? this.host.graph
        : this.graphProtocol?.getPlane(planeId)?.model;
      if (!model) return;
      const target = this.#resolveExport(model, decoded.port);
      if (!target) return;
      network
        .addInitial({
          entity_id: `packet-send-${Date.now()}`,
          from: { data: decoded.payload },
          to: { node: target.node, port: target.port },
        })
        .catch(() => {});
    });
    server.registerHandler(CMD_GET_STATUS, (_decoded, context) => {
      const network = this.host.network;
      const runState = network?.isRunning?.()
        ? RUN_STATE.RUNNING
        : RUN_STATE.STOPPED;
      const uptime = network?.uptime?.() ?? 0;
      const epoch = this.host.graph?.name ?? "main";
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
    this.telemetry.observeHost(host);
    await host.start();
  }

  /**
   * @param {string} action
   * @param {any} [decoded]
   * @param {any} [context]
   * @returns {void}
   */
  #engineGap(action, decoded, context) {
    const reason = `${action} is not supported by the running engine`;
    this.server.dispatchEvent(
      new globalThis.CustomEvent("unsupported", {
        detail: { hook: action, decoded, context },
      }),
    );
    this.telemetry.record(EVENT_TYPE.ERROR, reason);
  }
}
