/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module telemetry-protocol
 * @description Live streaming telemetry (work document #28 phase 4, wire per
 *   work document #4 §7): `0x30` pub/sub subscriptions and `0x32` buffered,
 *   delta-encoded flowtrace chunks.
 *
 *   The runtime buffers execution events per subscription and flushes
 *   chunks on its own cadence — the client's interval is a request, and the
 *   flush policy is the runtime's physical decision (a configurable floor
 *   keeps constrained links from being stormed). Explicit start/stop/dump
 *   commands of 1.x are gone; "dump" is the streamable trace file format.
 */
/* @ts-self-types="./telemetry-protocol.d.ts" */

import {
  CMD_PUBSUB_SUB,
  EVENT_TYPE,
  encodeFlowtraceChunkFromTimestamps,
  LIFECYCLE_CODE,
} from "@noflo/fbp-protocol";
import { MsgPack } from "@reticulum/core";

/**
 * A subscription registered by a `0x30` command.
 *
 * @typedef {object} Subscription
 * @property {string|number} subId Client-chosen subscription identifier.
 * @property {string} targetType What was subscribed to.
 * @property {string} targetId
 * @property {number} requestedFlushIntervalMs
 * @property {any} context The link the subscription arrived on.
 * @property {{ timestampMs: number, eventType: number, payload: any }[]} buffer
 * @property {any} timer
 */

/**
 * The telemetry protocol handler, bound to a
 * {@link import("./runtime-server.js").RuntimeServer} via
 * {@link TelemetryProtocol#register}.
 */
export class TelemetryProtocol {
  /**
   * @param {object} options
   * @param {import("./network-host.js").NetworkHost} options.host The
   *   network lifecycle host whose events feed the streams.
   * @param {number} [options.flushFloorMs] Lower bound the runtime imposes
   *   on flush cadence regardless of the client's request — the
   *   physics-dictates-policy knob. Defaults to 0 (honor requests).
   * @param {number} [options.flushCeilingMs] Upper bound on the flush
   *   cadence regardless of the client's request. A client can otherwise
   *   buffer every event for days with one huge interval. Defaults to
   *   300000 (5 minutes); the floor wins when it sits above the ceiling.
   * @param {number} [options.maxSubscriptionsPerContext] Subscription
   *   budget per link context. A hostile or buggy client can otherwise
   *   create unbounded subscription state per unique `sub_id`. When the
   *   budget is exhausted the new subscription is rejected and a
   *   `subscriptionlimit` event surfaces on the server. Defaults to 32.
   * @param {string} [options.stubErrorName] Error name classifying a
   *   process error as raised by a stub component (work document #19's
   *   `StubNotImplementedError`); mapped to `0x09 STUB_ERROR` instead of
   *   `0x04 ERROR` (work document #4 update #9).
   */
  constructor(options) {
    this.host = options.host;
    this.flushFloorMs = options.flushFloorMs ?? 0;
    this.flushCeilingMs = options.flushCeilingMs ?? 300_000;
    this.maxSubscriptionsPerContext = options.maxSubscriptionsPerContext ?? 32;
    this.stubErrorName = options.stubErrorName ?? "StubNotImplementedError";
    /** @type {Map<string|number, Subscription>} */
    this.subscriptions = new Map();
  }

  /**
   * Register the `0x30` handler on a runtime server and start observing the
   * host's network events. Requires `TELEMETRY_READ` on the server's
   * advertised mask for subscriptions to be admitted.
   *
   * @param {import("./runtime-server.js").RuntimeServer} server
   * @returns {void}
   */
  register(server) {
    this.server = server;
    server.registerHandler(CMD_PUBSUB_SUB, (decoded, context) => {
      // The per-context subscription budget keeps one link from growing
      // the store without bound.
      let perContext = 0;
      for (const subscription of this.subscriptions.values()) {
        if (subscription.context === context) {
          perContext += 1;
        }
      }
      if (perContext >= this.maxSubscriptionsPerContext) {
        this.server.dispatchEvent(
          new globalThis.CustomEvent("subscriptionlimit", {
            detail: {
              subId: decoded.subId,
              context,
              limit: this.maxSubscriptionsPerContext,
            },
          }),
        );
        return;
      }
      this.subscriptions.set(String(decoded.subId), {
        subId: decoded.subId,
        targetType: decoded.targetType,
        targetId: decoded.targetId,
        requestedFlushIntervalMs: decoded.requestedFlushIntervalMs,
        context,
        buffer: [],
        timer: null,
      });
    });
    this.host.addEventListener("start", () => {
      this.record(EVENT_TYPE.LIFECYCLE, LIFECYCLE_CODE.START);
    });
    this.host.addEventListener("end", () => {
      this.record(EVENT_TYPE.LIFECYCLE, LIFECYCLE_CODE.STOP);
    });
    this.host.addEventListener("ip", (/** @type {any} */ event) => {
      this.#recordIp(event.detail);
    });
    this.host.addEventListener("process-error", (/** @type {any} */ event) => {
      this.#recordError(event.detail);
    });
  }

