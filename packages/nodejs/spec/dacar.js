import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DacarFileAdapter } from "@reticulum/dacar/cli/fileStore";
import { DacarStore } from "@reticulum/dacar/cli/store";
import { loadDacarPolicy } from "../src/dacar.js";

describe("dacar policy", () => {
  it("returns null for a missing or uninitialized store", async () => {
    const missing = join(tmpdir(), `noflo-dacar-missing-${Date.now()}`);
    assert.equal(
      await loadDacarPolicy({ storePath: missing }),
      null,
      "a missing store must not throw — the host runs deny-closed",
    );
    const uninitialized = mkdtempSync(join(tmpdir(), "noflo-dacar-uninit-"));
    try {
      assert.equal(await loadDacarPolicy({ storePath: uninitialized }), null);
    } finally {
      rmSync(uninitialized, { recursive: true, force: true });
    }
  });

  it("builds a policy from a store the dacar CLI maintains", async () => {
    const storeDir = mkdtempSync(join(tmpdir(), "noflo-dacar-store-"));
    try {
      // `dacar init` in CLI terms: bootstrap config + empty state, in the
      // Python-parity loose-file layout the CLIs read and write
      await DacarStore.init(new DacarFileAdapter(storeDir), {});
      const loaded = await loadDacarPolicy({
        storePath: storeDir,
        objectId: "noflo.runtime/test",
      });
      assert.ok(loaded);
      assert.ok(loaded.policy);
      // Refresh re-reads the state without error
      await loaded.refresh();

      // The policy resolves deny-closed against the empty plane: an unknown
      // grantee gets no capabilities.
      const mask = await loaded.policy.resolve(
        "a".repeat(32),
        /** @type {any} */ ({}),
      );
      assert.equal(mask, 0);
    } finally {
      rmSync(storeDir, { recursive: true, force: true });
    }
  });
});
