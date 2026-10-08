/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/asyncapi.js
 * @description AsyncAPI interface-document verification (work document #4
 *   update #7): the document cannot drift from the implementation. Channels
 *   are checked for one-to-one parity with the wire constants, every wire
 *   example (`x-msgpack-hex`) is decoded through the real codecs and
 *   re-encoded byte-for-byte, and the positional payload schemas must match
 *   the arity of the working examples.
 */

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MsgPack } from "@reticulum/core";
import * as protocol from "../src/index.js";
import {
  assembleTraceFile,
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
  CMD_PROCESS_CTRL,
  CMD_PROCESS_LIST,
  CMD_PROCESS_LIST_REQ,
  CMD_PUBSUB_SUB,
  CMD_RUN_CTRL,
  decodeAnnounceAppData,
  decodeFrame,
  decodeLxmTelemetry,
  encodeAnnounceAppData,
  encodeAuthResponse,
  encodeBreakpointClear,
  encodeBreakpointSet,
  encodeCompDetailReq,
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
  encodeLxmTelemetry,
  encodeProcessCtrl,
  encodeProcessList,
  encodeProcessListReq,
  encodePubsubSub,
  encodeRunCtrl,
  readTraceFile,
  TRACE_SNAPSHOT,
} from "../src/index.js";

const doc = JSON.parse(
  readFileSync(new URL("../asyncapi.json", import.meta.url), "utf8"),
);

/**
 * Opcode → re-encoder. The decoders return camelCase objects shaped exactly
 * for their encoder, so the round-trip is a field-for-field pass-through.
 *
 * @type {Record<number, (decoded: any) => Uint8Array>}
 */
const frameEncoders = {
  [CMD_AUTH_RESPONSE]: (decoded) => encodeAuthResponse(decoded),
  [CMD_CRDT_SYNC_REQ]: (decoded) =>
    encodeCrdtSyncReq(decoded.epochId, decoded.clientClocks),
  [CMD_CRDT_UP_TO_DATE]: () => encodeCrdtUpToDate(),
  [CMD_CRDT_STALE_EPOCH]: (decoded) =>
    encodeCrdtStaleEpoch(decoded.newEpochId, decoded.rnsResourceHash),
  [CMD_CRDT_UPDATE]: (decoded) => encodeCrdtUpdate(decoded),
  [CMD_COMP_SYNC_REQ]: (decoded) =>
    encodeCompSyncReq(decoded.localRegistryHash),
  [CMD_COMP_MANIFEST]: (decoded) =>
    encodeCompManifest(decoded.newRegistryHash, decoded.entries),
  [CMD_COMP_DETAIL_REQ]: (decoded) => encodeCompDetailReq(decoded.names),
  [CMD_COMP_DETAIL_RES]: (decoded) => encodeCompDetailRes(decoded.components),
  [CMD_COMP_WRITE]: (decoded) =>
    encodeCompWrite(decoded.componentName, decoded.source),
  [CMD_COMP_INSTALL_REQ]: (decoded) => encodeCompInstallReq(decoded.packageUri),
  [CMD_PUBSUB_SUB]: (decoded) => encodePubsubSub(decoded),
  [CMD_FLOWTRACE_CHUNK]: (decoded) =>
    encodeFlowtraceChunk({
      subId: decoded.subId,
      baseTimestampMs: decoded.baseTimestampMs,
      events: decoded.events,
    }),
  [CMD_RUN_CTRL]: (decoded) => encodeRunCtrl(decoded.action),
  [CMD_BREAKPOINT_SET]: (decoded) =>
    encodeBreakpointSet({
      breakpointId: decoded.breakpointId,
      nodeId: decoded.nodeId,
      port: decoded.port,
    }),
  [CMD_BREAKPOINT_CLEAR]: (decoded) =>
    encodeBreakpointClear(decoded.breakpointId),
  [CMD_PROCESS_CTRL]: (decoded) =>
    encodeProcessCtrl({ nodeId: decoded.nodeId, action: decoded.action }),
  [CMD_PROCESS_LIST_REQ]: () => encodeProcessListReq(),
  [CMD_PROCESS_LIST]: (decoded) =>
    encodeProcessList(decoded.epochId, decoded.entries),
};

