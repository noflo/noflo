/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module transport
 * @description Transport and identity codecs (work document #4 §3–§4): the
 *   announce app_data that advertises the protocol generation and connection
 *   coordinates, and the `0x02 CMD_AUTH_RESPONSE` handshake sent after
 *   Reticulum link establishment. Auth itself is delegated to the transport
 *   layer (`link.identify()`); nothing here carries secrets.
 */
/* @ts-self-types="./transport.d.ts" */

import { MsgPack } from "@reticulum/core";
import {
  CMD_AUTH_RESPONSE,
  LIMITATION,
  PROTOCOL_VERSION,
} from "./constants.js";
import { ProtocolError } from "./errors.js";

const DESTINATION_HASH_BYTES = 16;

/**
 * A Reticulum destination hash: raw 16 bytes or its 32-character hex form.
 *
 * @typedef {Uint8Array|string} DestinationHash
 */

/**
 * Encode the announce app_data: `msgpack([ protocol_version,
 * destination_hash_raw16, node_name ])` (work document #4 §3). The version
 * comes first so a scanner can reject an incompatible announce after
 * decoding a single fixint.
 *
 * @param {object} options
 * @param {number} [options.protocolVersion] Defaults to {@link PROTOCOL_VERSION}.
 * @param {DestinationHash} options.destinationHash Raw 16 bytes or hex string.
 * @param {string} options.nodeName Human-readable runtime node name.
 * @returns {Uint8Array}
 */
export function encodeAnnounceAppData({
  protocolVersion = PROTOCOL_VERSION,
  destinationHash,
  nodeName,
}) {
  return MsgPack.encode([
    protocolVersion,
    destinationHashBytes(destinationHash),
    nodeName,
  ]);
}

/**
 * Decode an announce app_data payload.
 *
 * @param {Uint8Array} bytes
 * @returns {{ protocolVersion: number, destinationHash: Uint8Array, destinationHashHex: string, nodeName: string }}
 */
export function decodeAnnounceAppData(bytes) {
  const frame = MsgPack.decode(bytes);
  if (!Array.isArray(frame) || frame.length !== 3) {
    throw new ProtocolError("announce app_data must be a 3-element array");
  }
  const [protocolVersion, destinationHash, nodeName] = frame;
  if (!Number.isInteger(protocolVersion) || protocolVersion < 0) {
    throw new ProtocolError(
      "announce app_data protocol_version must be a uint",
    );
  }
  const hash = destinationHashBytes(destinationHash);
  return {
    protocolVersion,
    destinationHash: hash,
    destinationHashHex: hashHex(hash),
    nodeName,
  };
}

/**
 * Encode a `0x02 CMD_AUTH_RESPONSE`: `[0x02, protocol_version,
 * capability_mask, limitation_code]` (work document #4 §4, version byte per
 * update #6). Sent unilaterally after Reticulum fires `link_established`
 * with a verified identity.
 *
 * @param {object} options
 * @param {number} [options.protocolVersion] Defaults to {@link PROTOCOL_VERSION}.
 * @param {number} options.capabilityMask Bitwise {@link CAPABILITY} mask.
 * @param {number} [options.limitationCode] One of {@link LIMITATION}; defaults to full access.
 * @returns {Uint8Array}
 */
export function encodeAuthResponse({
  protocolVersion = PROTOCOL_VERSION,
  capabilityMask,
  limitationCode = LIMITATION.FULL_ACCESS,
}) {
  return MsgPack.encode([
    CMD_AUTH_RESPONSE,
    protocolVersion,
    capabilityMask,
    limitationCode,
  ]);
}

/**
 * Decode a `0x02 CMD_AUTH_RESPONSE`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, protocolVersion: number, capabilityMask: number, limitationCode: number }}
 * @throws {ProtocolError} On a non-`0x02` frame or malformed payload.
 */
export function decodeAuthResponse(bytes) {
  const frame = MsgPack.decode(bytes);
  if (!Array.isArray(frame) || frame[0] !== CMD_AUTH_RESPONSE) {
    throw new ProtocolError(
      "expected an auth response frame",
      CMD_AUTH_RESPONSE,
    );
  }
  if (frame.length !== 4) {
    throw new ProtocolError(
      "auth response must carry opcode, protocol_version, capability_mask, and limitation_code",
      CMD_AUTH_RESPONSE,
    );
  }
  const [, protocolVersion, capabilityMask, limitationCode] = frame;
  for (const field of [protocolVersion, capabilityMask, limitationCode]) {
    if (!Number.isInteger(field) || field < 0 || field > 0xff) {
      throw new ProtocolError(
        "auth response fields must be uint8 values",
        CMD_AUTH_RESPONSE,
      );
    }
  }
  return {
    cmd: CMD_AUTH_RESPONSE,
    protocolVersion,
    capabilityMask,
    limitationCode,
  };
}

/**
 * Coerce a destination hash in either accepted form to raw 16 bytes.
 *
 * @param {DestinationHash} value
 * @returns {Uint8Array}
 * @throws {ProtocolError} On a wrong-length or malformed hash.
 */
export function destinationHashBytes(value) {
  if (typeof value === "string") {
    const cleaned = value.startsWith("0x") ? value.slice(2) : value;
    if (
      !/^[0-9a-fA-F]+$/.test(cleaned) ||
      cleaned.length !== DESTINATION_HASH_BYTES * 2
    ) {
      throw new ProtocolError(
        "destination hash hex string must carry exactly 16 bytes",
      );
    }
    const bytes = new Uint8Array(DESTINATION_HASH_BYTES);
    for (let i = 0; i < DESTINATION_HASH_BYTES; i++) {
      bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  if (value instanceof Uint8Array) {
    if (value.byteLength !== DESTINATION_HASH_BYTES) {
      throw new ProtocolError(
        `destination hash must be exactly ${DESTINATION_HASH_BYTES} bytes, got ${value.byteLength}`,
      );
    }
    return value;
  }
  throw new ProtocolError("destination hash must be raw bytes or a hex string");
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function hashHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
