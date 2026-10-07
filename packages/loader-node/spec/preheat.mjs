import { execFile } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { after, before, describe, it } from "node:test";

const execFileAsync = promisify(execFile);

const binPath = path.resolve(import.meta.dirname, "../bin/noflo-cache-preheat");
const fixtureDir = path.resolve(import.meta.dirname, "fixtures");
const sourceProject = path.resolve(fixtureDir, "componentloader");

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
    const { stdout } = await execFileAsync(process.execPath, [binPath], {
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
    const { stdout } = await execFileAsync(process.execPath, [binPath], {
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
        execFileAsync(process.execPath, [binPath], { cwd: projectDir }),
      );
    } finally {
      fs.cpSync(path.resolve(sourceProject, "package.json"), projectPackage);
    }
  });
});
