/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module msgpack-frames
 * @description Self-delimiting frame reading for concatenated MsgPack
 *   values. The streamable trace file format (work document #4 §9) appends
 *   raw `0x32` chunk frames sequentially, so reading one back means walking
 *   MsgPack value boundaries without decoding: this module computes the byte
 *   length of the value starting at an offset, structure-aware, without
 *   materializing any of it.
 */
/* @ts-self-types="./msgpack-frames.d.ts" */

import { ProtocolError } from "./errors.js";

/**
 * Maximum nesting depth for frame walking, mirroring the decoder's own cap:
 * trace files are shallow by design, and a hostile payload must not be able
 * to exhaust the stack.
 */
const MAX_DEPTH = 128;

/**
 * Compute the byte length of the complete MsgPack value starting at
 * `offset`.
 *
 * @param {Uint8Array} bytes Buffer holding at least one full value at `offset`.
 * @param {number} offset Start offset of the value.
 * @returns {number} Bytes consumed by the value, from `offset`.
 * @throws {ProtocolError} On a truncated or malformed value.
 */
export function msgpackValueLength(bytes, offset = 0) {
  const [length] = valueLength(bytes, offset, 0);
  return length;
}

/**
 * Split a buffer of concatenated MsgPack values into the sliced views of
 * each top-level value, in order.
 *
 * @param {Uint8Array} bytes
 * @returns {Uint8Array[]}
 * @throws {ProtocolError} On truncation or trailing garbage.
 */
export function splitMsgpackFrames(bytes) {
  /** @type {Uint8Array[]} */
  const frames = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    const length = msgpackValueLength(bytes, offset);
    frames.push(bytes.subarray(offset, offset + length));
    offset += length;
  }
  return frames;
}

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {number} depth
 * @returns {[number, number]} Bytes consumed and the value's element count
 *   for containers (0 for scalars).
 */
function valueLength(bytes, offset, depth) {
  if (depth > MAX_DEPTH) {
    throw new ProtocolError(
      "msgpack nesting depth exceeded while walking frames",
    );
  }
  if (offset >= bytes.byteLength) {
    throw new ProtocolError("truncated msgpack value");
  }
  const marker = bytes[offset];
  // Positive fixint (0x00-0x7f) and negative fixint (0xe0-0xff)
  if (marker <= 0x7f || marker >= 0xe0) return [1, 0];
  // fixmap (0x80-0x8f)
  if (marker >= 0x80 && marker <= 0x8f)
    return containerLength(bytes, offset, depth, marker & 0x0f, 2);
  // fixarray (0x90-0x9f)
  if (marker >= 0x90 && marker <= 0x9f)
    return containerLength(bytes, offset, depth, marker & 0x0f, 1);
  // fixstr (0xa0-0xbf)
  if (marker >= 0xa0 && marker <= 0xbf) return [1 + (marker & 0x1f), 0];
  switch (marker) {
    case 0xc0: // nil
    case 0xc2: // false
    case 0xc3: // true
      return [1, 0];
    case 0xc4:
      return fixed(bytes, offset, 1, 1); // bin 8
    case 0xc5:
      return fixed(bytes, offset, 2, 1); // bin 16
    case 0xc6:
      return fixed(bytes, offset, 4, 1); // bin 32
    case 0xc7:
      return extLength(bytes, offset, 1); // ext 8
    case 0xc8:
      return extLength(bytes, offset, 2); // ext 16
    case 0xc9:
      return extLength(bytes, offset, 4); // ext 32
    case 0xca:
      return fixed(bytes, offset, 0, 4); // float 32
    case 0xcb:
      return fixed(bytes, offset, 0, 8); // float 64
    case 0xcc:
      return fixed(bytes, offset, 0, 1); // uint 8
    case 0xcd:
      return fixed(bytes, offset, 0, 2); // uint 16
    case 0xce:
      return fixed(bytes, offset, 0, 4); // uint 32
    case 0xcf:
      return fixed(bytes, offset, 0, 8); // uint 64
    case 0xd0:
      return fixed(bytes, offset, 0, 1); // int 8
    case 0xd1:
      return fixed(bytes, offset, 0, 2); // int 16
    case 0xd2:
      return fixed(bytes, offset, 0, 4); // int 32
    case 0xd3:
      return fixed(bytes, offset, 0, 8); // int 64
    case 0xd4:
      return fixed(bytes, offset, 1, 1); // fixext 1
    case 0xd5:
      return fixed(bytes, offset, 1, 2); // fixext 2
    case 0xd6:
      return fixed(bytes, offset, 1, 4); // fixext 4
    case 0xd7:
      return fixed(bytes, offset, 1, 8); // fixext 8
    case 0xd8:
      return fixed(bytes, offset, 1, 16); // fixext 16
    case 0xd9:
      return fixed(bytes, offset, 1, 1); // str 8
    case 0xda:
      return fixed(bytes, offset, 2, 1); // str 16
    case 0xdb:
      return fixed(bytes, offset, 4, 1); // str 32
    case 0xdc:
      return containerLength(
        bytes,
        offset,
        depth,
        readUint(bytes, offset, 2),
        1,
      ); // array 16
    case 0xdd:
      return containerLength(
        bytes,
        offset,
        depth,
        readUint(bytes, offset, 4),
        1,
      ); // array 32
    case 0xde:
      return containerLength(
        bytes,
        offset,
        depth,
        readUint(bytes, offset, 2),
        2,
      ); // map 16
    case 0xdf:
      return containerLength(
        bytes,
        offset,
        depth,
        readUint(bytes, offset, 4),
        2,
      ); // map 32
    default:
      throw new ProtocolError(
        `unknown msgpack marker 0x${marker.toString(16)}`,
      );
  }
}

/**
 * Length of a value with a fixed-width header plus fixed-width body.
 *
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {number} headerBytes Length fields inside the header.
 * @param {number} bodyBytes Fixed body size, or 0 when the body is
 *   length-prefixed.
 * @returns {[number, number]}
 */
function fixed(bytes, offset, headerBytes, bodyBytes) {
  const total = 1 + headerBytes + bodyBytes;
  if (headerBytes > 0 && bodyBytes === 1) {
    // bin8/str8/fixext* read their single length byte to size the body.
    const length = readUint(bytes, offset, headerBytes);
    return [1 + headerBytes + length, 0];
  }
  if (headerBytes > 0) {
    throw new ProtocolError("unexpected length-prefixed value shape");
  }
  return [total, 0];
}

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {number} headerBytes Width of the length field.
 * @returns {[number, number]}
 */
function extLength(bytes, offset, headerBytes) {
  const length = readUint(bytes, offset, headerBytes);
  // ext carries a one-byte type tag plus the payload.
  return [1 + headerBytes + 1 + length, 0];
}

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {number} depth
 * @param {number} count Element (or pair) count from the header.
 * @param {number} stride 1 for arrays, 2 for maps (key + value per pair).
 * @returns {[number, number]}
 */
function containerLength(bytes, offset, depth, count, stride) {
  let consumed = 1;
  let cursor = offset + 1;
  for (let i = 0; i < count * stride; i++) {
    const [length] = valueLength(bytes, cursor, depth + 1);
    consumed += length;
    cursor += length;
  }
  return [consumed, count];
}

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {number} width
 * @returns {number}
 */
function readUint(bytes, offset, width) {
  let value = 0;
  for (let i = 0; i < width; i++) {
    if (offset + 1 + i >= bytes.byteLength) {
      throw new ProtocolError("truncated msgpack value");
    }
    value = value * 256 + bytes[offset + 1 + i];
  }
  return value;
}
