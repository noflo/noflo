/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/schema-protocol.js
 * @description The runtime's schema table and the `0x28`/`0x29`/`0x2a`
 *   server side (work document #37 phase 2): package-body ingestion with
 *   digest verification, all-nil answers, closure bundling within the
 *   stated maximum, digest-verified writes, and grow-only idempotence —
 *   driven end-to-end through the runtime core. The filesystem package
 *   loader lives in `@noflo/nodejs`; the table itself is isomorphic.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  CMD_SCHEMA_RES,
  CMD_SCHEMA_WRITE,
  decodeOpRejected,
  decodeSchemaRes,
  digestSchema,
  encodeSchemaReq,
  encodeSchemaWrite,
  REASON,
} from "@noflo/fbp-protocol";
import { RuntimeServer, SchemaTable } from "../src/index.js";
import { SchemaProtocol } from "../src/schema-protocol.js";
import { staticPolicy } from "./policy.js";

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

const POINT = {
  $id: "canvas/point",
  type: "object",
  required: ["x"],
  examples: [{ x: 1 }],
};
const LINE = {
  $id: "canvas/line",
  allOf: [{ $ref: "canvas/point" }],
  properties: { y: { type: "number" } },
};

const pointDigest = await digestSchema(POINT);
const lineDigest = await digestSchema(LINE);

/** Ingest the two fixture bodies the way a host's package loader would. */
async function fillTable(table) {
  await table.addPackageSchema("canvas/point", pointDigest, POINT);
  await table.addPackageSchema("canvas/line", lineDigest, LINE);
  return table;
}

async function wiredServer() {
  const transport = capture();
  const server = new RuntimeServer({
    capabilityPolicy: staticPolicy(),
    send: transport.send,
    capabilities: ["COMPONENT_READ", "COMPONENT_WRITE", "GRAPH_READ"],
  });
  const table = new SchemaTable();
  await fillTable(table);
  const schema = new SchemaProtocol({ table });
  schema.register(server);
  await server.authorize("link-1", "test-identity");
  return { server, table, schema, transport };
}

/**
 * Poll until the predicate holds; handler dispatch is fire-and-forget and
 * WebCrypto work lands on later turns.
 *
 * @param {() => boolean} predicate
 * @returns {Promise<void>}
 */
