import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { acquireHostLock } from "../src/runner.js";

/** @returns {string} */
function storageDir() {
  return mkdtempSync(join(tmpdir(), "noflo-host-lock-"));
}

describe("host lock", () => {
  it("acquires and releases cleanly", () => {
    const storage = storageDir();
    const release = acquireHostLock(storage);
    assert.ok(existsSync(join(storage, "noflo-host.lock")));
    release();
    assert.equal(existsSync(join(storage, "noflo-host.lock")), false);
    // Idempotent
    release();
  });

  it("rejects a second host sharing the identity storage", () => {
    const storage = storageDir();
    const release = acquireHostLock(storage);
    try {
      assert.throws(
        () => acquireHostLock(storage),
        /Two runtimes cannot share one identity/,
      );
    } finally {
      release();
    }
  });

  it("breaks a stale lock left by a dead process", () => {
    const storage = storageDir();
    // A real pid that has already exited
    const dead = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
    writeFileSync(join(storage, "noflo-host.lock"), `${dead.pid}`);
    const release = acquireHostLock(storage);
    assert.equal(
      readFileSync(join(storage, "noflo-host.lock"), "utf8"),
      `${process.pid}`,
      "the stale lock was replaced by ours",
    );
    release();
  });

  it("does not break a lock held by a live foreign pid", () => {
    const storage = storageDir();
    writeFileSync(join(storage, "noflo-host.lock"), `${process.pid}`);
    assert.throws(
      () => acquireHostLock(storage),
      new RegExp(`pid ${process.pid}`),
    );
  });

  it("supports per-instance storages side by side", () => {
    const first = storageDir();
    const second = storageDir();
    const releaseA = acquireHostLock(first);
    const releaseB = acquireHostLock(second);
    releaseA();
    releaseB();
  });
});
