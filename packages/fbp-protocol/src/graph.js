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
/* @ts-self-types="./graph.d.ts" */

import { MsgPack } from "@reticulum/core";
import {
  CMD_CRDT_STALE_EPOCH,
  CMD_CRDT_SYNC_REQ,
  CMD_CRDT_UP_TO_DATE,
  CMD_CRDT_UPDATE,
  CMD_OP_REJECTED,
  CMD_PLANE_DROP,
  CMD_PLANE_LIST,
  OP_TYPE,
  PLANE_KIND,
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
 * Encode a `0x10 CMD_CRDT_SYNC_REQ`: `[0x10, plane_id, epoch_id, client_clocks]`.
 * The plane id addresses the graph instance — nil is the runtime's main
 * graph, a client-minted id opens an ephemeral plane (work document #4
 * updates #26/#33). Epochs are per plane.
 *
 * @param {number|string|null} planeId nil addresses the main plane.
 * @param {number|string} epochId
 * @param {ClientClocks} clientClocks
 * @returns {Uint8Array}
 */
export function encodeCrdtSyncReq(planeId, epochId, clientClocks) {
  assertClocks(clientClocks);
  return MsgPack.encode([CMD_CRDT_SYNC_REQ, planeId, epochId, clientClocks]);
}

/**
 * Decode a `0x10 CMD_CRDT_SYNC_REQ`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, planeId: number|string|null, epochId: number|string, clientClocks: ClientClocks }}
 */
export function decodeCrdtSyncReq(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_CRDT_SYNC_REQ, 4);
  const [cmd, planeId, epochId, clocks] = frame;
  assertClocks(clocks, cmd);
  return { cmd, planeId, epochId, clientClocks: { ...clocks } };
}

/**
 * Encode a `0x11 CMD_CRDT_UP_TO_DATE`: `[0x11, plane_id, epoch_id]`.
 * Epochs match; no delta transfer needed. The reply names the plane and its
 * epoch so even an up-to-date client learns what it is synced to (work
 * document #4 update #26).
 *
 * @param {number|string|null} planeId
 * @param {number|string} epochId
 * @returns {Uint8Array}
 */
export function encodeCrdtUpToDate(planeId, epochId) {
  return MsgPack.encode([CMD_CRDT_UP_TO_DATE, planeId, epochId]);
}

/**
 * Decode a `0x11 CMD_CRDT_UP_TO_DATE`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, planeId: number|string|null, epochId: number|string }}
 */
export function decodeCrdtUpToDate(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_CRDT_UP_TO_DATE, 3);
  const [cmd, planeId, epochId] = frame;
  return { cmd, planeId, epochId };
}

/**
 * Encode a `0x12 CMD_CRDT_STALE_EPOCH`:
 * `[0x12, plane_id, new_epoch_id, rns_resource_hash]`. Forces the client to
 * fetch a baseline snapshot via the Reticulum Resource API. The plane id
 * names the plane the stale epoch belongs to (work document #4 update
 * #26).
 *
 * @param {number|string|null} planeId
 * @param {number|string} newEpochId
 * @param {string} rnsResourceHash
 * @returns {Uint8Array}
 */
export function encodeCrdtStaleEpoch(planeId, newEpochId, rnsResourceHash) {
  if (typeof rnsResourceHash !== "string" || rnsResourceHash.length === 0) {
    throw new ProtocolError(
      "rns_resource_hash must be a non-empty string",
      CMD_CRDT_STALE_EPOCH,
    );
  }
  return MsgPack.encode([
    CMD_CRDT_STALE_EPOCH,
    planeId,
    newEpochId,
    rnsResourceHash,
  ]);
}

/**
 * Decode a `0x12 CMD_CRDT_STALE_EPOCH`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, planeId: number|string|null, newEpochId: number|string, rnsResourceHash: string }}
 */
