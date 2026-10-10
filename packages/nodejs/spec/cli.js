import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readTraceFile } from "@noflo/fbp-protocol";

const packageDir = fileURLToPath(new URL("../", import.meta.url));
const fixtureDir = fileURLToPath(new URL("./fixtures/host/", import.meta.url));
const bin = join(packageDir, "bin", "noflo-nodejs");

/**
 * Copy the fixture project into a fresh temp dir and point the CLI at it.
 * The copy gets a `node_modules` link to the monorepo's installed `@noflo`
 * packages, since ESM resolution cannot walk up from a temp dir.
 * @returns {string}
 */
function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "noflo-nodejs-cli-"));
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
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function runCli(args, cwd) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [bin, ...args],
      {
        cwd,
        timeout: 30000,
        env: { ...process.env, RNS_HOST: "", RNS_PORT: "" },
      },
      (err, stdout, stderr) => {
        const code = err && typeof err.code === "number" ? err.code : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

describe("noflo-nodejs CLI", () => {
  it("runs a graph in batch mode, persists settings, and writes a trace", async () => {
    const project = makeProject();
    const storage = join(project, "rns-storage");
    try {
      const { code, stdout, stderr } = await runCli(
        [
          `--graph=${join(project, "graphs", "main.fbp")}`,
          "--batch",
          "--trace",
          `--base-dir=${project}`,
          `--storage=${storage}`,
        ],
        project,
      );
      assert.equal(code, 0, `CLI should exit 0, stderr: ${stderr}`);
      assert.match(stdout, /announced on the mesh/);

      // The generated node name persisted into the project settings file
      const saved = JSON.parse(
        await readFile(join(project, ".noflo.json"), "utf8"),
      );
      assert.equal(saved.name, "noflo-host-fixture NoFlo runtime");

      // The trace was written as a streamable trace file
      const traces = readdirSync(join(project, ".flowtrace"));
      assert.equal(traces.length, 1);
      const bytes = await readFile(join(project, ".flowtrace", traces[0]));
      const decoded = readTraceFile(new Uint8Array(bytes));
      assert.deepEqual(
        decoded.snapshot.graphDefinition.nodes.map((n) => n.component),
        ["host-fixture/SendOnce", "host-fixture/Pass"],
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("fails with a usage error when no graph is given", async () => {
    const project = makeProject();
    try {
      const { code, stderr } = await runCli([`--base-dir=${project}`], project);
      assert.equal(code, 1);
      assert.match(stderr, /No graph to run/);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("prints usage with -h and --help", async () => {
    for (const flag of ["-h", "--help"]) {
      const { code, stdout } = await runCli([flag], makeProject());
      assert.equal(code, 0);
      assert.match(stdout, /Usage: noflo-nodejs/);
      assert.match(stdout, /--dacar-store/);
      assert.match(stdout, /--graph/);
    }
  });

  it("prints the version with -v and --version", async () => {
    for (const flag of ["-v", "--version"]) {
      const { code, stdout } = await runCli([flag], makeProject());
      assert.equal(code, 0);
      assert.match(stdout, /^\d+\.\d+\.\d+/);
    }
  });

  it("rejects unknown options", async () => {
    const { code, stderr } = await runCli(["--nonsense"], makeProject());
    assert.equal(code, 1);
    assert.match(stderr, /Unknown option --nonsense/);
  });
});
