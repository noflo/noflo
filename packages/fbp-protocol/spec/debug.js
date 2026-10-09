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
import { MsgPack } from "@reticulum/core";
import {
  CMD_BREAKPOINT_CLEAR,
  CMD_BREAKPOINT_SET,
  CMD_HWM_SET,
  CMD_PROCESS_CTRL,
  CMD_PROCESS_LIST,
  CMD_PROCESS_LIST_REQ,
  CMD_RUN_CTRL,
  COMPONENT_TYPE,
  decodeBreakpointClear,
  decodeBreakpointSet,
  decodeHwmSet,
  decodeProcessCtrl,
  decodeProcessList,
  decodeProcessListReq,
  decodeRunCtrl,
  EVENT_TYPE,
  EXECUTION_STATE,
  encodeBreakpointClear,
  encodeBreakpointSet,
  encodeHwmSet,
  encodeProcessCtrl,
  encodeProcessList,
  encodeProcessListReq,
  encodeRunCtrl,
  LIFECYCLE_CODE,
  PROCESS_ACTION,
  ProtocolError,
  RUN_ACTION,
} from "../src/index.js";

describe("0x40 CMD_RUN_CTRL", () => {
  it("round-trips every action", () => {
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
    assert.throws(() => encodeRunCtrl(0x06), ProtocolError);
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

describe("0x44/0x45 process listing", () => {
  it("round-trips a bare request", () => {
    const decoded = decodeProcessListReq(encodeProcessListReq());
    assert.equal(decoded.cmd, CMD_PROCESS_LIST_REQ);
    assert.deepEqual([...encodeProcessListReq()], [0x91, 0x44]);
  });

  it("round-trips the authoritative live view with declared kinds and execution states", () => {
    const decoded = decodeProcessList(
      encodeProcessList(7, {
        "node-1": {
          component: "math/Add",
          type: COMPONENT_TYPE.ELEMENTARY,
          state: EXECUTION_STATE.ENABLED,
        },
        "node-2": {
          component: "graphs/Pipeline",
          type: COMPONENT_TYPE.SUBGRAPH,
          state: EXECUTION_STATE.ENABLED,
        },
        "node-3": {
          component: "math/Divide",
          type: COMPONENT_TYPE.STUB,
          state: EXECUTION_STATE.DISABLED,
        },
      }),
    );
    assert.equal(decoded.cmd, CMD_PROCESS_LIST);
    assert.equal(decoded.epochId, 7);
    assert.deepEqual(decoded.entries["node-3"], {
      component: "math/Divide",
      type: COMPONENT_TYPE.STUB,
      state: EXECUTION_STATE.DISABLED,
    });
  });

  it("encodes entries as [component, kind, state] tuples on the wire", () => {
    const frame = MsgPack.decode(
      encodeProcessList(1, {
        "node-1": {
          component: "math/Add",
          type: COMPONENT_TYPE.ELEMENTARY,
          state: EXECUTION_STATE.ENABLED,
        },
      }),
    );
    assert.deepEqual(frame[2]["node-1"], ["math/Add", "elementary", 0x01]);
  });

  it("rejects undeclared kinds, unknown states, and malformed wire entries", () => {
    assert.throws(
      () =>
        encodeProcessList(1, {
          "node-1": {
            component: "x/Y",
            type: "inferred",
            state: EXECUTION_STATE.ENABLED,
          },
        }),
      ProtocolError,
    );
    assert.throws(
      () =>
        encodeProcessList(1, {
          "node-1": {
            component: "x/Y",
            type: COMPONENT_TYPE.ELEMENTARY,
            state: 0x03,
          },
        }),
      ProtocolError,
    );
    // fixarray(3) with an empty map for entries decodes fine, but a map
    // with a malformed tuple must not.
    const bad = MsgPack.encode([CMD_PROCESS_LIST, 1, { "node-1": "math/Add" }]);
    assert.throws(() => decodeProcessList(bad), ProtocolError);
  });
});

describe("0x46 CMD_HWM_SET", () => {
  it("round-trips bounded, synchronous, and unbounded marks", () => {
    for (const highWaterMark of [16, 0, null]) {
      const decoded = decodeHwmSet(encodeHwmSet(highWaterMark));
      assert.equal(decoded.cmd, CMD_HWM_SET);
      assert.equal(decoded.highWaterMark, highWaterMark);
    }
  });

  it("rejects negative and non-integer marks", () => {
    assert.throws(() => encodeHwmSet(-1), ProtocolError);
    assert.throws(() => encodeHwmSet(1.5), ProtocolError);
    assert.throws(() => encodeHwmSet("16"), ProtocolError);
    const frame = MsgPack.encode([CMD_HWM_SET, -1]);
    assert.throws(() => decodeHwmSet(frame), ProtocolError);
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
