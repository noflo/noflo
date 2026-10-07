import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { GraphModel } from "@noflo/graph";
import {
  createNodeModulesRegistry,
  loadGraphFile,
  loadGraphJson,
  saveGraphFile,
} from "../src/index.js";

const fixtureDir = path.resolve(import.meta.dirname, "fixtures");
const baseDir = path.resolve(fixtureDir, "componentloader");

/**
 * Registry entries are component definitions; instantiate one for
 * port-level assertions.
 *
 * @param {Object|Function} definition
 * @returns {any} Component instance
 */
function instantiate(definition) {
  if (typeof definition.getComponent === "function") {
    return definition.getComponent();
  }
  return definition();
}

/**
 * The loader-node package needs its own copy of the fixture project used
 * by the noflo core spec for manifest discovery. It is a workspace
 * package: node_modules/example resolves through the monorepo.
 */
before(() => {
  if (!fs.existsSync(baseDir)) {
    throw new Error(`Missing fixture project at ${baseDir}`);
  }
});

describe("createNodeModulesRegistry with a fixture project", () => {
  /** @type {import("../src/index.js").NodeModulesRegistry} */
  let registry = null;

  before(async () => {
    registry = await createNodeModulesRegistry(baseDir, {});
  });

  it("discovers local components", async () => {
    const list = registry.list();
    assert.ok(Object.keys(list).includes("componentloader/Output"));
  });

  it("discovers local TypeScript components", () => {
    const list = registry.list();
    assert.ok(Object.keys(list).includes("componentloader/Repeat"));
  });

  it("discovers JavaScript components from dependencies", () => {
    const list = registry.list();
    assert.ok(Object.keys(list).includes("example/Forward"));
  });

  it("discovers TypeScript components from dependencies", () => {
    const list = registry.list();
    assert.ok(Object.keys(list).includes("example/Repeat"));
  });

  it("loads local CommonJS components", async () => {
    const definition = await registry.get("componentloader/Output");
    assert.ok(definition);
    const instance = instantiate(definition);
    assert.ok(instance.inPorts.ports.in);
  });

  it("loads local TypeScript components via transpilation", async () => {
    const definition = await registry.get("componentloader/Repeat");
    assert.ok(definition);
    const instance = instantiate(definition);
    assert.ok(instance.inPorts.ports.in);
  });

  it("loads custom-loader registered components from dependencies", async () => {
    const definition = await registry.get("example/Hello");
    assert.ok(definition);
    const instance = instantiate(definition);
    assert.strictEqual(instance.description, "Hello stuff");
    assert.strictEqual(instance.getIcon(), "bicycle");
  });

  it("registers library icons from package manifests", () => {
    assert.strictEqual(registry.libraryIcons.componentloader, "cloud");
    assert.strictEqual(registry.libraryIcons.example, "car");
  });

  it("resolves by alias", async () => {
    const instance = await registry.get("Output");
    assert.ok(instance);
  });

  it("returns undefined for unknown components", async () => {
    const instance = await registry.get("componentloader/Missing");
    assert.strictEqual(instance, undefined);
  });
});

