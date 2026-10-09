/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module @noflo/runtime/lxmf
 * @description Offline telemetry drops over LXMF store-and-forward (work
 *   document #28, wire per work document #4 §9). Runtimes dispatch state to
 *   the mesh via LXMF (`app_name: fbp.telemetry`) for asynchronous
 *   monitoring: event-driven drops on fault conditions, or scheduled drops
 *   opportunistically — e.g. peak solar-generation hours — with randomized
 *   jitter. PoW limits on microcontrollers make periodic flooding
 *   prohibitive; the cadence policy lives with the application, this module
 *   only makes the honest options easy and the dishonest ones impossible
 *   (no fixed-cadence flood loop).
 *
 *   The LXMF router is injected: the application constructs it with its own
 *   identity, interfaces, and stamp policy. Isomorphic like the rest of the
 *   package.
 */

/* @ts-self-types="./lxmf.d.ts" */

import { encodeLxmTelemetry } from "@noflo/fbp-protocol";
import { LXMessage } from "@reticulum/lxmf";

/**
 * The LXMF fields key carrying the FBP telemetry drop: the flat positional
 * array of work document #4 §9, MsgPack-encoded by
 * {@link encodeLxmTelemetry}.
 *
 * @type {string}
 */
export const TELEMETRY_FIELD = "fbp.telemetry";

/**
 * @typedef {object} LxmfDropOptions
 * @property {import("@reticulum/lxmf").LXMRouter} options.router The
 *   application's LXMF router (identity, interfaces, stamp policy).
 * @property {import("@reticulum/core").Identity} options.identity The
 *   runtime's long-term identity — the drop's sender.
 * @property {string} options.monitorHash Hex of the monitor's LXMF delivery
 *   destination; where drops go.
 * @property {number} [options.jitterFraction] Fraction of the scheduled
 *   interval used as uniform random jitter (work document #4 §9: drops are
 *   scheduled *opportunistically* with randomized jitter); defaults to 0.25.
 */

/**
 * Scheduled-drop telemetry over LXMF. One instance per runtime.
 */
export class LxmfTelemetry extends EventTarget {
  /**
   * @param {LxmfDropOptions} options
   */
  constructor(options) {
    super();
    this.router = options.router;
    this.identity = options.identity;
    this.monitorHash = options.monitorHash;
    this.jitterFraction = options.jitterFraction ?? 0.25;
    /** @type {any} */
    this.timer = null;
    /** @type {(() => any) | null} */
    this.telemetryProvider = null;
  }

  /**
   * Event-driven drop: encode the telemetry and dispatch it now. Use for
   * fault conditions (errors recorded, safe-mode entry) — the honest
   * drop trigger when something actually happened.
   *
   * @param {import("@noflo/fbp-protocol").LxmTelemetry} telemetry
   * @returns {Promise<void>}
   */
  async drop(telemetry) {
    const payload = encodeLxmTelemetry(telemetry);
    const message = new LXMessage({
      sourceHash: this.identity.identityHash,
      destinationHash: hexToBytes(this.monitorHash),
      fields: { [TELEMETRY_FIELD]: payload },
    });
    await this.router.send(message, this.identity);
  }

  /**
   * Schedule opportunistic drops: the provider is asked for the current
   * telemetry at each fire, with uniform random jitter over
   * `jitterFraction` of the interval — peak-solar-style opportunism, never
   * a metronome. The first drop waits a full randomized interval; call
   * {@link LxmfTelemetry#drop} directly for event-driven faults.
   *
   * @param {() => import("@noflo/fbp-protocol").LxmTelemetry | Promise<import("@noflo/fbp-protocol").LxmTelemetry>} telemetryProvider
   *   Current runtime state, asked at each fire.
   * @param {number} intervalMs Mean interval between drops.
   * @returns {void}
   */
  scheduleDrops(telemetryProvider, intervalMs) {
    this.telemetryProvider = telemetryProvider;
    this.#arm(intervalMs);
  }

  /**
   * Stop the scheduled drops. Event-driven drops keep working.
   *
   * @returns {void}
   */
  unschedule() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.telemetryProvider = null;
  }

  /**
   * The interval the schedule was last armed with.
   *
   * @type {number}
   */
  #interval = 0;

  /**
   * @param {number} intervalMs
   * @returns {void}
   */
  #arm(intervalMs) {
    this.#interval = intervalMs;
    const jitter = (Math.random() * 2 - 1) * this.jitterFraction * intervalMs;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.#fire();
      },
      Math.max(0, intervalMs + jitter),
    );
    // A telemetry timer must not keep a Node process alive on its own.
    this.timer?.unref?.();
  }

  /**
   * @returns {Promise<void>}
   */
  async #fire() {
    const provider = this.telemetryProvider;
    if (!provider) {
      return;
    }
    try {
      await this.drop(await provider());
    } catch (error) {
      // A failed drop must not kill the schedule: the next fire tries
      // again, with fresh jitter.
      this.dispatchEvent(
        new globalThis.CustomEvent("droperror", {
          detail: { error },
        }),
      );
    }
    if (this.telemetryProvider === provider) {
      this.#arm(this.#interval);
    }
  }
}

/**
 * @param {string} hex
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