/**
 * @param {string} hex
 * @returns {Uint8Array}
 */
function unhex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Normalize a decoded MsgPack value into the JSON form the document's
 * examples use: binary becomes base64, matching AsyncAPI's `format:
 * "binary"` convention.
 *
 * @param {any} value
 * @returns {any}
 */
function normalize(value) {
  if (value instanceof Uint8Array) {
    return toBase64(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}

/**
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {void}
 */
function assertBytesEqual(a, b) {
  assert.deepEqual([...a], [...b]);
}

/**
 * Resolve the message a channel operation references.
 *
 * @param {string} channelName
 * @param {"publish"|"subscribe"} direction
 * @returns {{ name: string, message: any }}
 */
function referencedMessage(channelName, direction) {
  const operation = doc.channels[channelName][direction];
  assert.ok(operation, `channel ${channelName} must declare ${direction}`);
  assert.ok(
    operation.message?.$ref,
    `channel ${channelName} ${direction} must reference a component message`,
  );
  const name = operation.message.$ref.split("/").pop();
  const message = doc.components.messages[name];
  assert.ok(message, `referenced message ${name} must exist`);
  return { name, message };
}

describe("asyncapi document", () => {
  it("is AsyncAPI 2.6.0 dedicated to CC0-1.0", () => {
    assert.equal(doc.asyncapi, "2.6.0");
    assert.equal(doc.info.license.name, "CC0-1.0");
    assert.match(doc.info.description, /CC0-1\.0/);
    // The implementation-license split must stay explicit so the two are
    // never confused (work document #4 update #12).
    assert.match(doc.info.description, /EUPL-1\.2/);
  });

  it("has one channel per command code and no channel without one", () => {
    const commandOpcodes = Object.entries(protocol)
      .filter(([key]) => key.startsWith("CMD_"))
      .map(([, value]) => value);
    const channelNames = Object.keys(doc.channels).filter((name) =>
      name.startsWith("cmd/"),
    );
    const channelOpcodes = channelNames.map((name) =>
      parseInt(name.slice(4), 16),
    );
    assert.deepEqual(
      [...channelOpcodes].sort((a, b) => a - b),
      [...commandOpcodes].sort((a, b) => a - b),
    );
    // No duplicates: one channel per command code.
    assert.equal(new Set(channelOpcodes).size, channelOpcodes.length);
  });

  it("keeps the 0xF0 snapshot out of the channel table but in the document", () => {
    // The snapshot is a file format, not a link frame — the dispatch table
    // and the channel table exclude it for the same reason.
    assert.ok(!doc.channels["cmd/0xf0"]);
    assert.equal(doc.components.messages.traceFile["x-verify"], "tracefile");
    assert.equal(TRACE_SNAPSHOT, 0xf0);
  });

  it("declares a capability requirement on every channel", () => {
    for (const [name, channel] of Object.entries(doc.channels)) {
      assert.equal(
        typeof channel["x-capability"],
        "string",
        `channel ${name} must declare x-capability`,
      );
    }
  });

  it("declares both directions on the bidirectional CRDT channel", () => {
    // Runtime-initiated graph changes converge to connected clients (1.x's
    // runtime→UI blindness is structurally absent).
    const channel = doc.channels["cmd/0x14"];
    assert.ok(channel.publish);
    assert.ok(channel.subscribe);
    assert.equal(channel.publish.message.$ref, channel.subscribe.message.$ref);
  });
});

describe("wire examples round-trip through the codecs", () => {
  for (const [name, message] of Object.entries(doc.components.messages)) {
    it(`${name} example matches the wire and the codecs`, () => {
      const bytes = unhex(message["x-msgpack-hex"]);
      const role = message["x-verify"];
      assert.ok(role, `message ${name} must declare an x-verify role`);

      if (role === "frame") {
        const opcode = message.payload.items[0].const;
        assert.equal(
          typeof opcode,
          "number",
          `message ${name} must pin its opcode as a schema const`,
        );
        const decoded = decodeFrame(bytes);
        assert.equal(decoded.cmd, opcode);
        assertBytesEqual(frameEncoders[opcode](decoded), bytes);
        const frame = MsgPack.decode(bytes);
        assert.equal(message.payload.minItems, frame.length);
        assert.equal(message.payload.maxItems, frame.length);
        assert.deepEqual(normalize(frame), message.examples[0].payload);
        // The documented payload, encoded on its own, must reproduce the
        // documented wire bytes.
        assertBytesEqual(MsgPack.encode(message.examples[0].payload), bytes);
      } else if (role === "announce") {
        const decoded = decodeAnnounceAppData(bytes);
        assertBytesEqual(
          encodeAnnounceAppData({
            protocolVersion: decoded.protocolVersion,
            destinationHash: decoded.destinationHash,
            nodeName: decoded.nodeName,
          }),
          bytes,
        );
        const frame = MsgPack.decode(bytes);
        assert.equal(message.payload.minItems, frame.length);
        assert.equal(message.payload.maxItems, frame.length);
        assert.deepEqual(normalize(frame), message.examples[0].payload);
      } else if (role === "lxmf") {
        const decoded = decodeLxmTelemetry(bytes);
        assertBytesEqual(encodeLxmTelemetry(decoded), bytes);
        const frame = MsgPack.decode(bytes);
        assert.equal(message.payload.minItems, frame.length);
        assert.equal(message.payload.maxItems, frame.length);
        assert.deepEqual(normalize(frame), message.examples[0].payload);
      } else if (role === "tracefile") {
        const parsed = readTraceFile(bytes);
        assertBytesEqual(
          assembleTraceFile({
            runtimeMetadata: parsed.snapshot.runtimeMetadata,
            graphDefinition: parsed.snapshot.graphDefinition,
            chunks: parsed.chunks.map((chunk) =>
              encodeFlowtraceChunk({
                subId: chunk.subId,
                baseTimestampMs: chunk.baseTimestampMs,
                events: chunk.events,
              }),
            ),
            timestampMs: parsed.snapshot.timestampMs,
            formatVersion: parsed.snapshot.formatVersion,
          }),
          bytes,
        );
      } else {
        assert.fail(`message ${name} declares an unknown x-verify role`);
      }
    });
  }
});

describe("channels reference verified messages", () => {
  for (const [name] of Object.entries(doc.channels)) {
    for (const direction of /** @type {const} */ (["publish", "subscribe"])) {
      if (!doc.channels[name][direction]) {
        continue;
      }
      it(`${name} ${direction} references a message with a verified example`, () => {
        const { message } = referencedMessage(name, direction);
        assert.ok(
          message["x-msgpack-hex"],
          `message referenced by ${name} ${direction} must carry a wire example`,
        );
        assert.ok(
          message["x-verify"],
          `message referenced by ${name} ${direction} must declare an x-verify role`,
        );
      });
    }
  }

  it("carries every command codec in its channel table", () => {
    // Every encoder must be reachable from a channel; a codec without a
    // channel means the document went stale when a command was added.
    for (const opcode of Object.keys(frameEncoders).map(Number)) {
      const channelName = `cmd/0x${opcode.toString(16).padStart(2, "0")}`;
      assert.ok(
        doc.channels[channelName],
        `opcode 0x${opcode.toString(16)} must have a channel`,
      );
      // The channel's operations must reference a message whose schema
      // pins this opcode.
      const directions = ["publish", "subscribe"];
      const refs = directions
        .filter((direction) => doc.channels[channelName][direction])
        .map((direction) => referencedMessage(channelName, direction));
      assert.ok(refs.length > 0, `channel ${channelName} must have operations`);
      assert.ok(
        refs.every(
          ({ message }) => message.payload?.items?.[0]?.const === opcode,
        ),
        `channel ${channelName} messages must pin opcode ${opcode}`,
      );
    }
  });
});
