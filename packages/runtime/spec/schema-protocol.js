/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/schema-protocol.js
 * @description The runtime's schema table and the `0x28`/`0x29`/`0x2a`
 *   server side (work document #37 phase 2): package loading with digest
 *   verification, all-nil answers, closure bundling within the stated
 *   maximum, digest-verified writes, and grow-only idempotence — driven
 *   end-to-end through the runtime core.
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CMD_SCHEMA_RES,
  decodeSchemaRes,
  digestSchema,
  encodeSchemaReq,
  encodeSchemaWrite,
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

/** @type {string} */
let baseDir;
/** @type {string} */
let pointDigest;
/** @type {string} */
let lineDigest;

beforeEach(async () => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "noflo-schema-rt-"));
  fs.symlinkSync(
    fileURLToPath(new URL("../../../node_modules", import.meta.url)),
    path.join(baseDir, "node_modules"),
    "dir",
  );
  fs.mkdirSync(path.join(baseDir, "schemas", "canvas"), { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "schemas", "canvas", "point.json"),
    `${JSON.stringify(POINT, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(baseDir, "schemas", "canvas", "line.json"),
    `${JSON.stringify(LINE, null, 2)}\n`,
  );
  pointDigest = await digestSchema(POINT);
  lineDigest = await digestSchema(LINE);
  fs.writeFileSync(
    path.join(baseDir, "noflo.json"),
    JSON.stringify({
      schemas: {
        "canvas/point": {
          digest: pointDigest,
          path: "schemas/canvas/point.json",
        },
        "canvas/line": { digest: lineDigest, path: "schemas/canvas/line.json" },
      },
    }),
  );
});

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

async function wiredServer() {
  const transport = capture();
  const server = new RuntimeServer({
    capabilityPolicy: staticPolicy(),
    send: transport.send,
    capabilities: ["COMPONENT_READ", "COMPONENT_WRITE", "GRAPH_READ"],
  });
  const table = new SchemaTable();
  await table.loadPackage(baseDir);
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

describe("schema table", () => {
  it("loads package schemas with digest verification", async () => {
    const table = new SchemaTable();
    assert.equal(await table.loadPackage(baseDir), 2);
    assert.ok(table.has(pointDigest));
    assert.ok(table.has(lineDigest));
  });

  it("rejects a digest mismatch at load", async () => {
    fs.writeFileSync(
      path.join(baseDir, "schemas", "canvas", "point.json"),
      `${JSON.stringify({ $id: "canvas/point", type: "string" })}\n`,
    );
    const table = new SchemaTable();
    await assert.rejects(
      () => table.loadPackage(baseDir),
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
    const table = new SchemaTable();
    await table.loadPackage(baseDir);
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "noflo-schema-cap-"));
    try {
      const overcap = {
        $id: "big/thing",
        type: "object",
        description: "x".repeat(6000),
      };
      const digest = await digestSchema(overcap);
      fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "schemas", "big-thing.json"),
        `${JSON.stringify(overcap, null, 2)}\n`,
      );
      fs.writeFileSync(
        path.join(dir, "noflo.json"),
        JSON.stringify({
          schemas: {
            "big/thing": {
              digest,
              path: "schemas/big-thing.json",
            },
          },
        }),
      );
      await table.loadPackage(dir);
      // Serving the body inline would make encodeSchemaRes throw and
      // leave the 0x28 request unanswered — degrade to nil instead
      const answer = table.request([digest], false);
      assert.equal(answer.get(digest), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
});

// The shipped noflo schema artifact (work document #44): the noflo
// package ships the port-behavior catalog and pins it in its manifest's
// schemas table — a deployment loading installed packages' manifests
// serves the noflo.* vocabulary to clients through the Two-Step Cache
// without any project-authored writes.
describe("the shipped noflo schema artifact", () => {
  it("loads the port-behavior catalog from the @noflo/noflo package manifest", async () => {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const entryPath = req.resolve("@noflo/noflo");
    // The main entry is src/lib/NoFlo.js; the package root is two levels up
    const pkgDir = path.resolve(path.dirname(entryPath), "..", "..");
    const table = new SchemaTable();
    const loaded = await table.loadPackage(pkgDir);
    assert.ok(loaded >= 1, "the package's schema set loaded");

    const manifest = JSON.parse(
      fs.readFileSync(path.join(pkgDir, "noflo.json"), "utf8"),
    );
    for (const [id, entryDef] of Object.entries(manifest.schemas ?? {})) {
      assert.ok(table.has(entryDef.digest), `${id} is in the table by digest`);
    }
    const pin = manifest.schemas["noflo/port-behavior"];
    const bodyPath = path.join(pkgDir, pin.path);
    const body = JSON.parse(fs.readFileSync(bodyPath, "utf8"));
    const served = table.entry(pin.digest);
    assert.ok(served?.body, "the table holds the pinned body");
    assert.deepEqual(
      served.body,
      body,
      "the served body is the shipped artifact",
    );
    assert.equal(served.body.entries["noflo.control"].class, "config");
  });
});