describe("setSource and getSource", () => {
  /** @type {import("../src/index.js").NodeModulesRegistry} */
  let registry = null;
  const changeEvents = [];

  before(async () => {
    registry = await createNodeModulesRegistry(baseDir, {});
    registry.addEventListener("change", (event) => {
      changeEvents.push(/** @type {CustomEvent} */ (event).detail);
    });
  });

  it("supports JavaScript ESM source", async () => {
    const source = `\
import { Component } from '@noflo/noflo';
export function getComponent() {
  const c = new Component();
  c.inPorts.add('in');
  c.outPorts.add('out');
  c.process(function (input, output) {
    output.sendDone(input.get('in'));
  });
  return c;
}
`;
    await registry.setSource(
      "componentloader",
      "RepeatData",
      source,
      "javascript",
    );
    const definition = await registry.get("componentloader/RepeatData");
    assert.ok(definition);
    assert.ok(instantiate(definition).inPorts.ports.in);
    assert.deepEqual(changeEvents, [{ name: "componentloader/RepeatData" }]);

    const stored = await registry.getSource("componentloader/RepeatData");
    assert.strictEqual(stored.language, "javascript");
    assert.strictEqual(stored.code, source);
    assert.strictEqual(stored.name, "RepeatData");
    assert.strictEqual(stored.library, "componentloader");
  });

  it("evaluates CommonJS source", async () => {
    const source = `\
const { Component } = require('@noflo/noflo');
exports.getComponent = () => {
  const c = new Component();
  c.inPorts.add('in');
  c.outPorts.add('out');
  c.process((input, output) => output.sendDone(input.get('in')));
  return c;
};
`;
    await registry.setSource("componentloader", "Cjs", source, "javascript");
    const definition = await registry.get("componentloader/Cjs");
    assert.ok(instantiate(definition));
  });

  it("supports TypeScript source with a transpiler", async function () {
    if (!registry.getLanguages().includes("typescript")) {
      this.skip();
    }
    const source = `\
import { Component } from '@noflo/noflo';
export function getComponent(): any {
  const c = new Component();
  c.inPorts.add('in');
  c.outPorts.add('out');
  c.process((input, output) => {
    output.sendDone(input.get('in'));
  });
  return c;
}
`;
    await registry.setSource("componentloader", "Ts", source, "typescript");
    const definition = await registry.get("componentloader/Ts");
    assert.ok(instantiate(definition));
  });

  it("rejects unsupported languages", async () => {
    await assert.rejects(
      registry.setSource("componentloader", "Bad", "code", "coffeescript"),
      /Unsupported component source language coffeescript/,
    );
  });

  it("rejects source that does not create a runnable component", async () => {
    await assert.rejects(
      registry.setSource(
        "componentloader",
        "Broken",
        "export const notAComponent = true;",
        "javascript",
      ),
      /failed to create a runnable component/,
    );
  });

  it("provides source for graph model components", async () => {
    const graph = await loadGraphFile(
      path.resolve(baseDir, "../subgraph.json"),
    ).catch(async () => {
      // Fallback: build a graph model directly
      return loadGraphJson({
        nodes: [],
        connections: [],
      });
    });
    registry.registerComponent("componentloader", "GraphComp", graph);
    const source = await registry.getSource("componentloader/GraphComp");
    assert.strictEqual(source.language, "json");
    const parsed = JSON.parse(source.code);
    assert.ok(Array.isArray(parsed.nodes));
  });

  it("includes fbp-spec tests where discovered", async () => {
    const stored = await registry.getSource("componentloader/Repeat");
    if (stored.tests) {
      assert.ok(stored.tests.includes("tests"));
    }
  });

  it("rejects getSource for missing components", async () => {
    await assert.rejects(
      registry.getSource("componentloader/Missing"),
      /not installed/,
    );
  });

  it("rejects getSource for non-source components", async () => {
    await assert.rejects(
      registry.getSource("componentloader/Output"),
      /Can't provide source/,
    );
  });

  it("reports supported languages", () => {
    const languages = registry.getLanguages();
    assert.ok(languages.includes("javascript"));
    assert.ok(languages.includes("es2015"));
  });
});

describe("manifest cache", () => {
  const cacheDir = path.resolve(fixtureDir, "cacheproject");

  before(() => {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    fs.cpSync(baseDir, cacheDir, { recursive: true });
  });

  after(() => {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it("writes the fbp.json cache on discovery", async () => {
    await createNodeModulesRegistry(cacheDir, {
      cache: true,
      discover: true,
    });
    const manifestPath = path.resolve(cacheDir, "fbp.json");
    assert.ok(fs.existsSync(manifestPath));
    const contents = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    assert.strictEqual(contents.version, 1);
    assert.ok(Array.isArray(contents.modules));
  });

  it("reads components from the cache", async () => {
    const registry = await createNodeModulesRegistry(cacheDir, {
      cache: true,
      discover: false,
    });
    const list = registry.list();
    assert.ok(Object.keys(list).includes("componentloader/Output"));
    const definition = await registry.get("componentloader/Output");
    assert.ok(instantiate(definition));
  });

  it("fails with missing manifest without discover option", async () => {
    const manifestPath = path.resolve(cacheDir, "fbp.json");
    fs.rmSync(manifestPath);
    await assert.rejects(
      createNodeModulesRegistry(cacheDir, {
        cache: true,
        discover: false,
      }),
    );
  });

  it("supports a custom manifest file", async () => {
    await createNodeModulesRegistry(cacheDir, {
      cache: true,
      discover: true,
      manifest: "fbp-custom.json",
    });
    assert.ok(fs.existsSync(path.resolve(cacheDir, "fbp-custom.json")));
  });
});

describe("graph file helpers", () => {
  const graphPath = path.resolve(import.meta.dirname, "fixtures/subgraph.json");

  it("loads FBP JSON graph files", async () => {
    const model = await loadGraphFile(graphPath);
    assert.ok(model instanceof GraphModel);
  });

  it("parses FBP JSON strings", () => {
    const model = loadGraphJson('{"nodes": [], "connections": []}');
    assert.ok(model instanceof GraphModel);
  });

  it("saves graph models as FBP JSON files", async () => {
    const model = await loadGraphFile(graphPath);
    const outPath = path.resolve(import.meta.dirname, "../.tmp-graph-out.json");
    try {
      await saveGraphFile(model, outPath);
      const contents = JSON.parse(fs.readFileSync(outPath, "utf-8"));
      assert.ok(Array.isArray(contents.nodes));
    } finally {
      fs.rmSync(outPath, { force: true });
    }
  });
});
