import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeBreakpointSet,
  decodeHwmSet,
  decodePacketSend,
  decodeProcessCtrl,
  decodeRunCtrl,
  RUN_ACTION,
} from "@noflo/fbp-protocol";
import { ExecutionClient } from "../src/execution.js";

describe("ExecutionClient", () => {
  /** @type {Uint8Array[]} */
  let sent = [];
  let client = null;

  it("sends run control frames", async () => {
    sent = [];
    client = new ExecutionClient({
      send: async (p) => {
        sent.push(p);
      },
    });
    await client.runControl("PAUSE");
    assert.deepEqual(decodeRunCtrl(sent[0]), {
      cmd: 0x40,
      action: RUN_ACTION.PAUSE,
      planeId: undefined,
    });
    await client.runControl("STOP", "plane-1");
    assert.deepEqual(decodeRunCtrl(sent[1]), {
      cmd: 0x40,
      action: RUN_ACTION.STOP,
      planeId: "plane-1",
    });
  });

  it("sends breakpoints", async () => {
    sent = [];
    client = new ExecutionClient({
      send: async (p) => {
        sent.push(p);
      },
    });
    await client.setBreakpoint({
      breakpointId: "bp-1",
      nodeId: "node-1",
      port: "out",
    });
    assert.equal(decodeBreakpointSet(sent[0]).breakpointId, "bp-1");
    await client.clearBreakpoints();
  });

  it("sends process control and hwm frames", async () => {
    sent = [];
    client = new ExecutionClient({
      send: async (p) => {
        sent.push(p);
      },
    });
    await client.processControl("node-1", "DISABLE");
    const proc = decodeProcessCtrl(sent[0]);
    assert.equal(proc.nodeId, "node-1");
    await client.setHwm(64);
    assert.equal(decodeHwmSet(sent[1]).highWaterMark, 64);
  });

  it("sends packet injection frames", async () => {
    sent = [];
    client = new ExecutionClient({
      send: async (p) => {
        sent.push(p);
      },
    });
    await client.injectPacket({ port: "in", payload: 42 });
    const decoded = decodePacketSend(sent[0]);
    assert.equal(decoded.port, "in");
    assert.equal(decoded.payload, 42);
  });
});
