import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EVENT_TYPE,
  encodeCrdtStaleEpoch,
  encodeFlowtraceChunkFromTimestamps,
  encodePlaneListRes,
  encodeProcessList,
} from "@noflo/fbp-protocol";
import { RuntimeClient } from "@noflo/runtime-client";
import {
  capture,
  clearBreakpoints,
  processes,
  replayTraceFile,
  runControl,
  sendPacket,
  setBreakpoint,
  setHwm,
  setProcessState,
  watch,
} from "../src/index.js";
import { FakeLink } from "./support/fake-link.js";

/** Build a session over a fake link. */
function makeSession() {
  const link = new FakeLink();
  const client = new RuntimeClient({
    link,
    auth: { protocolVersion: 2, capabilityMask: 0x03 },
  });
  return { link, session: { client, auth: client.auth, nodeName: "test" } };
}

describe("fbp-client execution commands", () => {
  it("runControl sends the 0x40 frame with the resolved action", async () => {
    const { link, session } = makeSession();
    await runControl(session, "pause");
    assert.equal(link.sent[0][0], 0x93, "fixarray(3)");
    assert.equal(link.sent[0][1], 0x40);
  });

  it("sendPacket injects via 0x47", async () => {
    const { link, session } = makeSession();
    await sendPacket(session, { port: "in", payload: "hello" });
    assert.equal(link.sent[0][1], 0x47);
  });

  it("breakpoints set and clear via 0x41/0x42", async () => {
    const { link, session } = makeSession();
    await setBreakpoint(session, {
      breakpointId: "bp-1",
      nodeId: "node-1",
      port: null,
    });
    assert.equal(link.sent[0][1], 0x41);
    await clearBreakpoints(session, "bp-1");
    assert.equal(link.sent[1][1], 0x42);
  });

  it("processes requests 0x44 and awaits the 0x45 reply", async () => {
    const { link, session } = makeSession();
    const pending = processes(session);
    setTimeout(() => {
      link.deliver(
        encodePlaneListRes([]), // a non-0x45 frame first: must be skipped
      );
      link.deliver(
        // Imported lazily to avoid widening the import list
        encodeProcessListForTest({
          "node-1": {
            component: "math/Add",
            type: "elementary",
            state: 0x01,
          },
        }),
      );
    }, 10);
    const entries = await pending;
    assert.deepEqual(Object.keys(entries), ["node-1"]);
  });

  it("setProcessState and setHwm send 0x43/0x46", async () => {
    const { link, session } = makeSession();
    await setProcessState(session, "node-1", "disable");
    assert.equal(link.sent[0][1], 0x43);
    await setHwm(session, 4);
    assert.equal(link.sent[1][1], 0x46);
  });
});

describe("fbp-client trace commands", () => {
  it("watch subscribes and re-emits decoded chunks", async () => {
    const { link, session } = makeSession();
    /** @type {any[]} */
    const chunks = [];
    const handle = await watch(session, {
      filtersTypes: [EVENT_TYPE.DATA],
      onChunk: (chunk) => chunks.push(chunk),
    });
    link.deliver(
      encodeFlowtraceChunkFromTimestamps({
        subId: "noflo-client-telemetry",
        planeId: null,
        events: [
          {
            timestampMs: 100,
            eventType: EVENT_TYPE.DATA,
            payload: { node: "a" },
          },
          {
            timestampMs: 150,
            eventType: EVENT_TYPE.CONSOLE,
            payload: { message: "noise" },
          },
        ],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].events.length, 1, "console noise filtered");
    assert.equal(chunks[0].events[0].payload.node, "a");
    // stop() detaches: no further chunks delivered
    handle.stop();
    link.deliver(
      encodeFlowtraceChunkFromTimestamps({
        subId: "noflo-client-telemetry",
        planeId: null,
        events: [{ timestampMs: 200, eventType: EVENT_TYPE.DATA, payload: {} }],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(chunks.length, 1, "detached after stop()");
  });

  it("capture produces a tracefile that replay reads back identically", async () => {
    const { link, session } = makeSession();
    const canonical = {
      name: "main",
      nodes: [{ entity_id: "node-1", component: "math/Add" }],
    };
    link.resources.set(
      "res-hash-1",
      new TextEncoder().encode(JSON.stringify(canonical)),
    );
    const capturePromise = capture(session, {
      durationMs: 50,
      runtimeMetadata: { nodeName: "test" },
    });
    // The graph sync handshake for the snapshot
    setTimeout(() => {
      link.deliver(encodeCrdtStaleEpoch(null, "epoch-7", "res-hash-1"));
    }, 10);
    // Telemetry during the capture window
    setTimeout(() => {
      link.deliver(
        encodeFlowtraceChunkFromTimestamps({
          subId: "noflo-client-telemetry",
          planeId: null,
          events: [
            {
              timestampMs: 1000,
              eventType: EVENT_TYPE.DATA,
              payload: { node: "node-1" },
            },
          ],
        }),
      );
    }, 30);
    const bytes = await capturePromise;
    assert.ok(bytes.length > 0);

    /** @type {any[]} */
    const replayed = [];
    const { snapshot, chunkCount } = replayTraceFile(bytes, {
      onChunk: (chunk) => replayed.push(chunk),
    });
    assert.equal(chunkCount, 1);
    assert.equal(snapshot.runtimeMetadata.nodeName, "test");
    assert.equal(snapshot.graphDefinition.name, "main");
    assert.equal(replayed.length, 1);
    assert.equal(replayed[0].events.length, 1);
    assert.equal(replayed[0].events[0].payload.node, "node-1");
    // The snapshot's graph definition matches the mirror
    assert.equal(snapshot.graphDefinition.nodes[0].entity_id, "node-1");
  });
});

/** Encode a 0x45 process listing for the test's node map. */
function encodeProcessListForTest(entries) {
  return encodeProcessList("epoch-1", entries);
}
