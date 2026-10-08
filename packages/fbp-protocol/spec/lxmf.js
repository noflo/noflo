/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/lxmf.js
 * @description The offline LXMF store-and-forward telemetry payload.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  decodeLxmTelemetry,
  encodeLxmTelemetry,
  VISUAL_FORMAT,
} from "../src/index.js";

const sample = {
  timestamp: 1700000000000,
  uptime: 7200000,
  isSafeMode: false,
  metrics: { battery: 87, solar: 14, ram: 0.42, cpu: 0.11 },
  visual: {
    format: VISUAL_FORMAT.NETPBM_MONO_84,
    bitmap: new Uint8Array([1, 0, 1, 1]),
  },
  errors: ["sensor/timeout"],
};

describe("lxmf telemetry payload", () => {
  it("encodes the flat 6-element layout of work document #4 §8", () => {
    const decoded = decodeLxmTelemetry(encodeLxmTelemetry(sample));
    assert.equal(decoded.timestamp, 1700000000000);
    assert.equal(decoded.uptime, 7200000);
    assert.equal(decoded.isSafeMode, false);
    assert.deepEqual(decoded.metrics, {
      battery: 87,
      solar: 14,
      ram: 0.42,
      cpu: 0.11,
    });
    assert.equal(decoded.visual.format, VISUAL_FORMAT.NETPBM_MONO_84);
    assert.ok(decoded.visual.bitmap instanceof Uint8Array);
    assert.deepEqual([...decoded.visual.bitmap], [1, 0, 1, 1]);
    assert.deepEqual(decoded.errors, ["sensor/timeout"]);
  });

  it("allows null metrics and a null bitmap", () => {
    const decoded = decodeLxmTelemetry(
      encodeLxmTelemetry({
        ...sample,
        metrics: { battery: null, solar: null, ram: null, cpu: null },
        visual: { format: VISUAL_FORMAT.FONTAWESOME, bitmap: null },
        errors: [],
      }),
    );
    assert.deepEqual(decoded.metrics, {
      battery: null,
      solar: null,
      ram: null,
      cpu: null,
    });
    assert.equal(decoded.visual.bitmap, null);
  });

  it("rejects non-boolean safe mode", () => {
    assert.throws(
      () => encodeLxmTelemetry({ ...sample, isSafeMode: 1 }),
      Error,
    );
  });

  it("rejects unknown visual formats", () => {
    assert.throws(
      () =>
        encodeLxmTelemetry({
          ...sample,
          visual: { format: 0x99, bitmap: null },
        }),
      Error,
    );
  });

  it("rejects non-string errors", () => {
    assert.throws(() => encodeLxmTelemetry({ ...sample, errors: [42] }), Error);
  });
});
