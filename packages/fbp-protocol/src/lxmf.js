/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module lxmf
 * @description The offline LXMF store-and-forward telemetry payload (work
 *   document #4 §8): a flat array runtimes dispatch to the mesh via LXMF
 *   (`app_name: fbp.telemetry`). Drops are event-driven or scheduled
 *   opportunistically with randomized jitter — PoW limits on
 *   microcontrollers make periodic flooding prohibitive; that cadence
 *   policy lives in the runtime, not here.
 */
/* @ts-self-types="./lxmf.d.ts" */

import { MsgPack } from "@reticulum/core";
import { VISUAL_FORMAT } from "./constants.js";
import { ProtocolError } from "./errors.js";

/**
 * Device health metrics as reported in the LXMF snapshot. Any value may be
 * `null` when the runtime cannot measure it.
 *
 * @typedef {object} DeviceMetrics
 * @property {number|null} battery Battery state.
 * @property {number|null} solar Solar input.
 * @property {number|null} ram Memory usage.
 * @property {number|null} cpu CPU load.
 */

/**
 * @typedef {object} LxmTelemetry
 * @property {number} timestamp Epoch milliseconds of the snapshot.
 * @property {number} uptime Runtime uptime in milliseconds.
 * @property {boolean} isSafeMode Whether the runtime is in safe mode.
 * @property {DeviceMetrics} metrics [battery, solar, ram, cpu].
 * @property {{ format: number, bitmap: Uint8Array|null }} visual Visual-state pair: format type and binary pixels.
 * @property {string[]} errors Fault conditions recorded since the last drop.
 */

/**
 * Encode the LXMF telemetry payload:
 * `[ timestamp, uptime, is_safe_mode, [ battery, solar, ram, cpu ],
 * [ visual_format, visual_bitmap ], [ errors ] ]`.
 *
 * @param {LxmTelemetry} telemetry
 * @returns {Uint8Array}
 */
export function encodeLxmTelemetry(telemetry) {
  assertTelemetry(telemetry);
  const { timestamp, uptime, isSafeMode, metrics, visual, errors } = telemetry;
  return MsgPack.encode([
    timestamp,
    uptime,
    isSafeMode,
    [metrics.battery, metrics.solar, metrics.ram, metrics.cpu],
    [visual.format, visual.bitmap],
    errors,
  ]);
}

/**
 * Decode the LXMF telemetry payload.
 *
 * @param {Uint8Array} bytes
 * @returns {LxmTelemetry}
 */
export function decodeLxmTelemetry(bytes) {
  const frame = MsgPack.decode(bytes);
  if (!Array.isArray(frame) || frame.length !== 6) {
    throw new ProtocolError("lxmf telemetry payload must be a 6-element array");
  }
  const [timestamp, uptime, isSafeMode, metrics, visual, errors] = frame;
  assertTimestamp(timestamp, "timestamp");
  assertTimestamp(uptime, "uptime");
  if (typeof isSafeMode !== "boolean") {
    throw new ProtocolError("is_safe_mode must be a boolean");
  }
  if (!Array.isArray(metrics) || metrics.length !== 4) {
    throw new ProtocolError(
      "device metrics must be a [battery, solar, ram, cpu] array",
    );
  }
  for (const value of metrics) {
    if (value !== null && typeof value !== "number") {
      throw new ProtocolError("device metrics must be numbers or null");
    }
  }
  if (!Array.isArray(visual) || visual.length !== 2) {
    throw new ProtocolError(
      "visual state must be a [visual_format, visual_bitmap] pair",
    );
  }
  const [format, bitmap] = visual;
  if (!Object.values(VISUAL_FORMAT).includes(format)) {
    throw new ProtocolError("visual_format must be a documented format type");
  }
  if (bitmap !== null && !(bitmap instanceof Uint8Array)) {
    throw new ProtocolError("visual_bitmap must be binary or null");
  }
  if (
    !Array.isArray(errors) ||
    errors.some((error) => typeof error !== "string")
  ) {
    throw new ProtocolError("errors must be an array of strings");
  }
  return {
    timestamp,
    uptime,
    isSafeMode,
    metrics: {
      battery: metrics[0],
      solar: metrics[1],
      ram: metrics[2],
      cpu: metrics[3],
    },
    visual: { format, bitmap: bitmap === null ? null : new Uint8Array(bitmap) },
    errors: [...errors],
  };
}

/**
 * @param {LxmTelemetry} telemetry
 * @returns {void}
 */
function assertTelemetry(telemetry) {
  if (telemetry === null || typeof telemetry !== "object") {
    throw new ProtocolError("telemetry must be a payload object");
  }
  assertTimestamp(telemetry.timestamp, "timestamp");
  assertTimestamp(telemetry.uptime, "uptime");
  if (typeof telemetry.isSafeMode !== "boolean") {
    throw new ProtocolError("is_safe_mode must be a boolean");
  }
  const { metrics, visual, errors } = telemetry;
  if (
    metrics === null ||
    typeof metrics !== "object" ||
    Array.isArray(metrics)
  ) {
    throw new ProtocolError(
      "device metrics must be a [battery, solar, ram, cpu] object",
    );
  }
  for (const key of ["battery", "solar", "ram", "cpu"]) {
    const value = metrics[key];
    if (value !== null && value !== undefined && typeof value !== "number") {
      throw new ProtocolError(`device metric ${key} must be a number or null`);
    }
  }
  if (visual === null || typeof visual !== "object" || Array.isArray(visual)) {
    throw new ProtocolError("visual state must be a { format, bitmap } object");
  }
  if (!Object.values(VISUAL_FORMAT).includes(visual.format)) {
    throw new ProtocolError("visual format must be a documented format type");
  }
  if (
    visual.bitmap !== null &&
    visual.bitmap !== undefined &&
    !(visual.bitmap instanceof Uint8Array)
  ) {
    throw new ProtocolError("visual bitmap must be binary or null");
  }
  if (
    !Array.isArray(errors) ||
    errors.some((error) => typeof error !== "string")
  ) {
    throw new ProtocolError("errors must be an array of strings");
  }
}

/**
 * @param {number} value
 * @param {string} field
 * @returns {void}
 */
function assertTimestamp(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new ProtocolError(`${field} must be non-negative epoch milliseconds`);
  }
}
