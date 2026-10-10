/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module @noflo/fbp-protocol
 * @description `@noflo/fbp-protocol` — wire-format constants and codecs for
 *   FBP Protocol 2.0 over Reticulum (work document #4): flat positional
 *   MsgPack command frames, the announce app_data and auth handshake, the
 *   CRDT graph synchronization block, the Two-Step Cache component registry,
 *   streaming telemetry, the execution control & debugging block, and the
 *   streamable trace file format.
 */

/* @ts-self-types="./index.d.ts" */

/**
 * A runtime-advertised component definition: declared kind and port
 * signatures.
 *
 * @typedef {import("./registry.js").ComponentDetail} ComponentDetail
 */

/**
 * A manifest entry for one component: signature hash and declared kind.
 *
 * @typedef {import("./registry.js").ManifestEntry} ManifestEntry
 */

/**
 * Registry manifest entries: component name to entry.
 *
 * @typedef {import("./registry.js").ManifestEntries} ManifestEntries
 */

/**
 * A port in a component signature.
 *
 * @typedef {import("./registry.js").PortInfo} PortInfo
 */

export {
  ANNOUNCE_ASPECT,
  CAPABILITY,
  CMD_AUTH_RESPONSE,
  CMD_BREAKPOINT_CLEAR,
  CMD_BREAKPOINT_SET,
  CMD_COMP_DETAIL_REQ,
  CMD_COMP_DETAIL_RES,
  CMD_COMP_INSTALL_REQ,
  CMD_COMP_MANIFEST,
  CMD_COMP_SOURCE,
  CMD_COMP_SYNC_REQ,
  CMD_COMP_UP_TO_DATE,
  CMD_COMP_WRITE,
  CMD_CRDT_STALE_EPOCH,
  CMD_CRDT_SYNC_REQ,
  CMD_CRDT_UP_TO_DATE,
  CMD_CRDT_UPDATE,
  CMD_FLOWTRACE_CHUNK,
  CMD_GET_STATUS,
  CMD_HWM_SET,
  CMD_OP_REJECTED,
  CMD_PACKET_SEND,
  CMD_PLANE_DROP,
  CMD_PLANE_LIST,
  CMD_PROCESS_CTRL,
  CMD_PROCESS_LIST,
  CMD_PROCESS_LIST_REQ,
  CMD_PUBSUB_SUB,
  CMD_RUN_CTRL,
  COMPONENT_TYPE,
  capabilitiesMask,
  EVENT_TYPE,
  EXECUTION_STATE,
  LIFECYCLE_CODE,
  LIMITATION,
  OP_TYPE,
  PLANE_KIND,
  PROCESS_ACTION,
  PROTOCOL_VERSION,
  RUN_ACTION,
  RUN_STATE,
  TRACE_SNAPSHOT,
  VISUAL_FORMAT,
} from "./constants.js";
export {
  decodeBreakpointClear,
  decodeBreakpointSet,
  decodeGetStatus,
  decodeGetStatusRes,
  decodeHwmSet,
  decodePacketSend,
  decodeProcessCtrl,
  decodeProcessList,
  decodeProcessListReq,
  decodeRunCtrl,
  encodeBreakpointClear,
  encodeBreakpointSet,
  encodeGetStatus,
  encodeGetStatusRes,
  encodeHwmSet,
  encodePacketSend,
  encodeProcessCtrl,
  encodeProcessList,
  encodeProcessListReq,
  encodeRunCtrl,
} from "./debug.js";
export { decodeFrame } from "./decode.js";
export { ProtocolError } from "./errors.js";
export {
  decodeCrdtStaleEpoch,
  decodeCrdtSyncReq,
  decodeCrdtUpdate,
  decodeCrdtUpToDate,
  decodeOpRejected,
  decodePlaneDrop,
  decodePlaneList,
  decodePlaneListRes,
  encodeCrdtStaleEpoch,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  encodeCrdtUpToDate,
  encodeOpRejected,
  encodePlaneDrop,
  encodePlaneList,
  encodePlaneListRes,
} from "./graph.js";
export {
  /**
   * One telemetry sample decoded from an LXMF drop: flat positional values
   * following work document #4 §9.
   *
   * @typedef {import("./lxmf.js").LxmTelemetry} LxmTelemetry
   */
  decodeLxmTelemetry,
  encodeLxmTelemetry,
} from "./lxmf.js";
export {
  canonicalManifest,
  canonicalSignature,
  decodeCompDetailReq,
  decodeCompDetailRes,
  decodeCompInstallReq,
  decodeCompManifest,
  decodeCompSourceReq,
  decodeCompSourceRes,
  decodeCompSyncReq,
  decodeCompUpToDate,
  decodeCompWrite,
  encodeCompDetailReq,
  encodeCompDetailRes,
  encodeCompInstallReq,
  encodeCompManifest,
  encodeCompSourceReq,
  encodeCompSourceRes,
  encodeCompSyncReq,
  encodeCompUpToDate,
  encodeCompWrite,
  registryHash,
  sigHash,
} from "./registry.js";
export {
  dataEventEnvelope,
  decodeFlowtraceChunk,
  decodePubsubSub,
  encodeFlowtraceChunk,
  encodeFlowtraceChunkFromTimestamps,
  encodePubsubSub,
} from "./telemetry.js";
export {
  assembleTraceFile,
  assembleTraceFileFromRecorder,
  encodeTraceSnapshot,
  readTraceFile,
} from "./tracefile.js";
export {
  decodeAnnounceAppData,
  decodeAuthResponse,
  encodeAnnounceAppData,
  encodeAuthResponse,
} from "./transport.js";
