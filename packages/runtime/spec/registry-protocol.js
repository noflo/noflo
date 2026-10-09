/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/registry-protocol.js
 * @description The Two-Step Cache server side: manifest/match replies to
 *   registry syncs, detail responses, source writes and installs against
 *   the catalog contract, driven end-to-end through the runtime core.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  CMD_AUTH_RESPONSE,
  CMD_COMP_DETAIL_RES,
  CMD_COMP_MANIFEST,
  CMD_COMP_UP_TO_DATE,
  COMPONENT_TYPE,
  decodeCompDetailRes,
  decodeCompManifest,
  decodeCompUpToDate,
  encodeCompDetailReq,
  encodeCompInstallReq,
  encodeCompSyncReq,
  encodeCompWrite,
  registryHash,
  sigHash,
} from "@noflo/fbp-protocol";
import { RegistryProtocol, RuntimeServer } from "../src/index.js";

/** Capture transport: records frames per context. */
function capture() {
  /** @type {{sent: {bytes: Uint8Array, context: any}[], broadcast: Uint8Array[]}} */
  const log = { sent: [], broadcast: [] };
  return {
    log,
    send(bytes, context) {
      log.sent.push({ bytes, context });
    },
    broadcast(bytes) {
      log.broadcast.push(bytes);
    },
  };
}

/** Outbound frames with the unilateral auth responses excluded. */
function wire(transport) {
  return transport.log.sent.filter(
    (entry) => entry.bytes[1] !== CMD_AUTH_RESPONSE,
  );
}

const addSignature = {
  type: COMPONENT_TYPE.ELEMENTARY,
  in: [
    { id: "a", type: "number" },
    { id: "b", type: "number", required: true },
  ],
  out: [{ id: "sum", type: "number" }],
};

const stubSignature = {
  type: COMPONENT_TYPE.STUB,
  in: [{ id: "in", type: "all" }],
  out: [{ id: "out", type: "all" }],
};

/** A catalog with two components and recording hooks. */
function testCatalog() {
  /** @type {string[]} */
  const written = [];
  /** @type {string[]} */
  const installed = [];
  const signatures = {
    "math/Add": addSignature,
    "stub/Only": stubSignature,
  };
  return {
    catalog: {
      signatures: () => signatures,
      writeSource: async (name, source) => {
        written.push(`${name}:${source}`);
        // Source and signature are orthogonal (work document #4 §6): a
        // source write never changes the signature.
      },
      install: async (uri) => {
        installed.push(uri);
      },
    },
    written,
    installed,
  };
}

/** A server wired with the registry protocol against the test catalog. */
async function wiredServer() {
  const { catalog, written, installed } = testCatalog();
  const transport = capture();
  const server = new RuntimeServer({
    send: transport.send,
    capabilities: [
      "COMPONENT_READ",
      "COMPONENT_WRITE",
      "GRAPH_READ",
      "GRAPH_EDIT",
      "TELEMETRY_READ",
      "LIFECYCLE_CTRL",
    ],
  });
  const registry = new RegistryProtocol({ catalog });
  await registry.refresh();
  registry.register(server);
  // Fail closed: contexts must be authorized before their frames count.
  server.authorize("link-1");
  return { server, registry, catalog, transport, written, installed };
}

