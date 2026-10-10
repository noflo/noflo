import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAPABILITIES, config, loadForLibrary } from "../src/settings.js";

describe("settings", () => {
  describe("loadForLibrary", () => {
    it("applies defaults and generated values", async () => {
      const settings = await loadForLibrary({
        baseDir: new URL("./fixtures/host/", import.meta.url).pathname,
      });
      assert.ok(settings.storage.endsWith(".noflo/rns"));
      assert.ok(settings.dacarStore);
      assert.equal(settings.batch, undefined);
    });

    it("generates the node name from the project package", async () => {
      const settings = await loadForLibrary({
        baseDir: new URL("./fixtures/host/", import.meta.url).pathname,
      });
      // The fixture package is named noflo-host-fixture
      assert.equal(settings.name, "noflo-host-fixture NoFlo runtime");
    });

    it("lets options override env and defaults", async () => {
      process.env.DACAR_HOME = "/tmp/dacar-env";
      try {
        const settings = await loadForLibrary({
          dacarStore: "/tmp/dacar-option",
        });
        assert.equal(settings.dacarStore, "/tmp/dacar-option");
        const envSettings = await loadForLibrary({});
        assert.equal(envSettings.dacarStore, "/tmp/dacar-env");
      } finally {
        delete process.env.DACAR_HOME;
      }
      const defaultSettings = await loadForLibrary({});
      assert.ok(defaultSettings.dacarStore.endsWith(".dacar"));
    });

    it("rejects malformed Dacar object ids and relations", async () => {
      await assert.rejects(
        loadForLibrary({ dacarObject: "" }),
        /dacarObject must be a non-empty string/,
      );
    });
  });

  describe("config schema", () => {
    it("marks transient options as skipSave", () => {
      assert.equal(config.graph.skipSave, true);
      assert.equal(config.batch.skipSave, true);
      assert.equal(config.trace.skipSave, undefined);
    });

    it("derives CLI flags by kebab-casing with aliases", () => {
      assert.equal(config.baseDir.cli, "base-dir");
      assert.equal(config.rnsHost.cli, "rns-host");
      assert.equal(config.dacarStore.cli, "dacar-store");
      assert.equal(config.dacarStore.env, "DACAR_HOME");
    });

    it("lists the DACAR capability vocabulary", () => {
      for (const capability of [
        "GRAPH_READ",
        "GRAPH_EDIT",
        "TELEMETRY_READ",
        "COMPONENT_WRITE",
        "LIFECYCLE_CTRL",
      ]) {
        assert.ok(CAPABILITIES.includes(capability));
      }
    });
  });
});
