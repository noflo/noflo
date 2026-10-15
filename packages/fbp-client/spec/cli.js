import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  encodeCompDetailRes,
  encodeCompManifest,
  encodeCompSourceRes,
  encodeCompUpToDate,
  encodeCrdtStaleEpoch,
  encodeCrdtUpToDate,
  encodeGetStatusRes,
  encodePlaneListRes,
  encodeSchemaRes,
  PLANE_KIND,
  RUN_STATE,
} from "@noflo/fbp-protocol";
import { RuntimeClient } from "@noflo/runtime-client";
import {
  component,
  components,
  getSource,
  graph,
  guardAdvisory,
  planes,
  RUN_STATE_NAMES,
  schemas,
  setSource,
  status,
} from "../src/index.js";
import { FakeLink } from "./support/fake-link.js";

/** Build a session over a fake link. */
function makeSession() {
  const link = new FakeLink();
  const client = new RuntimeClient({
    link,
    auth: { protocolVersion: 2, capabilityMask: 0x03 },
  });
  return { link, session: { client, auth: client.auth, nodeName: "test" } };
}

describe("fbp-client commands", () => {
  it("status decodes the 0x48 reply with granted/advertised masks", async () => {
    const { link, session } = makeSession();
    const pending = status(session);
    link.deliver(
      encodeGetStatusRes({
        epochId: "epoch-1",
        runState: RUN_STATE.RUNNING,
        uptimeMs: 42_000,
        advertisedMask: 0x0f,
      }),
    );
    const result = await pending;
    assert.equal(result.runState, "running");
    assert.equal(result.uptimeMs, 42_000);
    assert.equal(result.advertisedMask, 0x0f);
    assert.equal(result.grantedMask, 0x03);
  });

  it("planes lists the runtime's planes", async () => {
    const { link, session } = makeSession();
    const pending = planes(session);
    link.deliver(
      encodePlaneListRes([
        {
          planeId: null,
          kind: PLANE_KIND.MAIN,
          name: "main",
          epochId: "epoch-1",
        },
        {
          planeId: "inst-1",
          kind: PLANE_KIND.SUBGRAPH,
          name: "worker",
          epochId: "epoch-2",
        },
      ]),
    );
    const entries = await pending;
    assert.equal(entries.length, 2);
    assert.equal(entries[1].planeId, "inst-1");
    assert.equal(entries[1].name, "worker");
  });

  it("graph syncs the mirror and serializes the canonical document", async () => {
    const { link, session } = makeSession();
    const canonical = {
      name: "main",
      nodes: [{ entity_id: "node-1", component: "math/Add" }],
    };
    link.resources.set(
      "res-hash-1",
      new TextEncoder().encode(JSON.stringify(canonical)),
    );
    const pending = graph(session);
    setTimeout(() => {
      link.deliver(encodeCrdtUpToDate(null, "epoch-7"));
    }, 10);
    // The epoch handshake: the runtime answers stale with a baseline
    setTimeout(() => {
      link.deliver(encodeCrdtStaleEpoch(null, "epoch-7", "res-hash-1"));
    }, 30);
    const document = await pending;
    assert.equal(document.name, "main");
    assert.deepEqual(
      document.nodes.map((n) => ({
        entity_id: n.entity_id,
        component: n.component,
      })),
      [{ entity_id: "node-1", component: "math/Add" }],
    );
  });

  it("components syncs the catalog through the Two-Step flow", async () => {
    const { link, session } = makeSession();
    const pending = components(session);
    link.deliver(
      encodeCompManifest("reg-hash-1", {
        "math/Add": { sigHash: "a".repeat(64), type: "elementary" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    link.deliver(
      encodeCompDetailRes({
        "math/Add": {
          type: "elementary",
          in: [{ id: "a", type: "number", required: true }],
          out: [{ id: "sum", type: "number" }],
        },
      }),
    );
    const catalog = await pending;
    assert.equal(catalog["math/Add"].sigHash, "a".repeat(64));
    assert.ok(catalog["math/Add"].signature);
  });

  it("component returns one catalog entry", async () => {
    const { link, session } = makeSession();
    const pending = component(session, "math/Add");
    link.deliver(
      encodeCompManifest("reg-hash-1", {
        "math/Add": { sigHash: "a".repeat(64), type: "elementary" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    link.deliver(
      encodeCompDetailRes({
        "math/Add": {
          type: "elementary",
          in: [{ id: "a", type: "number", required: true }],
          out: [{ id: "sum", type: "number" }],
        },
      }),
    );
    const entry = await pending;
    assert.equal(entry.type, "elementary");
    // The second sync: the runtime answers up-to-date, the catalog stands
    const missing = component(session, "nope/Nope");
    setTimeout(() => link.deliver(encodeCompUpToDate("reg-hash-1")), 10);
    await assert.rejects(missing, /registry/);
  });

  it("source get reads the component source", async () => {
    const { link, session } = makeSession();
    const pending = getSource(session, "mylib/Repeat");
    setTimeout(
      () =>
        link.deliver(
          encodeCompSourceRes("mylib/Repeat", "export const x = 1;"),
        ),
      10,
    );
    assert.equal(await pending, "export const x = 1;");
  });

  it("source set sends the comp write frame", async () => {
    const { link, session } = makeSession();
    await setSource(session, "mylib/Repeat", "export const x = 2;");
    assert.equal(link.sent.length, 1);
    assert.equal(link.sent[0][1], 0x25);
  });

  it("refuses unsupported graph formats", async () => {
    const { session } = makeSession();
    await assert.rejects(
      graph(session, { format: "dot" }),
      /later wd #34 phase/,
    );
  });
});

describe("fbp-client binary", () => {
  it("prints usage and exits cleanly on --help", async () => {
    const { code, stdout } = await runCli(["--help"]);
    assert.equal(code, 0);
    assert.match(stdout, /fbp-client/);
    assert.match(stdout, /scan/);
  });

  it("fails with usage on an unknown command", async () => {
    const { code, stderr } = await runCli(["bogus"]);
    assert.equal(code, 1);
    assert.match(stderr, /fbp-client/);
  });

  it("renders run-state names", () => {
    assert.equal(RUN_STATE_NAMES[RUN_STATE.STOPPED], "stopped");
  });
});

/** Spawn the CLI bin and capture its output. */
function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("../bin/fbp-client.js", import.meta.url)),
        ...args,
      ],
      { timeout: 30_000 },
    );
    /** @type {Buffer[]} */
    const out = [];
    /** @type {Buffer[]} */
    const err = [];
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    const killer = setTimeout(() => child.kill("SIGKILL"), 25_000);
    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(out).toString(),
        stderr: Buffer.concat(err).toString(),
      });
    });
    child.on("error", reject);
  });
}

