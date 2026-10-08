/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module decode
 * @description Top-level frame dispatch: decode any link-level protocol
 *   frame by its leading opcode. Every decoder returns an object whose
 *   `cmd` field carries the command code, so a message pump can switch on
 *   one value and hand type-shaped payloads to handlers. The `0xF0` trace
 *   snapshot is a file format, not a link frame, and is deliberately not
 *   dispatchable here.
 */

import { MsgPack } from "@reticulum/core";
import {
  CMD_AUTH_RESPONSE,
  CMD_BREAKPOINT_CLEAR,
  CMD_BREAKPOINT_SET,
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
  CMD_HWM_SET,
  CMD_PROCESS_CTRL,
  CMD_PROCESS_LIST,
  CMD_PROCESS_LIST_REQ,
  CMD_PUBSUB_SUB,
  CMD_RUN_CTRL,
} from "./constants.js";
import {
  decodeBreakpointClear,
  decodeBreakpointSet,
  decodeHwmSet,
  decodeProcessCtrl,
  decodeProcessList,
  decodeProcessListReq,
  decodeRunCtrl,
} from "./debug.js";
import { ProtocolError } from "./errors.js";
import {
  decodeCrdtStaleEpoch,
  decodeCrdtSyncReq,
  decodeCrdtUpdate,
  decodeCrdtUpToDate,
} from "./graph.js";
import {
  decodeCompDetailReq,
  decodeCompDetailRes,
  decodeCompInstallReq,
  decodeCompManifest,
  decodeCompSyncReq,
  decodeCompWrite,
} from "./registry.js";
import { decodeFlowtraceChunk, decodePubsubSub } from "./telemetry.js";
import { decodeAuthResponse } from "./transport.js";

/**
 * Any decoded protocol frame: a `cmd` discriminator plus the command's
 * fields, shaped by the command's own decoder.
 *
 * @typedef {ReturnType<
 *   typeof decodeAuthResponse | typeof decodeCrdtSyncReq | typeof decodeCrdtUpToDate |
 *   typeof decodeCrdtStaleEpoch | typeof decodeCrdtUpdate | typeof decodeCompSyncReq |
 *   typeof decodeCompManifest | typeof decodeCompDetailReq | typeof decodeCompDetailRes |
 *   typeof decodeCompWrite | typeof decodeCompInstallReq | typeof decodePubsubSub |
 *   typeof decodeFlowtraceChunk | typeof decodeRunCtrl | typeof decodeBreakpointSet |
 *   typeof decodeBreakpointClear | typeof decodeProcessCtrl | typeof decodeProcessListReq |
 *   typeof decodeProcessList | typeof decodeHwmSet
 * >} DecodedFrame
 */

/**
 * Decode a link-level protocol frame by its leading opcode.
 *
 * @param {Uint8Array} bytes
 * @returns {DecodedFrame}
 * @throws {ProtocolError} On an unknown opcode or a malformed frame.
 */
export function decodeFrame(bytes) {
  const head = MsgPack.decode(bytes);
  const opcode = Array.isArray(head) ? head[0] : undefined;
  switch (opcode) {
    case CMD_AUTH_RESPONSE:
      return decodeAuthResponse(bytes);
    case CMD_CRDT_SYNC_REQ:
      return decodeCrdtSyncReq(bytes);
    case CMD_CRDT_UP_TO_DATE:
      return decodeCrdtUpToDate(bytes);
    case CMD_CRDT_STALE_EPOCH:
      return decodeCrdtStaleEpoch(bytes);
    case CMD_CRDT_UPDATE:
      return decodeCrdtUpdate(bytes);
    case CMD_COMP_SYNC_REQ:
      return decodeCompSyncReq(bytes);
    case CMD_COMP_MANIFEST:
      return decodeCompManifest(bytes);
    case CMD_COMP_DETAIL_REQ:
      return decodeCompDetailReq(bytes);
    case CMD_COMP_DETAIL_RES:
      return decodeCompDetailRes(bytes);
    case CMD_COMP_WRITE:
      return decodeCompWrite(bytes);
    case CMD_COMP_INSTALL_REQ:
      return decodeCompInstallReq(bytes);
    case CMD_PUBSUB_SUB:
      return decodePubsubSub(bytes);
    case CMD_FLOWTRACE_CHUNK:
      return decodeFlowtraceChunk(bytes);
    case CMD_RUN_CTRL:
      return decodeRunCtrl(bytes);
    case CMD_BREAKPOINT_SET:
      return decodeBreakpointSet(bytes);
    case CMD_BREAKPOINT_CLEAR:
      return decodeBreakpointClear(bytes);
    case CMD_PROCESS_CTRL:
      return decodeProcessCtrl(bytes);
    case CMD_PROCESS_LIST_REQ:
      return decodeProcessListReq(bytes);
    case CMD_PROCESS_LIST:
      return decodeProcessList(bytes);
    case CMD_HWM_SET:
      return decodeHwmSet(bytes);
    default:
      throw new ProtocolError(
        opcode === undefined
          ? "frame does not start with an opcode"
          : "unknown command code",
        typeof opcode === "number" ? opcode : undefined,
      );
  }
}
