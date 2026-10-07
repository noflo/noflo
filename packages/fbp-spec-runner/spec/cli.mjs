import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { describe, it } from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

// The compiled suites register themselves through the node:test describe
// API, which only works inside a real test runner. Bun's node:test shim
// rejects describe calls in ordinary processes, so the CLI spawn tests
// are meaningful on Node (and Deno, which has no such restriction).
const isBun = /bun(\.exe)?$/.test(process.execPath);

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
    skip: isBun,
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
      ],
      { cwd: process.cwd() },
    );
    assert.match(stdout, /sending a boolean/);
    assert.match(stdout, /stateful sequence/);
    assert.doesNotMatch(stdout, /✖/);
  });

  it("exits non-zero when a fixture suite fails", { skip: isBun }, async () => {
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

  it("shows help and rejects unknown options", async () => {
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
