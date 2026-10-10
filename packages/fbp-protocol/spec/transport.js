/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/transport.js
 * @description Announce app_data and `0x02` auth response codecs, including
 *   golden byte vectors so the wire layout cannot drift unnoticed.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  CMD_AUTH_RESPONSE,
  decodeAnnounceAppData,
  decodeAuthResponse,
  encodeAnnounceAppData,
  encodeAuthResponse,
  LIMITATION,
  PROTOCOL_VERSION,
  ProtocolError,
} from "../src/index.js";

describe("announce app_data", () => {
  it("encodes the flat positional layout of work document #4 §3", () => {
    const hash = new Uint8Array(16).fill(0xaa);
    const bytes = encodeAnnounceAppData({
      destinationHash: hash,
      nodeName: "r1",
    });
    // msgpack([ fixint 2, bin8(16) hash, fixstr "r1" ])
    assert.deepEqual(
      [...bytes],
      [0x93, 0x02, 0xc4, 0x10, ...Array(16).fill(0xaa), 0xa2, 0x72, 0x31],
    );
  });

  it("accepts a hex destination hash and defaults the protocol version", () => {
    const bytes = encodeAnnounceAppData({
      destinationHash: "a".repeat(32),
      nodeName: "r1",
    });
    assert.equal(bytes[0], 0x93); // fixarray(3) header
    assert.equal(bytes[1], PROTOCOL_VERSION);
  });

  it("round-trips through decode with both hash forms", () => {
    const decoded = decodeAnnounceAppData(
      encodeAnnounceAppData({
        destinationHash: new Uint8Array([
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
        ]),
        nodeName: "solar-runtime",
      }),
    );
    assert.equal(decoded.protocolVersion, PROTOCOL_VERSION);
    assert.equal(decoded.nodeName, "solar-runtime");
    assert.equal(
      decoded.destinationHashHex,
      "0102030405060708090a0b0c0d0e0f10",
    );
    assert.equal(decoded.destinationHash.byteLength, 16);
  });

  it("rejects malformed payloads", () => {
    // A bare fixint is not a frame array.
    assert.throws(
      () => decodeAnnounceAppData(new Uint8Array([0x01])),
      ProtocolError,
    );
    // A two-element array is not a 3-element frame.
    assert.throws(
      () => decodeAnnounceAppData(new Uint8Array([0x92, 0x01, 0x02])),
      ProtocolError,
    );
    // A single-element array is not a 3-element frame either.
    assert.throws(
      () => decodeAnnounceAppData(new Uint8Array([0x91, 0x00])),
      ProtocolError,
    );
  });

  it("rejects wrong-length destination hashes", () => {
    assert.throws(
      () =>
        encodeAnnounceAppData({
          destinationHash: new Uint8Array(15),
          nodeName: "x",
        }),
      ProtocolError,
    );
    assert.throws(
      () => encodeAnnounceAppData({ destinationHash: "zz", nodeName: "x" }),
      ProtocolError,
    );
  });
});

describe("auth response", () => {
  it("encodes the version byte ahead of the capability mask (update #6)", () => {
    const bytes = encodeAuthResponse({ capabilityMask: 0x07 });
    assert.deepEqual(
      [...bytes],
      [
        0x96,
        CMD_AUTH_RESPONSE,
        PROTOCOL_VERSION,
        0x07,
        LIMITATION.FULL_ACCESS,
        null,
        0x07,
      ],
    );
  });

  it("round-trips", () => {
    const decoded = decodeAuthResponse(
      encodeAuthResponse({
        capabilityMask: 0x53,
        limitationCode: LIMITATION.HARDWARE_CONSTRAINED,
      }),
    );
    assert.equal(decoded.cmd, CMD_AUTH_RESPONSE);
    assert.equal(decoded.protocolVersion, PROTOCOL_VERSION);
    assert.equal(decoded.capabilityMask, 0x53);
    assert.equal(decoded.limitationCode, LIMITATION.HARDWARE_CONSTRAINED);
    // The advertised mask defaults to the granted mask; metadata is nil
    // unless the runtime carries it.
    assert.equal(decoded.advertisedMask, 0x53);
    assert.equal(decoded.runtimeMetadata, null);
  });

  it("carries runtime metadata and the advertised ceiling (update #35)", () => {
    const decoded = decodeAuthResponse(
      encodeAuthResponse({
        capabilityMask: 0x07,
        runtimeMetadata: { type: "noflo-nodejs", version: "2.0.0" },
        advertisedMask: 0xff,
      }),
    );
    assert.equal(decoded.advertisedMask, 0xff);
    assert.deepEqual(decoded.runtimeMetadata, {
      type: "noflo-nodejs",
      version: "2.0.0",
    });
  });

  it("rejects non-0x02 frames with the expected opcode attached", () => {
    try {
      decodeAuthResponse(new Uint8Array([0x10, 0x01]));
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof ProtocolError);
      assert.equal(error.opcode, CMD_AUTH_RESPONSE);
    }
  });

  it("rejects frames with the unamended three-element layout", () => {
    // The version byte is not optional: a 1.x-shaped frame is malformed.
    assert.throws(
      () => decodeAuthResponse(new Uint8Array([0x02, 0x07, 0x00])),
      ProtocolError,
    );
  });

  it("rejects out-of-range field values", () => {
    // capability_mask encoded as uint16 256 exceeds the uint8 field.
    const frame = new Uint8Array([0x94, 0x02, 0x02, 0xcd, 0x01, 0x00, 0x00]);
    assert.throws(() => decodeAuthResponse(frame), ProtocolError);
  });
});