export function decodeCrdtStaleEpoch(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_CRDT_STALE_EPOCH, 4);
  const [cmd, planeId, newEpochId, rnsResourceHash] = frame;
  if (typeof rnsResourceHash !== "string" || rnsResourceHash.length === 0) {
    throw new ProtocolError(
      "rns_resource_hash must be a non-empty string",
      cmd,
    );
  }
  return { cmd, planeId, newEpochId, rnsResourceHash };
}

/**
 * Encode a `0x14 CMD_CRDT_UPDATE`:
 * `[0x14, plane_id, client_id, logical_clock, op_type, entity_id, payload]`.
 * The plane id addresses the graph instance the op applies to — nil is the
 * main graph (work document #4 update #33).
 *
 * @param {object} update
 * @param {number|string|null} update.planeId nil addresses the main plane.
 * @param {string} update.clientId
 * @param {number} update.logicalClock Non-negative integer.
 * @param {number} update.opType One of {@link OP_TYPE}.
 * @param {EntityId} update.entityId
 * @param {CrdtPayload} update.payload
 * @returns {Uint8Array}
 */
export function encodeCrdtUpdate({
  planeId,
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
    planeId,
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
 * @returns {{ cmd: number, planeId: number|string|null, clientId: string, logicalClock: number, opType: number, entityId: EntityId, payload: CrdtPayload }}
 */
export function decodeCrdtUpdate(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_CRDT_UPDATE, 7);
  const [cmd, planeId, clientId, logicalClock, opType, entityId, payload] =
    frame;
  if (typeof clientId !== "string" || clientId.length === 0) {
    throw new ProtocolError("client_id must be a non-empty string", cmd);
  }
  assertClock(logicalClock, cmd);
  assertOpType(opType, cmd);
  return {
    cmd,
    planeId,
    clientId,
    logicalClock,
    opType,
    entityId,
    payload,
  };
}

/**
 * Encode a `0x15 CMD_PLANE_DROP`: `[0x15, plane_id]` — stop the plane's
 * network and discard its state wholesale (work document #4 update #27).
 * The main plane is not droppable; nil is rejected by the runtime.
 *
 * @param {number|string} planeId
 * @returns {Uint8Array}
 */
export function encodePlaneDrop(planeId) {
  if (planeId === null || planeId === undefined) {
    throw new ProtocolError(
      "the main plane is not droppable; name an ephemeral plane",
      CMD_PLANE_DROP,
    );
  }
  return MsgPack.encode([CMD_PLANE_DROP, planeId]);
}

/**
 * Decode a `0x15 CMD_PLANE_DROP`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, planeId: number|string }}
 */
export function decodePlaneDrop(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_PLANE_DROP, 2);
  const [cmd, planeId] = frame;
  if (planeId === null || planeId === undefined) {
    throw new ProtocolError("the main plane is not droppable", cmd);
  }
  return { cmd, planeId };
}

/**
 * One entry of a `0x16` plane listing: a running graph instance and its
 * anchor in the graph tree (work document #4 update #33). For subgraph
 * planes `parentPlane` and `nodeId` anchor the instance; for the main plane
 * both are nil; for ephemera the client's minted `name` labels it.
 *
 * @typedef {object} PlaneEntry
 * @property {number|string} planeId Runtime-assigned plane identifier.
 * @property {string} kind One of {@link PLANE_KIND}.
 * @property {number|string|null} parentPlane The plane this instance hangs
 *   off; nil for the main plane.
 * @property {string|null} nodeId The node id anchoring this subgraph
 *   instance in its parent; nil for the main plane.
 * @property {string|null} componentName The catalog component the plane
 *   instantiates; nil for ephemera.
 * @property {string} name Display name — the component's, or the
 *   client-minted label for ephemera.
 */

/**
 * Encode a `0x16 CMD_PLANE_LIST` request: `[0x16]`.
 *
 * @returns {Uint8Array}
 */
