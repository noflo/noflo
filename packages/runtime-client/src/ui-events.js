//     @noflo/runtime-client - FBP Protocol 2.0 client over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @file ui-events module
 * @description The UI event surface (work document #29 phase 5): a
 *   standard `EventTarget` that composes the client modules (graph
 *   mirror, registry cache, telemetry, execution) and re-emits their
 *   activity as typed `CustomEvent`s — the EventTarget contract recorded
 *   in update #5, replacing the legacy `fbp-protocol-client`
 *   EventEmitter API.
 *
 *   Legacy event-name mapping (for noflo-ui and other consumers of the
 *   old client):
 *
 *   | Legacy event        | This surface                       |
 *   |---------------------|------------------------------------|
 *   | `graph` (baseline)  | `graph` (detail.graph baseline)    |
 *   | `graph:changed`     | `graphchanged` (detail.op applied) |
 *   | `component`         | `components` (full catalog)        |
 *   | `packets`           | `packets` (chunk events)           |
 *   | `execution` (status)| `execution` (0x40–0x47 family)     |
 *
 *   DOM `CustomEvent.type` cannot carry colons for `graph:changed`, so
 *   the colon-free form is used; consumers `addEventListener` with the
 *   names above and read `event.detail`. New in 2.0, the surface also
 *   re-emits `oprejected` — the runtime's explicit `0x17` refusal with
 *   its reason — which the legacy client had no equivalent for.
 */

import { ExecutionClient } from "./execution.js";
import { TelemetryClient } from "./telemetry.js";

/**
 * The event detail for the `graph` event: a fresh baseline for the main
 * plane's mirror.
 *
 * @typedef {Object} GraphEventDetail
 * @property {string} epochId
 * @property {import("@noflo/graph").GraphModel} graph
 * @property {boolean} upToDate - True when the mirror stood (no refetch)
 */
/**
 * The event detail for the `components` event: the registry catalog
 * after a Two-Step sync, with cached signatures.
 *
 * @typedef {Object} ComponentsEventDetail
 * @property {import("./registry-cache.js").RegistryCatalog} catalog
 */
/**
 * The event detail for the `packets` event: one decoded telemetry chunk.
 *
 * @typedef {import("./telemetry.js").TelemetryChunk} PacketsEventDetail
 */
/**
 * The event detail for the `execution` event: a decoded run-control
 * frame.
 *
 * @typedef {Object} ExecutionEventDetail
 * @property {number} cmd
 * @property {number} action
 * @property {number|string|null} planeId
 */

/**
 * The UI-facing event surface over an established client. Wraps the
 * graph-mirror sync, the registry Two-Step Cache, and the telemetry
 * stream into one EventTarget whose events are the UI protocol
 * vocabulary: `graph`, `graphchanged`, `components`, `packets`,
 * `processes`, `execution`, and `oprejected`.
 *
 * @extends EventTarget
 */
export class UiEventSurface extends EventTarget {
  /** @type {import("./index.js").RuntimeClient} */
  #client;

  /** @type {TelemetryClient} */
  #telemetry;

  /** @type {boolean} */
  #wired = false;

  /**
   * @param {Object} options
   * @param {import("./index.js").RuntimeClient} options.client - The established protocol client
   * @param {import("./telemetry.js").TelemetryFilters} [options.filters] - Telemetry event-type filters
   * @param {string} [options.telemetrySubId] - The telemetry subscription id
   */
  constructor({ client, filters = {}, telemetrySubId }) {
    super();
    this.#client = client;
    this.#telemetry = new TelemetryClient({
      send: (payload) => client.send(payload),
      subId: telemetrySubId,
      filters,
    });
    this.#telemetry.onChunk((chunk) => {
      this.dispatchEvent(
        new CustomEvent("packets", { detail: /** @type {any} */ (chunk) }),
      );
    });
    // Inbound 0x32 chunks arrive as the client's typed `telemetry`
    // event; the consumer decodes, delta-applies, and filters them
    client.addEventListener("telemetry", (/** @type {any} */ event) => {
      this.#telemetry.handleDecoded(event.detail);
    });
    // Passive re-emissions, wired at construction so a consumer holding
    // the surface sees rejections and execution-control commands from
    // the first frame on
    client.addEventListener("oprejected", (/** @type {any} */ event) => {
      this.dispatchEvent(
        new CustomEvent("oprejected", { detail: event.detail }),
      );
    });
    client.addEventListener("execution", (/** @type {any} */ event) => {
      this.dispatchEvent(
        new CustomEvent("execution", { detail: event.detail }),
      );
    });
  }

  /**
   * The wrapped protocol client.
   *
   * @returns {import("./index.js").RuntimeClient}
   */
  get client() {
    return this.#client;
  }

  /**
   * The telemetry consumer (for filter changes and direct chunk access).
   *
   * @returns {TelemetryClient}
   */
  get telemetry() {
    return this.#telemetry;
  }

  /**
   * The execution-control sender (run control, breakpoints, process
   * control, packet injection) over the same link.
   *
   * @returns {import("./execution.js").ExecutionClient}
   */
  get execution() {
    return this.#client.execution;
  }

  /**
   * Wire the surface to the client's frame stream: graph ops become
   * `graphchanged` events, `0x45` process listings become `processes`
   * events. Idempotent — the wiring happens once on the first `start`.
   *
   * @returns {void}
   */
  #wire() {
    if (this.#wired) {
      return;
    }
    this.#wired = true;
    this.#client.addEventListener("op", (/** @type {any} */ event) => {
      this.dispatchEvent(
        new CustomEvent("graphchanged", { detail: event.detail }),
      );
    });
    this.#client.addEventListener("processlist", (/** @type {any} */ event) => {
      this.dispatchEvent(
        new CustomEvent("processes", {
          detail: /** @type {any} */ ({ entries: event.detail.entries }),
        }),
      );
    });
  }

  /**
   * Start the UI session: sync the graph mirror and the component
   * registry (emitting `graph` and `components`), wire the frame
   * stream, and subscribe to telemetry.
   *
   * @param {Object} [options]
   * @param {boolean} [options.telemetry] - Subscribe to the telemetry stream (default true)
   * @returns {Promise<void>}
   */
  async start(options = {}) {
    const { telemetry = true } = options;
    this.#wire();
    const graphSync = this.#client.syncGraph().then((sync) => {
      this.dispatchEvent(
        new CustomEvent("graph", {
          detail: /** @type {any} */ ({
            epochId: sync.epochId,
            graph: sync.graph,
            upToDate: sync.upToDate,
          }),
        }),
      );
    });
    const registrySync = this.#client.syncComponents().then((catalog) => {
      this.dispatchEvent(
        new CustomEvent("components", {
          detail: /** @type {any} */ ({ catalog }),
        }),
      );
    });
    await Promise.all([graphSync, registrySync]);
    if (telemetry) {
      await this.#telemetry.subscribe();
    }
  }
}
