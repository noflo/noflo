import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";

import {
  derivePlatforms,
  generateManifest,
  normalizeLibraryName,
  readLibraryIdentity,
  readSource,
} from "../src/index.js";

// A fixture library: two elementary components (one browser-capable, one
// Node-only), a graph wiring a cross-library reference, a spec file, and
// an Assembly Line component
const fixtureDir = path.join("test", "fixtures", "library");

before(() => {
  // The fixture library is committed: no regeneration, so the linted
  // sources are exactly what the manifest generator reads
  for (const required of [
    "package.json",
    "components/BrowserThing.js",
    "components/NodeThing.js",
    "components/AssemblyThing.js",
    "graphs/Pipeline.fbp",
    "spec/BrowserThing.yaml",
  ]) {
    assert.ok(
      fs.existsSync(path.join(fixtureDir, required)),
      `fixture missing: ${required}`,
    );
  }
});

describe("normalizeLibraryName", () => {
  it("strips scopes and noflo prefixes", () => {
    assert.equal(normalizeLibraryName("@noflo/strings"), "strings");
    assert.equal(normalizeLibraryName("noflo-filesystem"), "filesystem");
    assert.equal(normalizeLibraryName("noflo"), "");
  });
});

describe("readLibraryIdentity", () => {
  it("reads the identity from package.json", () => {
    const identity = readLibraryIdentity(fixtureDir);
    assert.equal(identity.id, "testlib");
    assert.equal(identity.npm, "@noflo/testlib");
    assert.equal(identity.icon, "cog");
    assert.equal(identity.loader, false);
  });
});

describe("derivePlatforms", () => {
  it("declares browser capability for Web-standard components", () => {
    assert.deepEqual(
      derivePlatforms(path.join(fixtureDir, "components", "BrowserThing.js")),
      ["browser", "node", "deno", "bun"],
    );
  });

  it("qualifies node: imports as server-side", () => {
    assert.deepEqual(
      derivePlatforms(path.join(fixtureDir, "components", "NodeThing.js")),
      ["node", "deno", "bun"],
    );
  });

  it("qualifies third-party imports as node-only", () => {
    // A scratch directory, so the third-party fixture does not leak
    // into the shared manifest fixture (whose generation executes the
    // component modules)
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "noflo-manifest-"));
    fs.writeFileSync(
      path.join(scratch, "DepThing.js"),
      'import slug from "slug";\nimport { Component } from "@noflo/noflo";\nexport function getComponent() {\n  return new Component({});\n}\n',
    );
    assert.deepEqual(derivePlatforms(path.join(scratch, "DepThing.js")), [
      "node",
    ]);
    fs.rmSync(scratch, { recursive: true, force: true });
  });
});