export function encodePlaneList() {
  return MsgPack.encode([CMD_PLANE_LIST]);
}

/**
 * Decode a `0x16 CMD_PLANE_LIST` request.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number }}
 */
export function decodePlaneList(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_PLANE_LIST, 1);
  return { cmd: CMD_PLANE_LIST };
}

/**
 * Encode a `0x16` plane listing (the runtime's reply on the same opcode):
 * `[0x16, [entries]]`.
 *
 * @param {PlaneEntry[]} entries
 * @returns {Uint8Array}
 */
export function encodePlaneListRes(entries) {
  assertPlaneEntries(entries);
  return MsgPack.encode([
    CMD_PLANE_LIST,
    entries.map((entry) => [
      entry.planeId,
      entry.kind,
      entry.parentPlane ?? null,
      entry.nodeId ?? null,
      entry.componentName ?? null,
      entry.name,
    ]),
  ]);
}

/**
 * Decode a `0x16` plane listing.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, entries: PlaneEntry[] }}
 */
export function decodePlaneListRes(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_PLANE_LIST, 2);
  const [cmd, raw] = frame;
  if (!Array.isArray(raw)) {
    throw new ProtocolError("the plane listing must be an array", cmd);
  }
  const entries = raw.map((tuple) => {
    if (!Array.isArray(tuple) || tuple.length !== 6) {
      throw new ProtocolError(
        "each plane entry must be a 6-element tuple",
        cmd,
      );
    }
    const [planeId, kind, parentPlane, nodeId, componentName, name] = tuple;
    if (!Object.values(PLANE_KIND).includes(kind)) {
      throw new ProtocolError("unknown plane kind", cmd);
    }
    if (typeof name !== "string" || name.length === 0) {
      throw new ProtocolError("plane name must be a non-empty string", cmd);
    }
    return {
      planeId,
      kind,
      parentPlane,
      nodeId,
      componentName,
      name,
    };
  });
  return { cmd: CMD_PLANE_LIST, entries };
}

/**
 * Encode a `0x17 CMD_OP_REJECTED`: the runtime's explicit "no" —
 * `[0x17, rejected_cmd, plane_id, detail]` (work document #4 updates
 * #34/#35). For rejected `0x14` operations the detail carries
 * `{ client_id, logical_clock, entity_id, reason }` so the client reverts
 * the op in its mirror; for other commands it carries `{ reason }` plus
 * whatever context the rejection needs.
 *
 * @param {object} rejection
 * @param {number} rejection.rejectedCmd The command code that was refused.
 * @param {number|string|null} rejection.planeId The plane the refused
 *   command targeted; nil for runtime-scoped commands.
 * @param {any} rejection.detail
 * @returns {Uint8Array}
 */
export function encodeOpRejected({ rejectedCmd, planeId, detail }) {
  return MsgPack.encode([CMD_OP_REJECTED, rejectedCmd, planeId, detail]);
}

/**
 * Decode a `0x17 CMD_OP_REJECTED`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, rejectedCmd: number, planeId: number|string|null, detail: any }}
 */
export function decodeOpRejected(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_OP_REJECTED, 4);
  const [cmd, rejectedCmd, planeId, detail] = frame;
  if (!Number.isInteger(rejectedCmd)) {
    throw new ProtocolError("rejected_cmd must be a command code", cmd);
  }
  return { cmd, rejectedCmd, planeId, detail };
}

/**
 * @param {PlaneEntry[]} entries
 * @returns {void}
 */
function assertPlaneEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new ProtocolError("plane entries must be an array", CMD_PLANE_LIST);
  }
  for (const entry of entries) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      !Object.values(PLANE_KIND).includes(entry.kind) ||
      typeof entry.name !== "string" ||
      entry.name.length === 0
    ) {
      throw new ProtocolError(
        "each plane entry needs a kind from the vocabulary and a name",
        CMD_PLANE_LIST,
      );
    }
  }
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
