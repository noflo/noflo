/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module network-host
 * @description The network lifecycle host (work document #28 phase 4): owns
 *   the NoFlo `Network` built from the runtime's graph, re-emitting the
 *   network's EventTarget events (`start`, `end`, `ip`, `process-error`,
 *   `icon`) as host events, so protocol handlers can observe a network
 *   before, after, and across network recreations.
 *
 *   Isomorphic: `createNetwork` comes from `@noflo/noflo`'s browser-safe
 *   surface, and the component loader is injected — the application supplies
 *   whichever loader suits its platform and registry (work documents
 *   #6/#16).
 *
 *   Engine gap (surfaced by this host, work document #28): the 2.x engine
 *   consumes the graph at `connect()` time and does not follow live graph
 *   changes, so CRDT operations applied while a network runs update the
 *   wire state but not the running network until the engine learns to
 *   follow graph deltas.
 */
/* @ts-self-types="./network-host.d.ts" */

import { createNetwork } from "@noflo/noflo";

/**
 * The network lifecycle host: owns the NoFlo `Network` built from the
 * runtime's graph, re-emitting the network's EventTarget events (`start`,
 * `end`, `ip`, `process-error`, `icon`) as host events, so protocol handlers
 * can observe a network before, after, and across network recreations.
 *
 * @extends {EventTarget}
 */
export class NetworkHost extends EventTarget {
  /**
   * @param {object} options
   * @param {import("@noflo/graph").GraphModel} options.graph The live graph.
   * @param {import("@noflo/noflo").ComponentLoader} [options.componentLoader]
   *   Loader resolving component implementations for the network.
   * @param {boolean} [options.asyncDelivery]
   * @param {number|null} [options.highWaterMark] Network-global backpressure
   *   default applied when the network is built; the engine resolves the
   *   high-water mark at edge construction, so runtime changes are pending
   *   until the next build (see {@link NetworkHost#setHighWaterMark}).
   * @param {import("@noflo/noflo").Flowtrace} [options.flowtrace] Trace
   *   recorder handed to every network this host builds, recording all
   *   executions under the graph's name (work document #23).
   */
  constructor(options) {
    super();
    this.graph = options.graph;
    this.componentLoader = options.componentLoader ?? null;
    this.asyncDelivery = options.asyncDelivery ?? false;
    this.pendingHighWaterMark = options.highWaterMark;
    this.flowtrace = options.flowtrace ?? null;
    /** @type {import("@noflo/noflo").Network|null} */
    this.network = null;
    /** @type {Promise<import("@noflo/noflo").Network>|null} */
    this.starting = null;
  }

  /**
   * Set the network-global high-water mark applied when the network is next
   * built (work document #4 §8: `0x46 CMD_HWM_SET`). The engine resolves
   * the high-water mark at edge construction, so a change while a network
   * runs is deferred — callers signal that to clients through their own
   * channel (the execution handler emits an ERROR flowtrace event).
   *
   * @param {number|null} highWaterMark Non-negative integer (0 synchronous,
   *   n admitted in-flight) or null (unbounded).
   * @returns {void}
   */
  setHighWaterMark(highWaterMark) {
    this.pendingHighWaterMark = highWaterMark;
  }

  /**
   * Whether a network is currently running.
   *
   * @returns {boolean}
   */
  get running() {
    return this.network?.isRunning() ?? false;
  }

  /**
   * Whether a network has been started (but may have finished running).
   *
   * @returns {boolean}
   */
  get started() {
    return this.network?.isStarted() ?? false;
  }

  /**
   * Build and start the network. Repeated calls while a start is in flight
   * share the same start; a running network is left alone.
   *
   * @returns {Promise<import("@noflo/noflo").Network>}
   */
  async start() {
    if (this.network) {
      return this.startOrRestart();
    }
    if (!this.starting) {
      this.starting = this.#createAndStart();
    }
    return this.starting;
  }

  /**
   * Stop the running network. Queued packets do not survive a stop — the
   * engine has no pause primitive (work document #28 phase 5 records this
   * gap).
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.network) {
      return;
    }
    await this.network.stop();
  }

  /**
   * Start an existing network, or restart it after a stop.
   *
   * @returns {Promise<import("@noflo/noflo").Network>}
   */
  async startOrRestart() {
    if (!this.network) {
      return this.start();
    }
    await this.network.start();
    return this.network;
  }

  /**
   * Tear down the network instance so the next start rebuilds it from the
   * current graph state.
   *
   * @returns {Promise<void>}
   */
  async discard() {
    if (this.network) {
      await this.network.stop();
      this.network = null;
    }
    this.starting = null;
  }

  /**
   * @returns {Promise<import("@noflo/noflo").Network>}
   */
  async #createAndStart() {
    const network = await createNetwork(this.graph, {
      componentLoader: this.componentLoader ?? undefined,
      delay: true,
      asyncDelivery: this.asyncDelivery,
      ...(this.flowtrace ? { flowtrace: this.flowtrace } : {}),
      ...(this.pendingHighWaterMark === undefined
        ? {}
        : { highWaterMark: this.pendingHighWaterMark }),
    });
    this.#subscribeNetwork(network);
    this.network = network;
    await network.connect();
    await network.start();
    this.starting = null;
    return network;
  }

  /**
   * @param {import("@noflo/noflo").Network} network
   * @returns {void}
   */
  #subscribeNetwork(network) {
    for (const type of ["start", "end", "ip", "process-error", "icon"]) {
      network.addEventListener(type, (/** @type {any} */ event) => {
        this.#emit(type, event.detail);
      });
    }
  }

  /**
   * @param {string} type
   * @param {any} detail
   * @returns {void}
   */
  #emit(type, detail) {
    this.dispatchEvent(new globalThis.CustomEvent(type, { detail }));
  }
}