describe("generateManifest", () => {
  /** @type {import("../src/index.js").Manifest} */
  let manifest;

  before(async () => {
    manifest = await generateManifest(fixtureDir);
  });

  it("self-describes the library", () => {
    assert.equal(manifest.format, "noflo-manifest");
    assert.equal(manifest.version, 1);
    assert.equal(manifest.id, "testlib");
    assert.equal(manifest.npm, "@noflo/testlib");
    assert.equal(manifest.description, "Manifest test fixture");
    assert.equal(manifest.icon, "cog");
    assert.equal(manifest.loader, false);
  });

  it("covers every component and graph", () => {
    const names = manifest.components.map((c) => c.name);
    assert.deepEqual(names, [
      "testlib/AssemblyThing",
      "testlib/BrowserThing",
      "testlib/NodeThing",
      "testlib/CustomName",
      "testlib/Pipeline",
    ]);
  });

  it("harvests elementary signatures matching the live instance", () => {
    const browserThing =
      /** @type {import("../src/index.js").ManifestComponent} */ (
        manifest.components.find((c) => c.name === "testlib/BrowserThing")
      );
    assert.equal(browserThing.type, "elementary");
    assert.equal(browserThing.description, "Runs everywhere");
    assert.equal(browserThing.icon, "globe");
    assert.deepEqual(
      browserThing.signature.inports.map((p) => ({
        name: p.name,
        datatype: p.datatype,
        required: p.required,
        control: p.control,
        addressable: p.addressable,
      })),
      [
        {
          name: "in",
          datatype: "string",
          required: true,
          control: false,
          addressable: false,
        },
      ],
    );
  });

  it("associates fbp-spec suites by basename", () => {
    const browserThing =
      /** @type {import("../src/index.js").ManifestComponent} */ (
        manifest.components.find((c) => c.name === "testlib/BrowserThing")
      );
    assert.equal(browserThing.spec, "spec/BrowserThing.yaml");
    const nodeThing =
      /** @type {import("../src/index.js").ManifestComponent} */ (
        manifest.components.find((c) => c.name === "testlib/NodeThing")
      );
    assert.equal(nodeThing.spec, null);
  });

  it("derives platforms from static imports", () => {
    const browserThing =
      /** @type {import("../src/index.js").ManifestComponent} */ (
        manifest.components.find((c) => c.name === "testlib/BrowserThing")
      );
    assert.deepEqual(browserThing.platforms, [
      "browser",
      "node",
      "deno",
      "bun",
    ]);
    const nodeThing =
      /** @type {import("../src/index.js").ManifestComponent} */ (
        manifest.components.find((c) => c.name === "testlib/NodeThing")
      );
    assert.deepEqual(nodeThing.platforms, ["node", "deno", "bun"]);
  });

  it("detects the Assembly Line convention", () => {
    const assemblyThing =
      /** @type {import("../src/index.js").ManifestComponent} */ (
        manifest.components.find((c) => c.name === "testlib/AssemblyThing")
      );
    assert.equal(assemblyThing.assembly, true);
    const browserThing =
      /** @type {import("../src/index.js").ManifestComponent} */ (
        manifest.components.find((c) => c.name === "testlib/BrowserThing")
      );
    assert.equal(browserThing.assembly, false);
  });

  it("derives graph signatures statically and lists references", () => {
    const pipeline =
      /** @type {import("../src/index.js").ManifestComponent} */ (
        manifest.components.find((c) => c.name === "testlib/Pipeline")
      );
    assert.equal(pipeline.type, "subgraph");
    assert.deepEqual(
      pipeline.signature.inports.map((p) => p.name),
      ["in"],
    );
    assert.deepEqual(
      pipeline.signature.outports.map((p) => p.name),
      ["out"],
    );
    assert.deepEqual(pipeline.references, [
      "testlib/BrowserThing",
      "otherlib/Thing",
      "legacy/LegacyThing",
    ]);
  });

  it("resolves the namespaces map from installed providers", () => {
    assert.deepEqual(manifest.namespaces, {
      otherlib: { npm: "@noflo/otherlib" },
      legacy: { npm: "noflo-legacy" },
    });
  });

  it("computes graph platforms from its references", () => {
    const pipeline =
      /** @type {import("../src/index.js").ManifestComponent} */ (
        manifest.components.find((c) => c.name === "testlib/Pipeline")
      );
    // BrowserThing is browser-capable; otherlib/Thing and
    // legacy/LegacyThing have no published manifests, so they qualify
    // node-only and the intersection is node-only
    assert.deepEqual(pipeline.platforms, ["node"]);
  });

  it("supports the @name source-comment override", () => {
    const renamed = manifest.components.find(
      (c) => c.name === "testlib/CustomName",
    );
    assert.ok(renamed, "CustomName should be present");
  });

  it("records the revision", async () => {
    const withRevision = await generateManifest(fixtureDir, {
      revision: "abc123",
    });
    assert.equal(withRevision.revision, "abc123");
  });
});

describe("manifest failure modes", () => {
  it("fails loudly when a referenced namespace has no installed provider", async () => {
    const brokenDir = "test/fixtures/broken-refs";
    fs.rmSync(brokenDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(brokenDir, "components"), { recursive: true });
    fs.mkdirSync(path.join(brokenDir, "graphs"), { recursive: true });
    fs.writeFileSync(
      path.join(brokenDir, "package.json"),
      JSON.stringify({ name: "@noflo/broken", type: "module" }),
    );
    fs.writeFileSync(
      path.join(brokenDir, "components", "Passthrough.js"),
      'import { Component } from "@noflo/noflo";\nexport function getComponent() {\n  return new Component({});\n}\n',
    );
    fs.writeFileSync(
      path.join(brokenDir, "graphs", "Wiring.fbp"),
      "INPORT=Thing.in:in\nOUTPORT=Thing.out:out\nThing(missing/Thing)\n",
    );
    await assert.rejects(
      () => generateManifest(brokenDir),
      /Namespaces without an installed provider: missing/,
    );
    fs.rmSync(brokenDir, { recursive: true, force: true });
  });
});

describe("readSource", () => {
  it("reads the revision from a git checkout", () => {
    const { source, revision } = readSource(process.cwd());
    assert.ok(source === null || source.startsWith("https://"));
    // A real checkout resolves HEAD, never a ref name
    if (fs.existsSync(path.join(process.cwd(), ".git"))) {
      assert.match(revision ?? "", /^[0-9a-f]{40}$/);
    }
  });

  it("yields nulls outside a git checkout", () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "noflo-manifest-"));
    fs.writeFileSync(
      path.join(scratch, "package.json"),
      JSON.stringify({
        name: "@noflo/scratch",
        repository: { url: "https://github.com/example/scratch" },
      }),
    );
    const { source, revision } = readSource(scratch);
    assert.equal(source, "https://github.com/example/scratch");
    assert.equal(revision, null);
    fs.rmSync(scratch, { recursive: true, force: true });
  });
});
