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

import {
  CMD_BREAKPOINT_CLEAR,
  CMD_BREAKPOINT_SET,
  CMD_HWM_SET,
  CMD_PROCESS_CTRL,
  CMD_RUN_CTRL,
  EVENT_TYPE,
  LIFECYCLE_CODE,
  RUN_ACTION,
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
   *   Control failures and lifecycle outcomes reach subscribed clients as
   *   flowtrace events through it.
   */
  constructor(options) {
    this.host = options.host;
    this.telemetry = options.telemetry;
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
          await this.#start();
          break;
        case RUN_ACTION.STOP:
          await this.host.stop();
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
