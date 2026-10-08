/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module @noflo/fbp-protocol
 * @description `@noflo/fbp-protocol` — wire-format constants and codecs for
 *   FBP Protocol 2.0 over Reticulum (work document #4): flat positional
 *   MsgPack command frames, the announce app_data and auth handshake, the
 *   CRDT graph synchronization block, the Two-Step Cache component registry,
 *   streaming telemetry, and the streamable trace file format.
 */

/* @ts-self-types="./index.d.ts" */

export {
  CAPABILITY,
  CMD_AUTH_RESPONSE,
  CMD_COMP_DETAIL_REQ,
  CMD_COMP_DETAIL_RES,
  CMD_COMP_INSTALL_REQ,
  CMD_COMP_MANIFEST,
  CMD_COMP_SYNC_REQ,
  CMD_COMP_WRITE,
  CMD_CRDT_STALE_EPOCH,
  CMD_CRDT_SYNC_REQ,
  CMD_CRDT_UP_TO_DATE,
  CMD_CRDT_UPDATE,
  CMD_FLOWTRACE_CHUNK,
  CMD_PUBSUB_SUB,
  COMPONENT_TYPE,
  EVENT_TYPE,
  LIFECYCLE_CODE,
  LIMITATION,
  OP_TYPE,
  PROTOCOL_VERSION,
  TRACE_SNAPSHOT,
  VISUAL_FORMAT,
} from "./constants.js";

export { ProtocolError } from "./errors.js";
export {
  decodeCrdtStaleEpoch,
  decodeCrdtSyncReq,
  decodeCrdtUpdate,
  decodeCrdtUpToDate,
  encodeCrdtStaleEpoch,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  encodeCrdtUpToDate,
} from "./graph.js";
export {
  canonicalSignature,
  decodeCompDetailReq,
  decodeCompDetailRes,
  decodeCompInstallReq,
  decodeCompManifest,
  decodeCompSyncReq,
  decodeCompWrite,
  encodeCompDetailReq,
  encodeCompDetailRes,
  encodeCompInstallReq,
  encodeCompManifest,
  encodeCompSyncReq,
  encodeCompWrite,
  sigHash,
} from "./registry.js";
export {
  decodeAnnounceAppData,
  decodeAuthResponse,
  encodeAnnounceAppData,
  encodeAuthResponse,
} from "./transport.js";