describe("schemas command", () => {
  it("lists the digest-verified bodies the catalog references", async () => {
    const { link, session } = makeSession();
    const body = { $id: "std/count", type: "integer", minimum: 0 };
    const digest = await import("@noflo/fbp-protocol").then((m) =>
      m.digestSchema(body),
    );
    const pending = schemas(session);
    link.deliver(
      encodeCompManifest("reg-hash-1", {
        "math/Add": { sigHash: "a".repeat(64), type: "elementary" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    link.deliver(
      encodeCompDetailRes({
        "math/Add": {
          type: "elementary",
          in: [
            { id: "a", type: "number", schema: { id: "std/count", digest } },
          ],
          out: [],
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    link.deliver(encodeSchemaRes({ [digest]: body }));
    const result = await pending;
    assert.equal(result[digest].id, "std/count");
    assert.deepEqual(result[digest].body, body);
  });

  it("stays empty when the runtime serves all-nil", async () => {
    const { link, session } = makeSession();
    const digest = "b".repeat(64);
    const pending = schemas(session);
    link.deliver(
      encodeCompManifest("reg-hash-1", {
        "math/Add": { sigHash: "a".repeat(64), type: "elementary" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    link.deliver(
      encodeCompDetailRes({
        "math/Add": {
          type: "elementary",
          in: [{ id: "a", type: "number", schema: { digest } }],
          out: [],
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    link.deliver(encodeSchemaRes({ [digest]: null }));
    const result = await pending;
    assert.deepEqual(result, {});
  });
});

describe("guardAdvisory", () => {
  it("warns when the value fails the signature's in-band guard", async () => {
    const { link, session } = makeSession();
    // The graph mirror primes without a wire round trip
    const { GraphModel } = await import("@noflo/graph");
    session.client.graph = GraphModel.fromCanonical({
      name: "main",
      nodes: [{ entity_id: "adder", component: "math/Add" }],
    });
    const pending = guardAdvisory(session, {
      node: "adder",
      port: "a",
      value: -5,
    });
    link.deliver(
      encodeCompManifest("reg-hash-1", {
        "math/Add": { sigHash: "a".repeat(64), type: "elementary" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    link.deliver(
      encodeCompDetailRes({
        "math/Add": {
          type: "elementary",
          in: [{ id: "a", type: "number", guard: { type: "number", min: 0 } }],
          out: [],
        },
      }),
    );
    const advisory = await pending;
    assert.ok(advisory);
    assert.match(advisory, /in-band guard/);
    assert.match(advisory, /sending anyway/);
  });

  it("stays silent for in-guard values and unguarded ports", async () => {
    const { link, session } = makeSession();
    const { GraphModel } = await import("@noflo/graph");
    session.client.graph = GraphModel.fromCanonical({
      name: "main",
      nodes: [{ entity_id: "adder", component: "math/Add" }],
    });
    const inGuard = guardAdvisory(session, {
      node: "adder",
      port: "a",
      value: 5,
    });
    link.deliver(
      encodeCompManifest("reg-hash-1", {
        "math/Add": { sigHash: "a".repeat(64), type: "elementary" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    link.deliver(
      encodeCompDetailRes({
        "math/Add": {
          type: "elementary",
          in: [{ id: "a", type: "number", guard: { type: "number", min: 0 } }],
          out: [],
        },
      }),
    );
    assert.equal(await inGuard, null);
  });

  it("resolves exported inports through the graph mirror", async () => {
    const { link, session } = makeSession();
    const { GraphModel } = await import("@noflo/graph");
    session.client.graph = GraphModel.fromCanonical({
      name: "main",
      nodes: [{ entity_id: "adder", component: "math/Add" }],
      exports: [
        {
          direction: "inport",
          public: "in",
          internal: { node: "adder", port: "a" },
        },
      ],
    });
    const pending = guardAdvisory(session, {
      exportName: "in",
      value: -5,
    });
    link.deliver(
      encodeCompManifest("reg-hash-1", {
        "math/Add": { sigHash: "a".repeat(64), type: "elementary" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    link.deliver(
      encodeCompDetailRes({
        "math/Add": {
          type: "elementary",
          in: [{ id: "a", type: "number", guard: { type: "number", min: 0 } }],
          out: [],
        },
      }),
    );
    const advisory = await pending;
    assert.ok(advisory);
    assert.match(advisory, /math\/Add\.a/);
  });
});
