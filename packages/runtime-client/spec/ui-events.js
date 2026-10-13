import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMPONENT_TYPE,
  EXECUTION_STATE,
  encodeCompDetailRes,
  encodeCompManifest,
  encodeCrdtUpdate,
  encodeCrdtUpToDate,
  encodeProcessList,
  OP_TYPE,
} from "@noflo/fbp-protocol";
import { RuntimeClient } from "../src/index.js";
import { UiEventSurface } from "../src/ui-events.js";
import { FakeLink } from "./support/fake-link.js";

describe("UiEventSurface", () => {
  it("emits graph and components events on start", async () => {
    const link = new FakeLink();
    const client = new RuntimeClient({
      link,
      auth: { protocolVersion: 2, capabilityMask: 0x01 },
    });
    const surface = new UiEventSurface({ client });
    /** @type {string[]} */
    const events = [];
    surface.addEventListener("graph", () => events.push("graph"));
    surface.addEventListener("components", () => events.push("components"));

    const started = surface.start({ telemetry: false });
    // The graph sync: answer up-to-date
    link.deliver(encodeCrdtUpToDate(null, "0000"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The registry sync: manifest then details
    link.deliver(
      encodeCompManifest("reg-hash-1", {
        "math/Add": { sigHash: "a".repeat(64), type: "elementary" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    link.deliver(
      encodeCompDetailRes({
        "math/Add": {
          type: "elementary",
          in: [{ id: "a", type: "number", required: true }],
          out: [{ id: "sum", type: "number" }],
        },
      }),
    );
    await started;

    assert.deepEqual(events, ["graph", "components"]);
  });

  it("re-emits graph ops as graphchanged and 0x45 as processes", async () => {
    const link = new FakeLink();
    const client = new RuntimeClient({
      link,
      auth: { protocolVersion: 2, capabilityMask: 0x01 },
    });
    const surface = new UiEventSurface({ client });
    surface.start({ telemetry: false }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 10));

    /** @type {any[]} */
    const changed = [];
    /** @type {any[]} */
    const processes = [];
    surface.addEventListener("graphchanged", (e) => changed.push(e.detail));
    surface.addEventListener("processes", (e) => processes.push(e.detail));

    link.deliver(
      encodeCrdtUpdate({
        planeId: null,
        clientId: "c1",
        logicalClock: 1,
        opType: OP_TYPE.INSERT_NODE,
        entityId: "node-1",
        payload: { id: "node-1", component: "math/Add" },
      }),
    );
    link.deliver(
      encodeProcessList("epoch-1", {
        "node-1": {
          component: "math/Add",
          type: COMPONENT_TYPE.ELEMENTARY,
          state: EXECUTION_STATE.ENABLED,
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(changed.length, 1);
    assert.equal(changed[0].op.entityId, "node-1");
    assert.equal(processes.length, 1);
    assert.deepEqual(processes[0].entries, {
      "node-1": {
        component: "math/Add",
        type: "elementary",
        state: 0x01,
      },
    });
  });

  it("subscribes to telemetry on start by default", async () => {
    const link = new FakeLink();
    const client = new RuntimeClient({
      link,
      auth: { protocolVersion: 2, capabilityMask: 0x01 },
    });
    const surface = new UiEventSurface({ client });
    const started = surface.start();
    link.deliver(encodeCrdtUpToDate(null, "0000"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    link.deliver(
      encodeCompManifest("reg-hash-1", {
        "math/Add": { sigHash: "a".repeat(64), type: "elementary" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    link.deliver(
      encodeCompDetailRes({
        "math/Add": {
          type: "elementary",
          in: [{ id: "a", type: "number", required: true }],
          out: [{ id: "sum", type: "number" }],
        },
      }),
    );
    await started;
    // The last sent frame is the 0x30 telemetry subscription
    const last = link.sent[link.sent.length - 1];
    assert.equal(last[0], 0x95, "msgpack fixarray header");
    assert.equal(last[1], 0x30, "pubsub sub opcode");
  });
});
