/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/debug.js
 * @description Execution control and debugging codecs (the `0x40` block):
 *   run control round-trips with a golden byte vector, data breakpoints,
 *   breakpoint clearing, and per-process execution control, plus the
 *   notification conventions they rely on (`PAUSED`/`RESUMED` lifecycle
 *   codes and `BREAKPOINT_HIT` flowtrace events riding the telemetry
 *   stream).
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  CMD_BREAKPOINT_CLEAR,
  CMD_BREAKPOINT_SET,
  CMD_PROCESS_CTRL,
  CMD_RUN_CTRL,
  decodeBreakpointClear,
  decodeBreakpointSet,
  decodeProcessCtrl,
  decodeRunCtrl,
  EVENT_TYPE,
  encodeBreakpointClear,
  encodeBreakpointSet,
  encodeProcessCtrl,
  encodeRunCtrl,
  LIFECYCLE_CODE,
  PROCESS_ACTION,
  ProtocolError,
  RUN_ACTION,
} from "../src/index.js";

describe("0x40 CMD_RUN_CTRL", () => {
  it("round-trips pause, resume, and step", () => {
    for (const action of Object.values(RUN_ACTION)) {
      const decoded = decodeRunCtrl(encodeRunCtrl(action));
      assert.equal(decoded.cmd, CMD_RUN_CTRL);
      assert.equal(decoded.action, action);
    }
  });

  it("encodes the two-byte wire layout", () => {
    assert.deepEqual([...encodeRunCtrl(RUN_ACTION.PAUSE)], [0x92, 0x40, 0x01]);
  });

  it("rejects unknown actions", () => {
    assert.throws(() => encodeRunCtrl(0x04), ProtocolError);
    const frame = new Uint8Array([0x92, 0x40, 0x09]);
    assert.throws(() => decodeRunCtrl(frame), ProtocolError);
  });
});

describe("0x41 CMD_BREAKPOINT_SET", () => {
  it("round-trips a node-wide breakpoint", () => {
    const decoded = decodeBreakpointSet(
      encodeBreakpointSet({ breakpointId: "bp-1", nodeId: "node-1" }),
    );
    assert.equal(decoded.cmd, CMD_BREAKPOINT_SET);
    assert.equal(decoded.breakpointId, "bp-1");
    assert.equal(decoded.nodeId, "node-1");
    assert.equal(decoded.port, null);
  });

  it("round-trips a port-specific breakpoint and integer ids", () => {
    const decoded = decodeBreakpointSet(
      encodeBreakpointSet({ breakpointId: 7, nodeId: "node-2", port: "in" }),
    );
    assert.equal(decoded.breakpointId, 7);
    assert.equal(decoded.port, "in");
  });

  it("rejects empty node ids and malformed ports", () => {
    assert.throws(
      () => encodeBreakpointSet({ breakpointId: "bp", nodeId: "" }),
      ProtocolError,
    );
    assert.throws(
      () => encodeBreakpointSet({ breakpointId: "bp", nodeId: "n", port: "" }),
      ProtocolError,
    );
    assert.throws(
      () => encodeBreakpointSet({ breakpointId: "bp", nodeId: "n", port: 42 }),
      ProtocolError,
    );
  });

  it("rejects malformed breakpoint ids", () => {
    assert.throws(
      () => encodeBreakpointSet({ breakpointId: "", nodeId: "n" }),
      ProtocolError,
    );
    assert.throws(
      () => encodeBreakpointSet({ breakpointId: -1, nodeId: "n" }),
      ProtocolError,
    );
    assert.throws(
      () => encodeBreakpointSet({ breakpointId: null, nodeId: "n" }),
      ProtocolError,
    );
  });
});

describe("0x42 CMD_BREAKPOINT_CLEAR", () => {
  it("round-trips clearing one breakpoint", () => {
    const decoded = decodeBreakpointClear(encodeBreakpointClear("bp-1"));
    assert.equal(decoded.cmd, CMD_BREAKPOINT_CLEAR);
    assert.equal(decoded.breakpointId, "bp-1");
  });

  it("round-trips clearing every breakpoint with nil", () => {
    const decoded = decodeBreakpointClear(encodeBreakpointClear(null));
    assert.equal(decoded.breakpointId, null);
    assert.deepEqual([...encodeBreakpointClear(null)], [0x92, 0x42, 0xc0]);
  });

  it("rejects malformed ids", () => {
    assert.throws(() => encodeBreakpointClear(""), ProtocolError);
    assert.throws(() => encodeBreakpointClear(-3), ProtocolError);
  });
});

describe("0x43 CMD_PROCESS_CTRL", () => {
  it("round-trips disable and enable", () => {
    for (const action of Object.values(PROCESS_ACTION)) {
      const decoded = decodeProcessCtrl(
        encodeProcessCtrl({ nodeId: "node-1", action }),
      );
      assert.equal(decoded.cmd, CMD_PROCESS_CTRL);
      assert.equal(decoded.nodeId, "node-1");
      assert.equal(decoded.action, action);
    }
  });

  it("rejects unknown actions and empty node ids", () => {
    assert.throws(
      () => encodeProcessCtrl({ nodeId: "node-1", action: 0x03 }),
      ProtocolError,
    );
    assert.throws(
      () => encodeProcessCtrl({ nodeId: "", action: PROCESS_ACTION.DISABLE }),
      ProtocolError,
    );
  });
});

describe("debugging notification conventions", () => {
  it("announce run-state changes as PAUSED/RESUMED lifecycle codes", () => {
    // Ride the existing 0x06 LIFECYCLE event — no dedicated notification
    // frames. Pinned per work document #4 §8.
    assert.equal(LIFECYCLE_CODE.PAUSED, 0x05);
    assert.equal(LIFECYCLE_CODE.RESUMED, 0x06);
  });

  it("carry the breakpoint cause as a BREAKPOINT_HIT flowtrace event", () => {
    // Payload is [breakpoint_id, node_id, port]; the packet itself travels
    // as its own 0x01 DATA event.
    assert.equal(EVENT_TYPE.BREAKPOINT_HIT, 0x08);
  });
});
