import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { importFbpJson } from "@noflo/graph";
import { Subgraph } from "../src/components/Subgraph.js";
import * as noflo from "../src/lib/NoFlo.js";
import { nativeGraph } from "./utils/nativeGraph.mjs";

/* eslint-disable
  max-classes-per-file
*/

/**
 * Read an FBP JSON fixture as a plain object.
 *
 * @param {string} name
 * @returns {Object<string, any>}
 */
function readGraphJson(name) {
  const file = fileURLToPath(
    new URL(`./fixtures/${name}.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(file, "utf-8"));
}

/**
 * Create a ready component implementation for a pass-through component.
 *
 * @param {string} [name]
 * @returns {Object} Module component
 */
function makeSplit(name) {
  const inst = new noflo.Component({
    inPorts: {
      in: { datatype: "string" },
    },
    outPorts: {
      out: { datatype: "string" },
    },
    process(input, output) {
      output.sendDone(input.get("in"));
    },
  });
  if (name) {
    inst.nodeId = name;
  }
  return inst;
}

/** @returns {Object} Module component wrapping a Split factory */
function splitModule() {
  return {
    getComponent: () => makeSplit(),
  };
}

/** @returns {Function} Component factory */
function splitFactory() {
  return () => makeSplit();
}

describe("ComponentLoader", () => {
  describe("constructed with an application-supplied registry", () => {
    let loader = null;
    let registry = null;
    let getCalls = 0;

    beforeEach(() => {
      getCalls = 0;
      registry = {
        list: () => ({
          "registry/Split": splitModule(),
        }),
        get: async (name) => {
          getCalls += 1;
          if (name === "dummy/NoOp") {
            // #593: no-op dummy components for top-down design
            return {
              getComponent: () => {
                const c = new noflo.Component();
                c.inPorts.add("in");
                c.outPorts.add("out");
                c.process((_input, output) => output.done());
                return c;
              },
            };
          }
          return undefined;
        },
      };
      loader = new noflo.ComponentLoader({ registry });
    });

    it("reads the registry catalog synchronously at construction", () => {
      assert.ok(Object.keys(loader.components).includes("registry/Split"));
    });

    it("has no ready/processing machinery", () => {
      assert.strictEqual(loader.ready, undefined);
      assert.strictEqual(loader.processing, undefined);
    });

    it("listComponents resolves the populated catalog", async () => {
      const components = await loader.listComponents();
      assert.strictEqual(components, loader.components);
      assert.ok(Object.keys(components).includes("registry/Split"));
    });

    it("loads registry-supplied components", async () => {
      const instance = await loader.load("registry/Split");
      assert.strictEqual(typeof instance, "object");
      assert.ok(instance.inPorts.ports.in);
    });

    it("resolves unknown names through registry.get (#593 dummy support)", async () => {
      const instance = await loader.load("dummy/NoOp");
      assert.strictEqual(typeof instance, "object");
      assert.ok(getCalls > 0);
    });

    it("rejects names the registry cannot resolve", async () => {
      await assert.rejects(
        loader.load("registry/Missing"),
        /Component registry\/Missing not available/,
      );
    });

    it("loads components by alias", async () => {
      const instance = await loader.load("Split");
      assert.strictEqual(typeof instance, "object");
      assert.ok(instance.inPorts.ports.in);
    });

    it("supports EventTarget-based registry change events", async () => {
      /** @type {any} */
      const eventRegistry = new EventTarget();
      eventRegistry.list = () => ({
        "registry/Split": splitModule(),
      });
      eventRegistry.get = async (name) =>
        name === "registry/Updated" ? splitModule() : undefined;
      const l = new noflo.ComponentLoader({ registry: eventRegistry });
      eventRegistry.dispatchEvent(
        new CustomEvent("change", {
          detail: { name: "registry/Updated" },
        }),
      );
      // The change listener resolves the implementation asynchronously
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      assert.ok(Object.keys(l.components).includes("registry/Updated"));
    });

    it("supports EventTarget-based registry invalidate events", async () => {
      /** @type {any} */
      const eventRegistry = new EventTarget();
      eventRegistry.list = () => ({
        "registry/New": splitModule(),
      });
      const l = new noflo.ComponentLoader({ registry: eventRegistry });
      assert.ok(Object.keys(l.components).includes("registry/New"));
      // Simulate catalog evolution: change what list() returns
      eventRegistry.list = () => ({
        "registry/Other": splitModule(),
      });
      eventRegistry.dispatchEvent(new CustomEvent("invalidate"));
      assert.ok(Object.keys(l.components).includes("registry/Other"));
      assert.ok(!Object.keys(l.components).includes("registry/New"));
    });
  });

  describe("constructed without a registry", () => {
    it("supports manual registration only", async () => {
      const loader = new noflo.ComponentLoader();
      loader.registerComponent("my-project", "Split", splitModule());
      const components = await loader.listComponents();
      assert.ok(Object.keys(components).includes("my-project/Split"));
      const instance = await loader.load("my-project/Split");
      assert.ok(instance.inPorts.ports.in);
    });

    it("rejects unknown components", async () => {
      const loader = new noflo.ComponentLoader();
      await assert.rejects(
        loader.load("my-project/Missing"),
        /Component my-project\/Missing not available/,
      );
    });

    it("clear resets to the construction state", async () => {
      const registry = {
        list: () => ({
          "registry/Split": splitModule(),
        }),
      };
      const loader = new noflo.ComponentLoader({ registry });
      loader.registerComponent("extra", "Split", splitModule());
      assert.ok(Object.keys(loader.components).includes("extra/Split"));
      loader.clear();
      assert.ok(Object.keys(loader.components).includes("registry/Split"));
      assert.ok(!Object.keys(loader.components).includes("extra/Split"));
    });
  });

  describe("normalizing names", () => {
    const l = new noflo.ComponentLoader({});

    it("should return simple module names as-is", () => {
      assert.strictEqual(l.getModulePrefix("my-project"), "my-project");
    });
    it("should return empty for NoFlo core", () => {
      assert.strictEqual(l.getModulePrefix("noflo"), "");
    });
    it("should strip noflo-", () => {
      assert.strictEqual(l.getModulePrefix("noflo-my-project"), "my-project");
    });
    it("should strip NPM scopes", () => {
      assert.strictEqual(l.getModulePrefix("@foo/my-project"), "my-project");
    });
    it("should strip NPM scopes and noflo-", () => {
      assert.strictEqual(
        l.getModulePrefix("@foo/noflo-my-project"),
        "my-project",
      );
    });
    it("should normalize full component names", () => {
      assert.strictEqual(
        l.normalizeName("my-project", "Split"),
        "my-project/Split",
      );
      assert.strictEqual(l.normalizeName(null, "Split"), "Split");
    });
  });

  describe("detecting graphs", () => {
    const l = new noflo.ComponentLoader({});

    it("should recognize a live graph model", () => {
      assert.strictEqual(l.isGraph(nativeGraph("main")), true);
    });
    it("should recognize FBP JSON with nodes and edges", () => {
      assert.strictEqual(
        l.isGraph({
          nodes: [{ id: "a", component: "b" }],
          edges: [{ from: "a", to: "b" }],
        }),
        true,
      );
    });
    it("should recognize FBP JSON without edges", () => {
      assert.strictEqual(
        l.isGraph({
          nodes: [{ id: "a", component: "b" }],
        }),
        true,
      );
    });
    it("should recognize legacy NoFlo JSON shape", () => {
      assert.strictEqual(
        l.isGraph({
          processes: { a: { component: "b" } },
          connections: [],
        }),
        true,
      );
    });
    it("should not recognize objects without a nodes array", () => {
      assert.strictEqual(l.isGraph({ edges: [] }), false);
    });
    it("should not recognize strings (no path-based graph loading in core)", () => {
      assert.strictEqual(l.isGraph("some/file.json"), false);
    });
  });

  describe("loading components", () => {
    it("loads module components with getComponent", async () => {
      const loader = new noflo.ComponentLoader({
        registry: {
          list: () => ({
            "registry/Split": splitModule(),
          }),
        },
      });
      const instance = await loader.load("registry/Split");
      assert.ok(instance instanceof noflo.Component);
      assert.strictEqual(instance.componentName, "registry/Split");
    });

    it("loads factory-function components", async () => {
      const loader = new noflo.ComponentLoader({
        registry: {
          list: () => ({
            "registry/Split": splitFactory(),
          }),
        },
      });
      const instance = await loader.load("registry/Split");
      assert.ok(instance instanceof noflo.Component);
    });

    it("passes metadata to the factory", async () => {
      const loader = new noflo.ComponentLoader({
        registry: {
          list: () => ({
            "registry/Meta": {
              getComponent: (metadata) => {
                const c = makeSplit();
                if (metadata?.icon) {
                  c.setIcon(metadata.icon);
                }
                return c;
              },
            },
          }),
        },
      });
      const instance = await loader.load("registry/Meta", { icon: "bug" });
      assert.strictEqual(instance.getIcon(), "bug");
    });

    it("rejects invalid component types", async () => {
      const loader = new noflo.ComponentLoader({
        registry: {
          list: () => ({
            "registry/Bad": /** @type {any} */ (42),
          }),
        },
      });
      await assert.rejects(
        loader.load("registry/Bad"),
        /Invalid type number for component registry\/Bad/,
      );
    });

    it("sets a default icon for elementary components", async () => {
      const loader = new noflo.ComponentLoader({
        registry: {
          list: () => ({
            "registry/Split": splitModule(),
          }),
        },
      });
      const instance = await loader.load("registry/Split");
      assert.strictEqual(instance.getIcon(), "gear");
    });

    it("uses the library icon when registered", async () => {
      const loader = new noflo.ComponentLoader({
        registry: {
          list: () => ({
            "registry/Split": splitModule(),
          }),
        },
      });
      loader.setLibraryIcon("registry", "cloud");
      const instance = await loader.load("registry/Split");
      assert.strictEqual(instance.getIcon(), "cloud");
    });

    it("respects an icon set on the instance", async () => {
      const loader = new noflo.ComponentLoader({
        registry: {
          list: () => ({
            "registry/Split": {
              getComponent: () => {
                const c = makeSplit();
                c.setIcon("bug");
                return c;
              },
            },
          }),
        },
      });
      loader.setLibraryIcon("registry", "cloud");
      const instance = await loader.load("registry/Split");
      assert.strictEqual(instance.getIcon(), "bug");
    });

    it("warns on legacy components", async () => {
      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (message) => warnings.push(message);
      try {
        const loader = new noflo.ComponentLoader({
          registry: {
            list: () => ({
              "registry/Legacy": {
                getComponent: () => {
                  const c = new noflo.Component();
                  c.inPorts.add("in", { datatype: "string" });
                  c.outPorts.add("out", { datatype: "string" });
                  // Legacy components use the pre-Process-API handle-style
                  c.inPorts.in.on("data", () => {});
                  return c;
                },
              },
            }),
          },
        });
        const instance = await loader.load("registry/Legacy");
        assert.ok(instance.isLegacy());
      } finally {
        console.warn = originalWarn;
      }
      assert.ok(
        warnings.some((w) => w.includes("legacy NoFlo APIs")),
        "expected a legacy warning",
      );
    });
  });

  describe("loading a subgraph from a registry graph model", () => {
    let loader = null;
    /** @type {import("@noflo/graph").GraphModel} */
    let subgraphModel = null;

    before(() => {
      subgraphModel = importFbpJson(readGraphJson("subgraph"));
      loader = new noflo.ComponentLoader({
        registry: {
          list: () => ({
            "registry/ExampleSubgraph": subgraphModel,
            Split: splitModule(),
            Merge: splitModule(),
          }),
        },
      });
    });

    it("loads the graph model as a subgraph instance", async () => {
      const instance = await loader.load("registry/ExampleSubgraph");
      assert.ok(instance instanceof Subgraph);
    });

    it("removes the `graph` inport at instantiation", async () => {
      const instance = await loader.load("registry/ExampleSubgraph");
      assert.ok(!instance.inPorts.ports.graph);
    });

    it("exposes the exported graph ports", async () => {
      const instance = /** @type {any} */ (
        await loader.load("registry/ExampleSubgraph")
      );
      await new Promise((resolve) => {
        instance.once("ready", resolve);
      });
      assert.ok(instance.inPorts.ports.in);
      assert.ok(instance.outPorts.ports.out);
    });

    it("does not automatically start the subgraph", async () => {
      const instance = await loader.load("registry/ExampleSubgraph");
      await new Promise((resolve) => {
        instance.once("ready", resolve);
      });
      assert.strictEqual(instance.started, false);
    });

    it("sets the sitemap icon for subgraphs", async () => {
      const instance = await loader.load("registry/ExampleSubgraph");
      assert.strictEqual(instance.getIcon(), "sitemap");
    });

    it("loads FBP JSON definitions as subgraphs too", async () => {
      const l2 = new noflo.ComponentLoader({
        registry: {
          list: () => ({
            "registry/JsonSubgraph": readGraphJson("subgraph"),
            Split: splitModule(),
            Merge: splitModule(),
          }),
        },
      });
      const instance = await l2.load("registry/JsonSubgraph");
      assert.ok(instance instanceof Subgraph);
    });

    it("passes the loader to child networks so they share the registry", async () => {
      const instance = /** @type {any} */ (
        await loader.load("registry/ExampleSubgraph")
      );
      await new Promise((resolve) => {
        instance.once("ready", resolve);
      });
      assert.strictEqual(instance.network.loader, loader);
    });
  });

  describe("registering components at runtime", () => {
    let l = null;
    before(() => {
      l = new noflo.ComponentLoader({
        registry: {
          list: () => ({
            // The subgraph fixture resolves these inner components
            Split: splitModule(),
            Merge: splitModule(),
          }),
        },
      });
    });

    it("registers a module component", async () => {
      await l.registerComponent("my-project", "Split", splitModule());
      const instance = await l.load("my-project/Split");
      assert.ok(instance.inPorts.ports.in);
    });

    it("registers a graph model", async () => {
      await l.registerGraph(
        "my-project",
        "Sub",
        importFbpJson(readGraphJson("subgraph")),
      );
      const instance = await l.load("my-project/Sub");
      assert.ok(instance instanceof Subgraph);
    });

    it("supports the registerLoader plugin hook", async () => {
      const l2 = new noflo.ComponentLoader({});
      await l2.registerLoader((loader, callback) => {
        loader.registerComponent("plugin", "Split", splitModule());
        callback(null);
      });
      const instance = await l2.load("plugin/Split");
      assert.ok(instance.inPorts.ports.in);
    });

    it("rejects when the plugin hook fails", async () => {
      const l2 = new noflo.ComponentLoader({});
      await assert.rejects(
        l2.registerLoader((_loader, callback) => {
          callback(new Error("Plugin failed"));
        }),
        /Plugin failed/,
      );
    });
  });

  describe("deprecation warnings on callback-style methods", () => {
    let warnings = [];
    let originalWarn;
    let l = null;
    beforeEach(() => {
      warnings = [];
      originalWarn = console.warn;
      console.warn = (message) => warnings.push(message);
      l = new noflo.ComponentLoader({
        registry: {
          list: () => ({}),
        },
      });
    });

    it("listComponents with callback warns", async () => {
      await new Promise((resolve, reject) => {
        l.listComponents((err, components) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(components);
        });
      });
      console.warn = originalWarn;
      assert.ok(
        warnings.some((w) => w.includes("listComponents")),
        "expected listComponents deprecation warning",
      );
    });

    it("load with callback warns", async () => {
      l.registerComponent("my-project", "Split", splitModule());
      await new Promise((resolve, reject) => {
        l.load("my-project/Split", (err, instance) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(instance);
        });
      });
      console.warn = originalWarn;
      assert.ok(
        warnings.some((w) => w.includes("load is deprecated")),
        "expected load deprecation warning",
      );
    });

    it("registerComponent with callback warns", async () => {
      await new Promise((resolve) => {
        l.registerComponent("my-project", "Split2", splitModule(), () => {
          resolve();
        });
      });
      console.warn = originalWarn;
      assert.ok(
        warnings.some((w) => w.includes("registerComponent")),
        "expected registerComponent deprecation warning",
      );
    });

    it("registerGraph with callback warns", async () => {
      await new Promise((resolve) => {
        l.registerGraph(
          "my-project",
          "Sub2",
          importFbpJson(readGraphJson("subgraph")),
          () => {
            resolve();
          },
        );
      });
      console.warn = originalWarn;
      assert.ok(
        warnings.some(
          (w) => w.includes("registerGraph") || w.includes("registerComponent"),
        ),
        "expected registerGraph deprecation warning",
      );
    });

    it("registerLoader with callback warns", async () => {
      await new Promise((resolve, _reject) => {
        l.registerLoader(
          (_loader, callback) => {
            callback(null);
          },
          () => {
            resolve();
          },
        );
      });
      console.warn = originalWarn;
      assert.ok(
        warnings.some((w) => w.includes("registerLoader")),
        "expected registerLoader deprecation warning",
      );
    });
  });
});
