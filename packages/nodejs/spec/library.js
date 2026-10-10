import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readTraceFile } from "@noflo/fbp-protocol";
import { GraphModel } from "@noflo/graph";
import { EVENT_TYPE } from "@noflo/noflo";
import { run } from "../src/library.js";
import { writeTrace } from "../src/trace.js";

const fixtureDir = fileURLToPath(new URL("./fixtures/host/", import.meta.url));

/**
 * Copy the fixture project into a fresh temp dir, so the host's own state
 * (settings save-back, trace directory) never lands in the repository. The
 * copy gets a `node_modules` link to the monorepo's installed `@noflo`
 * packages, since ESM resolution cannot walk up from a temp dir.
 * @returns {string}
 */
function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "noflo-nodejs-run-"));
  cpSync(fixtureDir, dir, { recursive: true });
  mkdirSync(join(dir, "node_modules"));
  symlinkSync(
    fileURLToPath(new URL("../../../node_modules/@noflo", import.meta.url)),
    join(dir, "node_modules", "@noflo"),
    "dir",
  );
  return dir;
}

/**
 * A batch graph: SendOnce receives an IIP, forwards once through Pass.
 * @returns {GraphModel}
 */
function graph() {
  const model = new GraphModel({ name: "main" });
  model.addNode({ entity_id: "send", component: "host-fixture/SendOnce" });
  model.addNode({ entity_id: "pass", component: "host-fixture/Pass" });
  model.addEdge({
    entity_id: "edge",
    from: { node: "send", port: "out" },
    to: { node: "pass", port: "in" },
  });
  model.addIIP({
    entity_id: "iip",
    to: { node: "send", port: "in" },
    data: "hello",
  });
  return model;
}

describe("library entry", () => {
  it("runs a graph as an observable runtime host", async () => {
    const storage = mkdtempSync(join(tmpdir(), "noflo-nodejs-rns-"));
    const project = makeProject();
    try {
      const host = await run(graph(), { baseDir: project, storage });
      try {
        assert.ok(host.network);
        assert.ok(host.binding);
        assert.equal(host.network.graph.name, "main");
        const ended = new Promise((resolve) => {
          host.runtime.host.addEventListener("end", () => resolve(true));
        });
        assert.ok(await ended, "network should end after the burst");
      } finally {
        await host.stop();
      }
      // No trace requested: nothing recorded
      assert.equal(host.flowtrace, null);
      let throws = false;
      try {
        readdirSync(join(project, ".flowtrace"));
      } catch {
        throws = true;
      }
      assert.ok(throws, "no .flowtrace directory should be created");
    } finally {
      rmSync(storage, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("writes a streamable trace file when tracing is on", async () => {
    const storage = mkdtempSync(join(tmpdir(), "noflo-nodejs-rns-"));
    const project = makeProject();
    try {
      const host = await run(graph(), {
        baseDir: project,
        storage,
        trace: true,
      });
      assert.ok(host.flowtrace, "tracing should have created the recorder");
      const ended = new Promise((resolve) => {
        host.runtime.host.addEventListener("end", () => resolve(true));
      });
      assert.ok(await ended);
      await host.stop();
      const tracePath = await writeTrace(project, host.flowtrace, "main");
      assert.ok(tracePath, "trace file should have been written");
      const bytes = readFileSync(/** @type {string} */ (tracePath));
      const decoded = readTraceFile(new Uint8Array(bytes));
      assert.deepEqual(
        decoded.snapshot.graphDefinition.nodes.map((n) => n.component),
        ["host-fixture/SendOnce", "host-fixture/Pass"],
      );
      const types = decoded.chunks[0].events.map((e) => e.eventType);
      assert.ok(types.includes(EVENT_TYPE.DATA));
      assert.ok(types.includes(EVENT_TYPE.LIFECYCLE));
    } finally {
      rmSync(storage, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });
});
