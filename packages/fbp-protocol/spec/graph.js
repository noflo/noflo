/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/graph.js
 * @description CRDT graph synchronization codecs: round-trips, golden
 *   vectors, and validation of the epoch handshake and `0x14` operations.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  CMD_CRDT_STALE_EPOCH,
  CMD_CRDT_SYNC_REQ,
  CMD_CRDT_UP_TO_DATE,
  CMD_CRDT_UPDATE,
  decodeCrdtStaleEpoch,
  decodeCrdtSyncReq,
  decodeCrdtUpdate,
  decodeCrdtUpToDate,
  encodeCrdtStaleEpoch,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  encodeCrdtUpToDate,
  OP_TYPE,
  ProtocolError,
} from "../src/index.js";

describe("0x11 CMD_CRDT_UP_TO_DATE", () => {
  it("is a two-byte frame", () => {
    assert.deepEqual([...encodeCrdtUpToDate()], [0x91, 0x11]);
    assert.deepEqual(decodeCrdtUpToDate(encodeCrdtUpToDate()), {
      cmd: CMD_CRDT_UP_TO_DATE,
    });
  });
});

describe("0x10 CMD_CRDT_SYNC_REQ", () => {
  it("round-trips epoch and client clocks", () => {
    const decoded = decodeCrdtSyncReq(
      encodeCrdtSyncReq(7, { client_a: 15, client_b: 3 }),
    );
    assert.equal(decoded.cmd, CMD_CRDT_SYNC_REQ);
    assert.equal(decoded.epochId, 7);
    assert.deepEqual(decoded.clientClocks, { client_a: 15, client_b: 3 });
  });

  it("rejects non-integer or negative clocks", () => {
    assert.throws(() => encodeCrdtSyncReq(7, { client_a: 1.5 }), ProtocolError);
    assert.throws(
      () => decodeCrdtSyncReq(encodeCrdtSyncReq(7, { client_a: -1 })),
      ProtocolError,
    );
  });

  it("rejects frames with the wrong arity", () => {
    // fixarray(2): opcode + epoch, clocks missing
    assert.throws(
      () => decodeCrdtSyncReq(new Uint8Array([0x92, 0x10, 0x07])),
      ProtocolError,
    );
  });
});

describe("0x12 CMD_CRDT_STALE_EPOCH", () => {
  it("round-trips the new epoch and resource hash", () => {
    const decoded = decodeCrdtStaleEpoch(encodeCrdtStaleEpoch(8, "res-hash-1"));
    assert.equal(decoded.cmd, CMD_CRDT_STALE_EPOCH);
    assert.equal(decoded.newEpochId, 8);
    assert.equal(decoded.rnsResourceHash, "res-hash-1");
  });

  it("rejects an empty resource hash", () => {
    assert.throws(() => encodeCrdtStaleEpoch(8, ""), ProtocolError);
  });
});

describe("0x14 CMD_CRDT_UPDATE", () => {
  it("round-trips a node insert", () => {
    const update = {
      clientId: "client_a",
      logicalClock: 16,
      opType: OP_TYPE.INSERT_NODE,
      entityId: "node-1",
      payload: { component: "math/Add", x: 0, y: 0 },
    };
    const decoded = decodeCrdtUpdate(encodeCrdtUpdate(update));
    assert.equal(decoded.cmd, CMD_CRDT_UPDATE);
    assert.equal(decoded.clientId, "client_a");
    assert.equal(decoded.logicalClock, 16);
    assert.equal(decoded.opType, OP_TYPE.INSERT_NODE);
    assert.equal(decoded.entityId, "node-1");
    assert.deepEqual(decoded.payload, { component: "math/Add", x: 0, y: 0 });
  });

  it("round-trips a tombstone with a null payload", () => {
    const decoded = decodeCrdtUpdate(
      encodeCrdtUpdate({
        clientId: "runtime",
        logicalClock: 17,
        opType: OP_TYPE.TOMBSTONE,
        entityId: "node-1",
        payload: null,
      }),
    );
    assert.equal(decoded.opType, OP_TYPE.TOMBSTONE);
    assert.equal(decoded.payload, null);
  });

  it("rejects unknown op types", () => {
    assert.throws(
      () =>
        encodeCrdtUpdate({
          clientId: "a",
          logicalClock: 1,
          opType: 0x99,
          entityId: "n",
          payload: null,
        }),
      ProtocolError,
    );
  });

  it("rejects non-integer logical clocks", () => {
    assert.throws(
      () =>
        encodeCrdtUpdate({
          clientId: "a",
          logicalClock: 0.5,
          opType: OP_TYPE.TOMBSTONE,
          entityId: "n",
          payload: null,
        }),
      ProtocolError,
    );
  });

  it("rejects frames with the wrong arity", () => {
    // fixarray(5): one element short of the six the opcode requires
    assert.throws(
      () =>
        decodeCrdtUpdate(
          new Uint8Array([0x95, 0x14, 0xa1, 0x61, 0x01, 0x01, 0x01]),
        ),
      ProtocolError,
    );
  });
});
