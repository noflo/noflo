//     @noflo/runtime-client - FBP Protocol 2.0 client over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @file telemetry module
 * @description The telemetry consumer (work document #29 phase 4):
 *   `0x30` pubsub subscriptions with `0x32` chunk decoding — the client
 *   side of the wire's flowtrace-chunk stream, decoded into per-event
 *   payloads for UI consumption.
 */

import { decodeFlowtraceChunk, encodePubsubSub } from "@noflo/fbp-protocol";

export { decodeFlowtraceChunk, encodePubsubSub };

/**
 * A decoded telemetry event: the wire tuple flattened with the absolute
 * timestamp (base + delta applied).
 *
 * @typedef {Object} TelemetryEvent
 * @property {number} timestampMs - Absolute event time (chunk base + delta)
 * @property {number} timeDeltaMs - The raw delta from the chunk base
 * @property {number} eventType
 * @property {any} payload
 */
/**
 * A decoded `0x32` chunk.
 *
 * @typedef {Object} TelemetryChunk
 * @property {string|number} subId - The subscription the chunk belongs to
 * @property {number|string|null} planeId - The plane the events belong to
 * @property {number} baseTimestampMs
 * @property {TelemetryEvent[]} events - Delta-applied, filtered events
 */
/**
 * @typedef {Object} TelemetryFilters
 * @property {number[]} [types] - Event types to keep (default: all)
 */

/**
 * The telemetry consumer over an established link: subscribes to the
 * runtime's `0x32` chunk stream and decodes chunks into delta-applied
 * events with client-side type filtering.
 */
export class TelemetryClient {
	/** @type {(payload: Uint8Array) => Promise<void>} */
	#send;

	/** @type {((chunk: TelemetryChunk) => void)|undefined} */
	#onChunk;

	/** @type {TelemetryFilters} */
	#filters;

	/** @type {string} */
	#subId;

	/** @type {string} */
	#targetId;

	/**
	 * @param {Object} deps
	 * @param {(payload: Uint8Array) => Promise<void>} deps.send - Frame sender over the established link
	 * @param {string} [deps.subId] - Client-chosen subscription identifier
	 * @param {string} [deps.targetId] - The telemetry target (the runtime's main graph)
	 * @param {TelemetryFilters} [deps.filters] - Client-side event-type filters
	 */
	constructor({
		send,
		subId = "noflo-client-telemetry",
		targetId = "main",
		filters = {},
	}) {
		this.#send = send;
		this.#subId = subId;
		this.#targetId = targetId;
		this.#filters = filters;
	}

	/**
	 * Subscribe to the runtime's telemetry stream (`0x30`).
	 *
	 * @param {Object} [options]
	 * @param {number} [options.flushIntervalMs] - Requested flush cadence (default 100ms)
	 * @returns {Promise<void>}
	 */
	subscribe(options = {}) {
		const { flushIntervalMs = 100 } = options ?? {};
		return this.#send(
			encodePubsubSub({
				subId: this.#subId,
				targetType: "graph",
				targetId: this.#targetId,
				requestedFlushIntervalMs: flushIntervalMs,
			}),
		);
	}

	/**
	 * Set the callback for inbound `0x32` chunks.
	 *
	 * @param {(chunk: TelemetryChunk) => void} onChunk
	 */
	onChunk(onChunk) {
		this.#onChunk = onChunk;
	}

	/**
	 * Handle an inbound `0x32` chunk frame (wired by the client host to
	 * the link's frame events): decodes the chunk, applies the deltas to
	 * absolute timestamps, filters by event type, and emits the result
	 * through the `onChunk` callback.
	 *
	 * @param {Uint8Array} frame
	 */
	handleChunkFrame(frame) {
		const decoded = decodeFlowtraceChunk(frame);
		const filters = this.#filters;
		const events = (decoded.events ?? [])
			.map((event) => ({
				timestampMs: decoded.baseTimestampMs + event.timeDeltaMs,
				timeDeltaMs: event.timeDeltaMs,
				eventType: event.eventType,
				payload: event.payload,
			}))
			.filter((event) => {
				if (
					filters.types &&
					filters.types.length > 0 &&
					!filters.types.includes(event.eventType)
				) {
					return false;
				}
				return true;
			});
		if (this.#onChunk) {
			this.#onChunk({
				subId: decoded.subId,
				planeId: decoded.planeId,
				baseTimestampMs: decoded.baseTimestampMs,
				events,
			});
		}
	}
}