describe("registry protocol", () => {
  it("derives manifest entries and the registry hash from the catalog", async () => {
    const { registry } = await wiredServer();
    assert.deepEqual(Object.keys(registry.state.entries).sort(), [
      "math/Add",
      "stub/Only",
    ]);
    assert.equal(
      registry.state.entries["math/Add"].sigHash,
      await sigHash(addSignature),
    );
    assert.equal(registry.state.entries["math/Add"].type, "elementary");
    assert.equal(
      registry.state.hash,
      await registryHash(registry.state.entries),
    );
  });

  it("answers a stale registry sync with the manifest", async () => {
    const { server, registry, transport } = await wiredServer();
    server.handleFrame(encodeCompSyncReq("outdated-hash"), "link-1");
    assert.equal(wire(transport).length, 1);
    const decoded = decodeCompManifest(wire(transport)[0].bytes);
    assert.equal(decoded.cmd, CMD_COMP_MANIFEST);
    assert.equal(decoded.newRegistryHash, registry.state.hash);
    assert.deepEqual(decoded.entries["math/Add"], {
      sigHash: await sigHash(addSignature),
      type: "elementary",
    });
    assert.deepEqual(decoded.entries["stub/Only"], {
      sigHash: await sigHash(stubSignature),
      type: "stub",
    });
  });

  it("answers a matching registry sync with the match reply", async () => {
    const { server, registry, transport } = await wiredServer();
    server.handleFrame(encodeCompSyncReq(registry.state.hash), "link-1");
    assert.equal(wire(transport).length, 1);
    const decoded = decodeCompUpToDate(wire(transport)[0].bytes);
    assert.equal(decoded.cmd, CMD_COMP_UP_TO_DATE);
  });

  it("answers detail requests with only the known requested components", async () => {
    const { server, transport } = await wiredServer();
    server.handleFrame(
      encodeCompDetailReq(["math/Add", "nothere/Nope"]),
      "link-1",
    );
    assert.equal(wire(transport).length, 1);
    const decoded = decodeCompDetailRes(wire(transport)[0].bytes);
    assert.equal(decoded.cmd, CMD_COMP_DETAIL_RES);
    assert.deepEqual(Object.keys(decoded.components), ["math/Add"]);
    assert.equal(decoded.components["math/Add"].type, "elementary");
    assert.equal(decoded.components["math/Add"].in[1].required, true);
  });

  it("answers an all-unknown detail request with an empty response", async () => {
    const { server, transport } = await wiredServer();
    server.handleFrame(encodeCompDetailReq(["nothere/Nope"]), "link-1");
    const decoded = decodeCompDetailRes(wire(transport)[0].bytes);
    assert.deepEqual(decoded.components, {});
  });

  it("maps source writes onto the catalog and re-derives state", async () => {
    const { server, registry, transport, written } = await wiredServer();
    const hashBefore = registry.state.hash;
    server.handleFrame(
      encodeCompWrite("math/Add", "export const getComponent = () => {};"),
      "link-1",
    );
    // Async handler: let the microtask queue settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(written, [
      "math/Add:export const getComponent = () => {};",
    ]);
    assert.equal(registry.state.hash, hashBefore);
    // The write added nothing to the catalog, so the manifest is unchanged:
    // the client is not answered on the wire (no ack frames).
    assert.equal(wire(transport).length, 0);
  });

  it("maps package installs onto the catalog and re-derives state", async () => {
    const { server, transport, installed } = await wiredServer();
    server.handleFrame(
      encodeCompInstallReq("npm:@noflo/strings@2.0.0"),
      "link-1",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(installed, ["npm:@noflo/strings@2.0.0"]);
    assert.equal(wire(transport).length, 0);
  });

  it("surfaces missing catalog hooks as unsupported events", async () => {
    const transport = capture();
    const server = new RuntimeServer({
      send: transport.send,
      capabilities: ["COMPONENT_READ", "COMPONENT_WRITE"],
    });
    const registry = new RegistryProtocol({
      catalog: { signatures: () => ({ "math/Add": addSignature }) },
    });
    await registry.refresh();
    registry.register(server);
    server.authorize("link-1");
    /** @type {any[]} */
    const unsupported = [];
    server.addEventListener("unsupported", (event) =>
      unsupported.push(event.detail),
    );
    server.handleFrame(encodeCompWrite("math/Add", "source"), "link-1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(unsupported.length, 1);
    assert.equal(unsupported[0].hook, "writeSource");
  });

  it("reflects catalog changes after refresh", async () => {
    const { catalog, registry, server, transport } = await wiredServer();
    const oldHash = registry.state.hash;
    catalog.signatures = () => ({
      "math/Add": addSignature,
      "stub/Only": stubSignature,
      "math/Sub": {
        type: COMPONENT_TYPE.ELEMENTARY,
        in: [{ id: "a", type: "number" }],
        out: [{ id: "diff", type: "number" }],
      },
    });
    await registry.refresh();
    assert.notEqual(registry.state.hash, oldHash);
    server.handleFrame(encodeCompSyncReq(oldHash), "link-1");
    const decoded = decodeCompManifest(wire(transport)[0].bytes);
    assert.equal(decoded.newRegistryHash, registry.state.hash);
    assert.deepEqual(Object.keys(decoded.entries).sort(), [
      "math/Add",
      "math/Sub",
      "stub/Only",
    ]);
  });
});
