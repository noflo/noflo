//     @noflo/runtime-client - FBP Protocol 2.0 client over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @file execution module
 * @description The execution-control client (work document #29 phase 4):
 *   run control (`0x40`), breakpoints (`0x41`/`0x42`), per-process control
 *   (`0x43`), the process listing (`0x44`/`0x45`), edge capacity
 *   (`0x46`), and packet injection (`0x47`).
 */

import {
  encodeBreakpointClear,
  encodeBreakpointSet,
  encodeHwmSet,
  encodePacketSend,
  encodeProcessCtrl,
  encodeProcessListReq,
  encodeRunCtrl,
  PROCESS_ACTION,
  RUN_ACTION,
} from "@noflo/fbp-protocol";

export {
  PROCESS_ACTION as PROCESS_ACTIONS,
  RUN_ACTION as RUN_ACTIONS,
} from "@noflo/fbp-protocol";

/**
 * The execution-control sender over an established link. Every method
 * sends the corresponding command frame; the runtime's state changes
 * arrive as lifecycle/telemetry events, not as replies.
 */
export class ExecutionClient {
  /** @type {(payload: Uint8Array) => Promise<void>} */
  #send;

  /**
   * @param {Object} deps
   * @param {(payload: Uint8Array) => Promise<void>} deps.send - Frame sender over the established link
   */
  constructor({ send }) {
    this.#send = send;
  }

  /**
   * Run control: pause, resume, step, start, or stop the network.
   *
   * @param {keyof typeof RUN_ACTION | number} action
   * @param {number|string|null} [planeId] - nil addresses the main plane
   * @returns {Promise<void>}
   */
  runControl(action, planeId = null) {
    const resolved = typeof action === "string" ? RUN_ACTION[action] : action;
    return this.#send(encodeRunCtrl(resolved, planeId));
  }

  /**
   * Set a data breakpoint: the runtime pauses when a packet arrives at
   * the node's triggering inport.
   *
   * @param {Object} bp
   * @param {string} bp.breakpointId
   * @param {string} bp.nodeId
   * @param {string|null} [bp.port] - nil matches any port
   * @returns {Promise<void>}
   */
  setBreakpoint({ breakpointId, nodeId, port = null }) {
    return this.#send(encodeBreakpointSet({ breakpointId, nodeId, port }));
  }

  /**
   * Clear one breakpoint, or all when no id is given.
   *
   * @param {string|null} [breakpointId] - nil clears every breakpoint
   * @returns {Promise<void>}
   */
  clearBreakpoints(breakpointId = null) {
    return this.#send(encodeBreakpointClear(breakpointId));
  }

  /**
   * Per-process execution control: a disabled node stops activating;
   * queued packets are kept and resume when enabled.
   *
   * @param {string} nodeId
   * @param {keyof typeof PROCESS_ACTION | number} action
   * @returns {Promise<void>}
   */
  processControl(nodeId, action) {
    const resolved =
      typeof action === "string" ? PROCESS_ACTION[action] : action;
    return this.#send(encodeProcessCtrl({ nodeId, action: resolved }));
  }

  /**
   * Request the live process listing (the authoritative view of the
   * current graph epoch — clients never infer stub-ness by name
   * matching). The listing arrives as an inbound `0x45` frame, re-emitted
   * by the client as a typed `processlist` event.
   *
   * @returns {Promise<void>}
   */
  requestProcesses() {
    return this.#send(encodeProcessListReq());
  }

  /**
   * Set the default edge capacity (high-water mark) for the runtime.
   *
   * @param {number|null} highWaterMark
   * @returns {Promise<void>}
   */
  setHwm(highWaterMark) {
    return this.#send(encodeHwmSet(highWaterMark));
  }

  /**
   * Inject one packet into a running network's inport — the remote
   * counterpart of feeding IIPs, and the fbp-spec runner's sequenced
   * case-input mechanism.
   *
   * @param {Object} packet
   * @param {number|string|null} [packet.planeId] - nil = main plane
   * @param {string} packet.port - Inport name
   * @param {any} packet.payload
   * @returns {Promise<void>}
   */
  injectPacket({ planeId = null, port, payload }) {
    return this.#send(encodePacketSend({ planeId, port, payload }));
  }
}
