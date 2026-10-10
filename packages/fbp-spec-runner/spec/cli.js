//     (c) 2021-2026 Henri Bergius

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { describe, it } from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

// The compiled suites register themselves through the node:test describe
// API, which only works inside a real test runner. Bun's node:test shim
// rejects describe calls in ordinary processes. Deno type-checks spawned
// graphs even under --no-check when JSDoc type-position imports force
// declaration resolution, which trips over the imprecise JSDoc types
// scheduled for the type-surface audit (work document #7,
// GitHub #1035/#1036/#1037). The CLI spawn tests are meaningful on Node;
// the in-process specs cover the runner on Deno and Bun.
const isBun = /bun(\.exe)?$/.test(process.execPath);
const isDeno = typeof Deno !== "undefined";
const skipSpawn = isBun || isDeno;

/**
 * Arguments for spawning the CLI with the current runtime. Under Deno
 * the spawn gets --no-check: type-checking the workspace graph trips
 * over the emitted .d.ts relative specifiers, and the Deno suite runs
 * without type-checking everywhere else.
 *
 * @returns {string[]}
 */
function cliRunnerArgs() {
  const deno = process.execPath.endsWith("deno");
  return deno
    ? ["run", "--allow-all", "--no-check", "src/cli.js"]
    : ["src/cli.js"];
}

describe("fbp-spec-runner CLI", () => {
  it("runs passing fixture suites and exits zero", {
    skip: skipSpawn,
  }, async () => {
    const { stdout } = await run(
      process.execPath,
      [
        ...cliRunnerArgs(),
        "--base-dir",
        "spec/fixtures/project",
        "spec/fixtures/repeat.yaml",
        "spec/fixtures/accumulate.yaml",
        "spec/fixtures/multi.yaml",
        "spec/fixtures/repeat.json",
        "spec/fixtures/graph.yaml",
      ],
      { cwd: process.cwd() },
    );
    assert.match(stdout, /sending a boolean/);
    assert.match(stdout, /stateful sequence/);
    assert.match(stdout, /sending through a graph fixture/);
    assert.match(stdout, /sending through a JSON fixture graph/);
    assert.doesNotMatch(stdout, /✖/);
  });

  it("exits non-zero when a fixture suite fails", {
    skip: skipSpawn,
  }, async () => {
    await assert.rejects(
      run(
        process.execPath,
        [
          ...cliRunnerArgs(),
          "--base-dir",
          "spec/fixtures/project",
          "spec/fixtures/failing.yaml",
        ],
        { cwd: process.cwd() },
      ),
      (err) => {
        assert.ok(err.code !== 0);
        assert.match(String(err.stdout), /deliberately wrong expectation/);
        return true;
      },
    );
  });

  it("shows help and rejects unknown options", {
    skip: skipSpawn,
  }, async () => {
    const { stdout } = await run(process.execPath, [
      ...cliRunnerArgs(),
      "--help",
    ]);
    assert.match(stdout, /Usage: fbp-spec-runner/);
    await assert.rejects(
      run(process.execPath, [...cliRunnerArgs(), "--frob"]),
      /Unknown option/,
    );
  });
});
