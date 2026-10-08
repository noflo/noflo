/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/constants.js
 * @description Pins the wire constants of work document #4 against the
 *   specification, so a typo in a hex value fails the build instead of
 *   silently breaking the wire format.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import {
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
} from "../src/index.js";

describe("protocol version", () => {
  it("is generation 2 per the FBP Protocol 2.0 design", () => {
    assert.equal(PROTOCOL_VERSION, 2);
  });
});

describe("command codes", () => {
  it("match the specification byte-for-byte", () => {
    // Transport & identity (0x00 - 0x0F)
    assert.equal(CMD_AUTH_RESPONSE, 0x02);
    // CRDT graph synchronization (0x10 block)
    assert.equal(CMD_CRDT_SYNC_REQ, 0x10);
    assert.equal(CMD_CRDT_UP_TO_DATE, 0x11);
    assert.equal(CMD_CRDT_STALE_EPOCH, 0x12);
    assert.equal(CMD_CRDT_UPDATE, 0x14);
    // Component registry & code management (0x20 block)
    assert.equal(CMD_COMP_SYNC_REQ, 0x20);
    assert.equal(CMD_COMP_MANIFEST, 0x22);
    assert.equal(CMD_COMP_DETAIL_REQ, 0x23);
    assert.equal(CMD_COMP_DETAIL_RES, 0x24);
    assert.equal(CMD_COMP_WRITE, 0x25);
    assert.equal(CMD_COMP_INSTALL_REQ, 0x27);
    // Live streaming telemetry (0x30 block)
    assert.equal(CMD_PUBSUB_SUB, 0x30);
    assert.equal(CMD_FLOWTRACE_CHUNK, 0x32);
    // Streamable trace file format
    assert.equal(TRACE_SNAPSHOT, 0xf0);
  });

  it("keeps every command code inside its documented block", () => {
    const transportBlock = [CMD_AUTH_RESPONSE];
    const graphBlock = [
      CMD_CRDT_SYNC_REQ,
      CMD_CRDT_UP_TO_DATE,
      CMD_CRDT_STALE_EPOCH,
      CMD_CRDT_UPDATE,
    ];
    const registryBlock = [
      CMD_COMP_SYNC_REQ,
      CMD_COMP_MANIFEST,
      CMD_COMP_DETAIL_REQ,
      CMD_COMP_DETAIL_RES,
      CMD_COMP_WRITE,
      CMD_COMP_INSTALL_REQ,
    ];
    const telemetryBlock = [CMD_PUBSUB_SUB, CMD_FLOWTRACE_CHUNK];
    for (const code of transportBlock) {
      assert.ok(code >= 0x00 && code <= 0x0f);
    }
    for (const code of [...graphBlock, ...registryBlock]) {
      assert.ok(code >= 0x10 && code <= 0x2f);
    }
    for (const code of telemetryBlock) {
      assert.ok(code >= 0x30 && code <= 0x3f);
    }
  });

  it("leaves no two commands sharing a code", () => {
    const codes = [
      CMD_AUTH_RESPONSE,
      CMD_CRDT_SYNC_REQ,
      CMD_CRDT_UP_TO_DATE,
      CMD_CRDT_STALE_EPOCH,
      CMD_CRDT_UPDATE,
      CMD_COMP_SYNC_REQ,
      CMD_COMP_MANIFEST,
      CMD_COMP_DETAIL_REQ,
      CMD_COMP_DETAIL_RES,
      CMD_COMP_WRITE,
      CMD_COMP_INSTALL_REQ,
      CMD_PUBSUB_SUB,
      CMD_FLOWTRACE_CHUNK,
      TRACE_SNAPSHOT,
    ];
    assert.equal(new Set(codes).size, codes.length);
  });
});

describe("capability mask", () => {
  it("matches the documented bitwise layout", () => {
    assert.equal(CAPABILITY.GRAPH_READ, 0x01);
    assert.equal(CAPABILITY.GRAPH_EDIT, 0x02);
    assert.equal(CAPABILITY.METADATA_SYNC, 0x04);
    assert.equal(CAPABILITY.TELEMETRY_READ, 0x08);
    assert.equal(CAPABILITY.COMPONENT_READ, 0x10);
    assert.equal(CAPABILITY.COMPONENT_WRITE, 0x20);
    assert.equal(CAPABILITY.LIFECYCLE_CTRL, 0x40);
    assert.equal(CAPABILITY.ADMIN, 0x80);
  });
});

describe("limitation codes", () => {
  it("match the documented numbering", () => {
    assert.equal(LIMITATION.FULL_ACCESS, 0x00);
    assert.equal(LIMITATION.HARDWARE_CONSTRAINED, 0x01);
    assert.equal(LIMITATION.PERMISSION_DENIED, 0x02);
    assert.equal(LIMITATION.LINK_SATURATED, 0x03);
    assert.equal(LIMITATION.CONCURRENCY_LOCK, 0x04);
  });
});

describe("graph op types", () => {
  it("match the 0x14 op_type mappings", () => {
    assert.equal(OP_TYPE.INSERT_NODE, 0x01);
    assert.equal(OP_TYPE.INSERT_EDGE, 0x02);
    assert.equal(OP_TYPE.INSERT_IIP, 0x03);
    assert.equal(OP_TYPE.TOMBSTONE, 0x04);
    assert.equal(OP_TYPE.UI_METADATA, 0x05);
  });
});

describe("flowtrace event types", () => {
  it("match the unified enum", () => {
    assert.equal(EVENT_TYPE.DATA, 0x01);
    assert.equal(EVENT_TYPE.BEGIN_GROUP, 0x02);
    assert.equal(EVENT_TYPE.END_GROUP, 0x03);
    assert.equal(EVENT_TYPE.ERROR, 0x04);
    assert.equal(EVENT_TYPE.CONSOLE, 0x05);
    assert.equal(EVENT_TYPE.LIFECYCLE, 0x06);
    assert.equal(EVENT_TYPE.VISUAL_STATE, 0x07);
  });
});

describe("visual state formats", () => {
  it("match the documented format types", () => {
    assert.equal(VISUAL_FORMAT.FONTAWESOME, 0x01);
    assert.equal(VISUAL_FORMAT.NETPBM_MONO_84, 0x02);
    assert.equal(VISUAL_FORMAT.NETPBM_RGB_18, 0x03);
  });
});

describe("component types", () => {
  it("use the shared vocabulary of work documents #25 and #4 update #11", () => {
    assert.deepEqual(Object.values(COMPONENT_TYPE).sort(), [
      "elementary",
      "stub",
      "subgraph",
    ]);
  });
});

describe("lifecycle codes", () => {
  it("cover the documented transitions", () => {
    // Pinned per work document #4 §7 and update #1's FAILED decision — the
    // test pins what the codec ships so any change is a deliberate one.
    assert.equal(LIFECYCLE_CODE.START, 0x01);
    assert.equal(LIFECYCLE_CODE.STOP, 0x02);
    assert.equal(LIFECYCLE_CODE.SAFE_MODE, 0x03);
    assert.equal(LIFECYCLE_CODE.FAILED, 0x04);
  });
});
