import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { Identity } from "@reticulum/core";
import { FileStorageAdapter } from "@reticulum/node";
import { loadOrCreateIdentity } from "../src/identity.js";

describe("identity", () => {
  it("generates an identity on first run and reloads the same one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "noflo-identity-"));
    try {
      const rns = { storage: new FileStorageAdapter(dir) };
      const first = await loadOrCreateIdentity(/** @type {any} */ (rns));
      const firstHash = first.identityHash;
      assert.ok(firstHash);
      // The key was persisted into the storage directory
      const second = await loadOrCreateIdentity(/** @type {any} */ (rns));
      assert.deepEqual(second.identityHash, firstHash);
      // And it is a genuine Identity instance
      assert.ok(second instanceof Identity);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite a corrupt stored key", async () => {
    const dir = mkdtempSync(join(tmpdir(), "noflo-identity-corrupt-"));
    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(join(dir, "identity.key"), new Uint8Array(32));
      const rns = { storage: new FileStorageAdapter(dir) };
      await assert.rejects(
        loadOrCreateIdentity(/** @type {any} */ (rns)),
        /refusing to overwrite/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