async function waitFor(predicate) {
  for (let i = 0; !predicate() && i < 100; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

function reply(transport) {
  const frames = transport.log.sent.filter(
    (entry) => entry.bytes[1] === CMD_SCHEMA_RES,
  );
  assert.equal(frames.length, 1, "exactly one 0x29 reply expected");
  return decodeSchemaRes(frames[0].bytes).bodies;
}

/** Outbound frames with the unilateral auth responses excluded. */
function nonAuth(transport) {
  return transport.log.sent.filter((entry) => entry.bytes[1] !== 0x02);
}

describe("schema table", () => {
  it("ingests package-loaded bodies digest-verified", async () => {
    const table = await fillTable(new SchemaTable());
    assert.ok(table.has(pointDigest));
    assert.ok(table.has(lineDigest));
    assert.equal(table.size, 2);
    // Ingestion is idempotent: the same digest is the same body
    await fillTable(table);
    assert.equal(table.size, 2);
  });

  it("rejects a digest mismatch at ingestion", async () => {
    const table = new SchemaTable();
    await assert.rejects(
      () =>
        table.addPackageSchema("canvas/point", pointDigest, {
          $id: "canvas/point",
          type: "string",
        }),
      /Digest mismatch loading the schema closure/,
    );
  });

  it("accepts digest-verified writes and is idempotent", async () => {
    const table = new SchemaTable();
    const body = { $id: "project/thing", type: "string" };
    const digest = await digestSchema(body);
    await table.write(digest, { body, ref: null });
    assert.ok(table.has(digest));
    assert.equal(table.size, 1);
    // Same digest, same body: a no-op
    await table.write(digest, { body, ref: null });
    assert.equal(table.size, 1);
  });

  it("rejects a write whose body fails its digest", async () => {
    const table = new SchemaTable();
    await assert.rejects(
      () => table.write("f".repeat(64), { body: POINT, ref: null }),
      /digests to/,
    );
  });

  it("accepts resource-backed writes and serves the reference", async () => {
    const table = new SchemaTable();
    await table.write(lineDigest, { body: null, ref: "rns:resourcehash" });
    const answer = table.request([lineDigest], false);
    assert.deepEqual(answer.get(lineDigest), { ref: "rns:resourcehash" });
  });

  it("answers nil for digests it does not hold", async () => {
    const table = new SchemaTable();
    const answer = table.request(["0".repeat(64)], true);
    assert.equal(answer.get("0".repeat(64)), null);
  });

  it("bundles the transitive closure of served bodies", async () => {
    const table = await fillTable(new SchemaTable());
    const answer = table.request([lineDigest], true);
    // The line's $ref closure brings the point along
    assert.ok(answer.has(pointDigest));
    assert.ok(answer.has(lineDigest));
    // Without bundling: only the requested body
    const bare = table.request([lineDigest], false);
    assert.ok(bare.has(lineDigest));
    assert.ok(!bare.has(pointDigest));
  });

  it("bundles the digest-pinned revision when two revisions of one id are held", async () => {
    const table = new SchemaTable();
    const v1 = { $id: "canvas/point", type: "string", v: 1 };
    const v2 = { $id: "canvas/point", type: "string", v: 2 };
    const d1 = await digestSchema(v1);
    const d2 = await digestSchema(v2);
    await table.write(d1, { body: v1, ref: null });
    // The project-written revision wins the id index — but the published
    // $ref pins v1, and closure bundling must serve the pin
    await table.write(d2, { body: v2, ref: null });
    const root = {
      $id: "canvas/root",
      $ref: `urn:noflo:canvas/point@${d1}`,
    };
    const rootDigest = await digestSchema(root);
    await table.write(rootDigest, { body: root, ref: null });
    const answer = table.request([rootDigest], true);
    assert.deepEqual(answer.get(d1)?.body, v1);
    assert.ok(!answer.has(d2), "the unpinned revision is not served");
  });

  it("degrades an over-cap package body instead of throwing at encode time", async () => {
    const table = new SchemaTable();
    const overcap = {
      $id: "big/thing",
      type: "object",
      description: "x".repeat(6000),
    };
    const digest = await digestSchema(overcap);
    await table.addPackageSchema("big/thing", digest, overcap);
    // Serving the body inline would make encodeSchemaRes throw and
    // leave the 0x28 request unanswered — degrade to nil instead
    const answer = table.request([digest], false);
    assert.equal(answer.get(digest), null);
  });
});

describe("schema protocol", () => {
  it("answers 0x28 with the held bodies and all-nil for the rest", async () => {
    const { server, transport } = await wiredServer();
    server.handleFrame(
      encodeSchemaReq(
        [pointDigest, "0".repeat(64)].map((hex) =>
          Uint8Array.from(Buffer.from(hex, "hex")),
        ),
        false,
      ),
      "link-1",
    );
    const bodies = reply(transport);
    assert.deepEqual(bodies[pointDigest], POINT);
    assert.equal(bodies["0".repeat(64)], null);
  });

  it("bundles closures when requested", async () => {
    const { server, transport } = await wiredServer();
    server.handleFrame(
      encodeSchemaReq(
        [lineDigest].map((hex) => Uint8Array.from(Buffer.from(hex, "hex"))),
        true,
      ),
      "link-1",
    );
    const bodies = reply(transport);
    assert.ok(bodies[pointDigest]);
  });

  it("accepts a verified write over 0x2a and serves it back", async () => {
    const { server, transport, table } = await wiredServer();
    const body = { $id: "project/live", type: "string", enum: ["a"] };
    const digest = await digestSchema(body);
    server.handleFrame(encodeSchemaWrite(digest, body), "link-1");
    // Handler dispatch is fire-and-forget and the digest verification is
    // WebCrypto-async; wait for the write to land
    await waitFor(() => table.has(digest));
    assert.ok(table.has(digest));
    server.handleFrame(
      encodeSchemaReq(
        [digest].map((hex) => Uint8Array.from(Buffer.from(hex, "hex"))),
        false,
      ),
      "link-1",
    );
    const bodies = reply(transport);
    assert.deepEqual(bodies[digest], body);
  });

  it("writes resource references over 0x2a", async () => {
    const { server, table } = await wiredServer();
    const digest = "e".repeat(64);
    server.handleFrame(encodeSchemaWrite(digest, "rns:resourcehash"), "link-1");
    await waitFor(() => table.entry(digest) !== null);
    assert.deepEqual(table.entry(digest), { ref: "rns:resourcehash" });
  });

  it("refuses writes past the project store budget with 0x17", async () => {
    const transport = capture();
    const server = new RuntimeServer({
      capabilityPolicy: staticPolicy(),
      send: transport.send,
      capabilities: ["COMPONENT_READ", "COMPONENT_WRITE", "GRAPH_READ"],
    });
    const table = new SchemaTable({ maxProjectEntries: 2 });
    const schema = new SchemaProtocol({ table });
    schema.register(server);
    await server.authorize("link-1", "test-identity");
    // The store is grow-only: without a budget a COMPONENT_WRITE peer
    // could grow it one wire frame at a time.
    const digests = [];
    for (let i = 0; i < 2; i++) {
      const body = { $id: `project/live-${i}`, type: "string" };
      const digest = await digestSchema(body);
      digests.push(digest);
      server.handleFrame(encodeSchemaWrite(digest, body), "link-1");
      await waitFor(() => table.has(digest));
    }
    // Rewriting a held digest stays idempotent even at the budget.
    server.handleFrame(
      encodeSchemaWrite(digests[0], { $id: "project/live-0", type: "string" }),
      "link-1",
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(table.size, 2);
    // The third distinct write is refused on the wire.
    const body3 = { $id: "project/live-3", type: "string" };
    const digest3 = await digestSchema(body3);
    server.handleFrame(encodeSchemaWrite(digest3, body3), "link-1");
    await waitFor(() => nonAuth(transport).length > 0);
    const rejection = decodeOpRejected(nonAuth(transport)[0].bytes);
    assert.equal(rejection.rejectedCmd, CMD_SCHEMA_WRITE);
    assert.equal(rejection.detail.reason, REASON.LINK_SATURATED);
    assert.match(rejection.detail.message, /store is full/);
    assert.equal(table.has(digest3), false);
    // A digest mismatch answers PAYLOAD_UNSUPPORTED, not saturation.
    server.handleFrame(
      encodeSchemaWrite("f".repeat(64), { $id: "project/wrong" }),
      "link-1",
    );
    await waitFor(() => nonAuth(transport).length > 1);
    const mismatch = decodeOpRejected(nonAuth(transport)[1].bytes);
    assert.equal(mismatch.detail.reason, REASON.PAYLOAD_UNSUPPORTED);
  });
});
