import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const binPath = path.resolve(import.meta.dirname, "../bin/noflo-cache-preheat");
const fixtureDir = path.resolve(import.meta.dirname, "fixtures");
const sourceProject = path.resolve(fixtureDir, "componentloader");

// Spawn arguments for the current runtime. Deno needs explicit
// permissions and --no-check (the workspace JSDoc types are not
// precision-complete yet); Node and Bun run the bin directly.
const isDeno = typeof Deno !== "undefined";

/**
 * @returns {string[]}
 */
function binRunnerArgs() {
  // --no-prompt: a permission request must fast-fail, never wait on
  // stdin (CI has no interactive terminal to answer it)
  return isDeno
    ? ["run", "--allow-all", "--no-check", "--no-prompt", binPath]
    : [binPath];
}

describe("noflo-cache-preheat bin", () => {
  const projectDir = path.resolve(fixtureDir, "preheatcheck");

  before(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.cpSync(sourceProject, projectDir, { recursive: true });
  });

  after(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("discovers the project and writes the manifest cache", async () => {
    const { stdout } = await execFileAsync(process.execPath, binRunnerArgs(), {
      cwd: projectDir,
    });
    assert.match(stdout, /Found \d+ components/);
    const manifestPath = path.resolve(projectDir, "fbp.json");
    assert.ok(fs.existsSync(manifestPath));
    const contents = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    assert.strictEqual(contents.version, 1);
    assert.ok(Array.isArray(contents.modules));
  });

  it("clears a stale cache before pre-heating", async () => {
    const manifestPath = path.resolve(projectDir, "fbp.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ version: 999, modules: [] }),
    );
    const { stdout } = await execFileAsync(process.execPath, binRunnerArgs(), {
      cwd: projectDir,
    });
    assert.match(stdout, /Old cache file/);
    const contents = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    assert.strictEqual(contents.version, 1);
  });

  it("fails when discovery errors", async () => {
    const projectPackage = path.resolve(projectDir, "package.json");
    fs.writeFileSync(projectPackage, "{invalid");
    try {
      await assert.rejects(
        execFileAsync(process.execPath, binRunnerArgs(), { cwd: projectDir }),
      );
    } finally {
      fs.cpSync(path.resolve(sourceProject, "package.json"), projectPackage);
    }
  });
});