  /**
   * Drop every subscription belonging to a context — the transport calls
   * this when a link closes. The protocol has no unsubscribe command; link
   * lifetime is the subscription lifetime.
   *
   * @param {any} context
   * @returns {void}
   */
  dropContext(context) {
    for (const [subId, subscription] of this.subscriptions) {
      if (subscription.context === context) {
        if (subscription.timer !== null) {
          clearTimeout(subscription.timer);
        }
        this.subscriptions.delete(subId);
      }
    }
  }

  /**
   * Flush every subscription with buffered events, immediately. The flush
   * timers call this per subscription; transports (and tests) that prefer
   * explicit flushing may call it directly.
   *
   * @returns {void}
   */
  flushAll() {
    for (const subscription of this.subscriptions.values()) {
      this.#flush(subscription);
    }
  }

  /**
   * Record one network IP event as flowtrace events: brackets become group
   * boundaries, data becomes the raw value.
   *
   * @param {any} ip
   * @returns {void}
   */
  #recordIp(ip) {
    switch (ip?.type) {
      case "openBracket":
        this.record(EVENT_TYPE.BEGIN_GROUP, ip.data ?? "");
        break;
      case "closeBracket":
        this.record(EVENT_TYPE.END_GROUP, ip.data ?? "");
        break;
      case "data":
        this.record(EVENT_TYPE.DATA, ip.data);
        break;
      default:
        // Connect/disconnect and other socket events are not flowtrace
        // events.
        break;
    }
  }

  /**
   * Record a process error, classified as `STUB_ERROR` when it names the
   * stub error class — the event type itself is the classification (work
   * document #4 update #9).
   *
   * @param {any} detail
   * @returns {void}
   */
  #recordError(detail) {
    const error = detail?.error ?? detail;
    const message =
      typeof error?.message === "string"
        ? error.message
        : String(error ?? "unknown error");
    const type =
      error?.name === this.stubErrorName
        ? EVENT_TYPE.STUB_ERROR
        : EVENT_TYPE.ERROR;
    this.record(type, message);
  }

  /**
   * Append an event to every subscription's buffer and arm its flush.
   *
   * @param {number} eventType
   * @param {any} payload
   * @returns {void}
   */
  /**
   * Record one event into every subscription's buffer.
   *
   * @param {number} eventType
   * @param {any} payload
   * @returns {void}
   */
  record(eventType, payload) {
    if (this.subscriptions.size === 0) {
      return;
    }
    const timestampMs = Date.now();
    const sanitized = frugalPayload(payload);
    for (const subscription of this.subscriptions.values()) {
      subscription.buffer.push({ timestampMs, eventType, payload: sanitized });
      this.#arm(subscription);
    }
  }

  /**
   * @param {Subscription} subscription
   * @returns {void}
   */
  #arm(subscription) {
    if (subscription.timer !== null) {
      return;
    }
    // The client's interval is a request: the runtime floors it to keep
    // constrained links from being stormed and ceilings it so one client
    // cannot buffer every event for days.
    const interval = Math.min(
      Math.max(subscription.requestedFlushIntervalMs, this.flushFloorMs),
      Math.max(this.flushCeilingMs, this.flushFloorMs),
    );
    subscription.timer = setTimeout(() => {
      subscription.timer = null;
      this.#flush(subscription);
    }, interval);
    // Unref where available: a telemetry timer must not keep a Node
    // process alive on its own.
    subscription.timer?.unref?.();
  }

  /**
   * @param {Subscription} subscription
   * @returns {void}
   */
  #flush(subscription) {
    if (subscription.buffer.length === 0) {
      return;
    }
    const events = subscription.buffer;
    subscription.buffer = [];
    this.server.send(
      encodeFlowtraceChunkFromTimestamps({
        subId: subscription.subId,
        events,
      }),
      subscription.context,
    );
  }
}

/**
 * Frugalize a payload the wire cannot carry: probe-encode it, and on
 * failure replace the value with a type-named placeholder. Serialization
 * failures must never take down the flush loop (work document #4 §7:
 * frugalization is per local policy).
 *
 * @param {any} payload
 * @returns {any}
 */
function frugalPayload(payload) {
  try {
    MsgPack.encode([payload]);
    return payload;
  } catch {
    return `<unserializable ${typeName(payload)}>`;
  }
}

/**
 * @param {any} value
 * @returns {string}
 */
function typeName(value) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "object") {
    return value.constructor?.name?.toLowerCase() ?? "object";
  }
  return typeof value;
}
