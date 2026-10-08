/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/decode.js
 * @description Top-level frame dispatch: every link frame decodes through
 *   one entry point, keyed by its leading opcode.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  CMD_COMP_DETAIL_RES,
  CMD_FLOWTRACE_CHUNK,
  decodeFrame,
  encodeAnnounceAppData,
  encodeCompDetailRes,
  encodeCompInstallReq,
  encodeCompManifest,
  encodeCompSyncReq,
  encodeCompWrite,
  encodeCrdtStaleEpoch,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  encodeCrdtUpToDate,
  encodeFlowtraceChunk,
  encodePubsubSub,
  OP_TYPE,
  ProtocolError,
} from "../src/index.js";
import { encodeAuthResponse } from "../src/transport.js";

describe("decodeFrame", () => {
  it("dispatches every link-level frame to its typed decoder", async () => {
    const cases = [
      { bytes: encodeAuthResponse({ capabilityMask: 0x01 }), cmd: 0x02 },
      { bytes: encodeCrdtSyncReq(1, { a: 1 }), cmd: 0x10 },
      { bytes: encodeCrdtUpToDate(), cmd: 0x11 },
      { bytes: encodeCrdtStaleEpoch(2, "hash"), cmd: 0x12 },
      {
        bytes: encodeCrdtUpdate({
          clientId: "a",
          logicalClock: 1,
          opType: OP_TYPE.TOMBSTONE,
          entityId: "n",
          payload: null,
        }),
        cmd: 0x14,
      },
      { bytes: encodeCompSyncReq("h"), cmd: 0x20 },
      {
        bytes: encodeCompManifest("h", {
          "math/Add": { sigHash: "s", type: "elementary" },
        }),
        cmd: 0x22,
      },
      {
        bytes: encodeCompDetailRes({
          "math/Add": { type: "elementary", in: [], out: [] },
        }),
        cmd: CMD_COMP_DETAIL_RES,
      },
      { bytes: encodeCompWrite("math/Add", "source"), cmd: 0x25 },
      { bytes: encodeCompInstallReq("npm:x@1.0.0"), cmd: 0x27 },
      {
        bytes: encodePubsubSub({
          subId: "s",
          targetType: "graph",
          targetId: "g",
          requestedFlushIntervalMs: 0,
        }),
        cmd: 0x30,
      },
      {
        bytes: encodeFlowtraceChunk({
          subId: "s",
          baseTimestampMs: 0,
          events: [],
        }),
        cmd: CMD_FLOWTRACE_CHUNK,
      },
    ];
    for (const { bytes, cmd } of cases) {
      const decoded = decodeFrame(bytes);
      assert.equal(decoded.cmd, cmd);
    }
  });

  it("does not dispatch the 0xF0 file-format frame", async () => {
    // The snapshot is a file frame, not a link frame; importing it here
    // would drag the whole tracefile module into the dispatch table.
    const { encodeTraceSnapshot } = await import("../src/tracefile.js");
    assert.throws(
      () =>
        decodeFrame(
          encodeTraceSnapshot({ timestampMs: 0, graphDefinition: {} }),
        ),
      ProtocolError,
    );
  });

  it("rejects unknown opcodes with the value attached", () => {
    // fixarray(1) around opcode 0x55, assigned to nobody
    try {
      decodeFrame(new Uint8Array([0x91, 0x55]));
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof ProtocolError);
      assert.equal(error.opcode, 0x55);
    }
  });

  it("rejects frames that do not start with an opcode", () => {
    assert.throws(
      () =>
        decodeFrame(
          encodeAnnounceAppData({
            destinationHash: new Uint8Array(16),
            nodeName: "x",
          }),
        ),
      ProtocolError,
    );
  });
});
