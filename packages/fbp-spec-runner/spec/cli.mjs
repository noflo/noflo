import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { describe, it } from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

describe("fbp-spec-runner CLI", () => {
  it("runs passing fixture suites and exits zero", async () => {
    const { stdout } = await run(
      process.execPath,
      [
        "src/cli.js",
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

  it("exits non-zero when a fixture suite fails", async () => {
    await assert.rejects(
      run(
        process.execPath,
        [
          "src/cli.js",
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
    const { stdout } = await run(process.execPath, ["src/cli.js", "--help"]);
    assert.match(stdout, /Usage: fbp-spec-runner/);
    await assert.rejects(
      run(process.execPath, ["src/cli.js", "--frob"]),
      /Unknown option/,
    );
  });
});
