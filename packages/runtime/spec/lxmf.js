/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/lxmf.js
 * @description LXMF store-and-forward telemetry drops (work document #4
 *   §9): event-driven drops carry codec-encoded payloads, scheduled drops
 *   fire opportunistically with jitter, and failures never kill the
 *   schedule. The router is a fake — this verifies the policy and encoding,
 *   not LXMF's own wire format.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import { ProtocolError, decodeLxmTelemetry } from "@noflo/fbp-protocol";
import { LxmfTelemetry, TELEMETRY_FIELD } from "../src/lxmf.js";

const identity = {
  identityHash: new Uint8Array(16).fill(0x11),
};

/** A router fake recording every sent message. */
function fakeRouter() {
  /** @type {any[]} */
  const sent = [];
  return {
    sent,
    /**
     * @param {any} message
     * @returns {Promise<void>}
     */
    async send(message) {
      sent.push(message);
    },
  };
}

/** The current runtime state, as the host would report it. */
function currentState(overrides = {}) {
  return {
    timestamp: 1730000000000,
    uptime: 3600000,
    isSafeMode: false,
    metrics: { battery: 87, solar: 40, ram: 52, cpu: 12 },
    visual: { format: 0x02, bitmap: null },
    errors: [],
    ...overrides,
  };
}

describe("lxmf telemetry drops", () => {
  it("carries the codec-encoded flat array in the drop field", async () => {
    const router = fakeRouter();
    const drops = new LxmfTelemetry({
      router,
      identity,
      monitorHash: "a".repeat(32),
    });
    await drops.drop(currentState());
    assert.equal(router.sent.length, 1);
    const message = router.sent[0];
    assert.deepEqual(
      [...message.destinationHash],
      [...new Uint8Array(16).fill(0xaa)],
    );
    const payload = message.fields[TELEMETRY_FIELD];
    assert.ok(payload instanceof Uint8Array);
    // The drop decodes back to the runtime state through the codec.
    const decoded = decodeLxmTelemetry(payload);
    assert.equal(decoded.uptime, 3600000);
    assert.equal(decoded.isSafeMode, false);
    assert.deepEqual(decoded.metrics, {
      battery: 87,
      solar: 40,
      ram: 52,
      cpu: 12,
    });
  });

  it("delivers error conditions event-driven (update: §9)", async () => {
    const router = fakeRouter();
    const drops = new LxmfTelemetry({
      router,
      identity,
      monitorHash: "a".repeat(32),
    });
    await drops.drop(
      currentState({ errors: ["start failed: component threw"] }),
    );
    const decoded = decodeLxmTelemetry(router.sent[0].fields[TELEMETRY_FIELD]);
    assert.deepEqual(decoded.errors, ["start failed: component threw"]);
  });

  it("fires scheduled drops opportunistically, with jitter", async () => {
    const router = fakeRouter();
    const drops = new LxmfTelemetry({
      router,
      identity,
      monitorHash: "a".repeat(32),
      jitterFraction: 0.5,
    });
    let asked = 0;
    drops.scheduleDrops(() => {
      asked += 1;
      return currentState({ uptime: asked * 1000 });
    }, 40);
    // The mean interval is 40ms with ±50% jitter: within ~120ms at least
    // one drop fires, without asserting on the exact jitter draw.
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.ok(router.sent.length >= 1, "at least one scheduled drop fired");
    assert.ok(asked >= 1);
    drops.unschedule();
    const count = router.sent.length;
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(router.sent.length, count, "unschedule stops the drops");
  });

  it("survives provider failures without killing the schedule", async () => {
    const router = fakeRouter();
    const drops = new LxmfTelemetry({
      router,
      identity,
      monitorHash: "a".repeat(32),
      jitterFraction: 0,
    });
    let failing = true;
    /** @type {any[]} */
    const dropErrors = [];
    drops.addEventListener("droperror", (event) =>
      dropErrors.push(event.detail.error),
    );
    drops.scheduleDrops(() => {
      if (failing) {
        throw new Error("sensors offline");
      }
      return currentState();
    }, 40);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(dropErrors.length >= 1, "the failure surfaced as an event");
    failing = false;
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.ok(router.sent.length >= 1, "the schedule recovered");
    drops.unschedule();
  });

  it("does not flood: no schedule, no drops", () => {
    const router = fakeRouter();
    new LxmfTelemetry({ router, identity, monitorHash: "a".repeat(32) });
    // Constructing the drops without scheduling or explicit events sends
    // nothing — PoW-respecting by default.
    assert.equal(router.sent.length, 0);
  });

  it("rejects a malformed monitor hash at construction", () => {
    // A zero-filled destination would silently swallow telemetry; fail
    // fast instead.
    assert.throws(
      () =>
        new LxmfTelemetry({
          router: fakeRouter(),
          identity,
          monitorHash: "zzzz",
        }),
      ProtocolError,
    );
    assert.throws(
      () =>
        new LxmfTelemetry({
          router: fakeRouter(),
          identity,
          monitorHash: "abc",
        }),
      ProtocolError,
    );
  });
});
