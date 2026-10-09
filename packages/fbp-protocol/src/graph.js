/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module graph
 * @description CRDT graph synchronization codecs (work document #4 §5): the
 *   epoch sync handshake (`0x10`–`0x12`) and the positional graph operation
 *   frame (`0x14`). Operations flow both directions, so runtime-initiated
 *   graph changes converge to connected clients. The op taxonomy is a
 *   projection of the changeset reference model owned by noflo-ui #43;
 *   modify is tombstone + insert at the wire level, never the semantic unit.
 */

import { MsgPack } from "@reticulum/core";
import {
  CMD_CRDT_STALE_EPOCH,
  CMD_CRDT_SYNC_REQ,
  CMD_CRDT_UP_TO_DATE,
  CMD_CRDT_UPDATE,
  OP_TYPE,
} from "./constants.js";
import { ProtocolError } from "./errors.js";

/**
 * An entity identifier in the graph: string ids as used by the native graph
 * model (work document #10).
 *
 * @typedef {string} EntityId
 */

/**
 * Payload of a `0x14` operation: the entity definition for inserts, the
 * tombstoned entity reference for removals, or the metadata map for UI
 * metadata ops. Its inner shape is the changeset projection's concern; the
 * wire carries it as an opaque MsgPack value.
 *
 * @typedef {any} CrdtPayload
 */

/**
 * Logical clocks of the participants in an epoch, keyed by client id.
 *
 * @typedef {Record<string, number>} ClientClocks
 */

/**
 * Encode a `0x10 CMD_CRDT_SYNC_REQ`: `[0x10, epoch_id, client_clocks]`.
 *
 * @param {number|string} epochId
 * @param {ClientClocks} clientClocks
 * @returns {Uint8Array}
 */
export function encodeCrdtSyncReq(epochId, clientClocks) {
  assertClocks(clientClocks);
  return MsgPack.encode([CMD_CRDT_SYNC_REQ, epochId, clientClocks]);
}

/**
 * Decode a `0x10 CMD_CRDT_SYNC_REQ`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, epochId: number|string, clientClocks: ClientClocks }}
 */
export function decodeCrdtSyncReq(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_CRDT_SYNC_REQ, 3);
  const [cmd, epochId, clocks] = frame;
  assertClocks(clocks, cmd);
  return { cmd, epochId, clientClocks: { ...clocks } };
}

/**
 * Encode a `0x11 CMD_CRDT_UP_TO_DATE`: `[0x11]`. Epochs match; no delta
 * transfer needed.
 *
 * @returns {Uint8Array}
 */
export function encodeCrdtUpToDate() {
  return MsgPack.encode([CMD_CRDT_UP_TO_DATE]);
}

/**
 * Decode a `0x11 CMD_CRDT_UP_TO_DATE`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number }}
 */
export function decodeCrdtUpToDate(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_CRDT_UP_TO_DATE, 1);
  return { cmd: CMD_CRDT_UP_TO_DATE };
}

/**
 * Encode a `0x12 CMD_CRDT_STALE_EPOCH`:
 * `[0x12, new_epoch_id, rns_resource_hash]`. Forces the client to fetch a
 * baseline snapshot via the Reticulum Resource API.
 *
 * @param {number|string} newEpochId
 * @param {string} rnsResourceHash
 * @returns {Uint8Array}
 */
export function encodeCrdtStaleEpoch(newEpochId, rnsResourceHash) {
  if (typeof rnsResourceHash !== "string" || rnsResourceHash.length === 0) {
    throw new ProtocolError(
      "rns_resource_hash must be a non-empty string",
      CMD_CRDT_STALE_EPOCH,
    );
  }
  return MsgPack.encode([CMD_CRDT_STALE_EPOCH, newEpochId, rnsResourceHash]);
}

/**
 * Decode a `0x12 CMD_CRDT_STALE_EPOCH`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, newEpochId: number|string, rnsResourceHash: string }}
 */
export function decodeCrdtStaleEpoch(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_CRDT_STALE_EPOCH, 3);
  const [cmd, newEpochId, rnsResourceHash] = frame;
  if (typeof rnsResourceHash !== "string" || rnsResourceHash.length === 0) {
    throw new ProtocolError(
      "rns_resource_hash must be a non-empty string",
      cmd,
    );
  }
  return { cmd, newEpochId, rnsResourceHash };
}

/**
 * Encode a `0x14 CMD_CRDT_UPDATE`:
 * `[0x14, client_id, logical_clock, op_type, entity_id, payload]`.
 *
 * @param {object} update
 * @param {string} update.clientId
 * @param {number} update.logicalClock Non-negative integer.
 * @param {number} update.opType One of {@link OP_TYPE}.
 * @param {EntityId} update.entityId
 * @param {CrdtPayload} update.payload
 * @returns {Uint8Array}
 */
export function encodeCrdtUpdate({
  clientId,
  logicalClock,
  opType,
  entityId,
  payload,
}) {
  assertOpType(opType);
  assertClock(logicalClock);
  return MsgPack.encode([
    CMD_CRDT_UPDATE,
    clientId,
    logicalClock,
    opType,
    entityId,
    payload,
  ]);
}

/**
 * Decode a `0x14 CMD_CRDT_UPDATE`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, clientId: string, logicalClock: number, opType: number, entityId: EntityId, payload: CrdtPayload }}
 */
export function decodeCrdtUpdate(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_CRDT_UPDATE, 6);
  const [cmd, clientId, logicalClock, opType, entityId, payload] = frame;
  if (typeof clientId !== "string" || clientId.length === 0) {
    throw new ProtocolError("client_id must be a non-empty string", cmd);
  }
  assertClock(logicalClock, cmd);
  assertOpType(opType, cmd);
  return { cmd, clientId, logicalClock, opType, entityId, payload };
}

/**
 * @param {any} frame
 * @param {number} opcode
 * @param {number} arity
 * @returns {void}
 */
function expectFrame(frame, opcode, arity) {
  if (!Array.isArray(frame) || frame[0] !== opcode) {
    throw new ProtocolError("unexpected frame opcode", opcode);
  }
  if (frame.length !== arity) {
    throw new ProtocolError(
      `frame must carry exactly ${arity} elements`,
      opcode,
    );
  }
}

/**
 * @param {number} clock
 * @param {number} [opcode]
 * @returns {void}
 */
function assertClock(clock, opcode) {
  if (!Number.isInteger(clock) || clock < 0) {
    throw new ProtocolError(
      "logical clock must be a non-negative integer",
      opcode,
    );
  }
}

/**
 * @param {number} opType
 * @param {number} [opcode]
 * @returns {void}
 */
function assertOpType(opType, opcode) {
  if (!Object.values(OP_TYPE).includes(opType)) {
    throw new ProtocolError("unknown op_type", opcode ?? CMD_CRDT_UPDATE);
  }
}

/**
 * @param {ClientClocks} clocks
 * @param {number} [opcode]
 * @returns {void}
 */
function assertClocks(clocks, opcode) {
  if (clocks === null || typeof clocks !== "object" || Array.isArray(clocks)) {
    throw new ProtocolError(
      "client clocks must be a map of client id to logical clock",
      opcode,
    );
  }
  for (const [clientId, clock] of Object.entries(clocks)) {
    if (typeof clientId !== "string" || clientId.length === 0) {
      throw new ProtocolError(
        "client clocks must be keyed by non-empty client ids",
        opcode,
      );
    }
    assertClock(clock, opcode);
  }
}
