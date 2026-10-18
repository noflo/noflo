// Work document #36 verification (2026-10-18): four items were recorded
// as open across this document's updates; substantial engine work has
// landed since they were written (the firing model #47, the scoped
// liveness #45, bounded edges #38, the deterministic closing #45/#46).
// These specs verify — against the current engine — whether each is
// still open, pinning the current behavior either way.
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createNodeModulesRegistry } from "@noflo/loader-node";
import noflo from "@noflo/noflo";
import { asAssembly, wrapAssembly } from "../src/index.js";

const baseDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The adapter components the generated adapter graphs reference — the
 * same registration the asAssembly spec's makeLoader performs.
 */
async function makeLoader() {
  const registry = await createNodeModulesRegistry(baseDir, {});
  const loader = new noflo.ComponentLoader({ registry });
  const adapters = [
    "ExtractField",
    "ToField",
    "CollectFields",
    "ToAssembly",
    "FromAssembly",
    "Fork",
    "Merge",
    "All",
  ];
  for (const name of adapters) {
    const mod = await import(`@noflo/assembly-utils/components/${name}.js`);
    loader.registerComponent("assembly-utils", name, {
      getComponent: (metadata) => mod.getComponent(metadata),
    });
  }
  return loader;
}

describe("wd #36 verification: adapter bracket correlation", () => {
  it("correlates bracketed inner streams across concurrent scoped messages", async () => {
    // The gap this verifies (the "cleaner end state" the jekyll pipeline
    // sidesteps): a wrapped adapter whose inner emits bracketed streams,
    // with concurrent messages — the collections must pair per message,
    // the bracketed stream collecting under its own message's field
    const loader = await makeLoader();
    loader.registerComponent("test", "Inner", {
      getComponent: () => {
        const c = new noflo.Component();
        c.inPorts.add("source", { datatype: "all", required: true });
        c.outPorts.add("destination", { datatype: "all" });
        c.outPorts.add("error", { datatype: "object" });
        c.process((input, output) => {
          if (!input.hasData("source")) {
            return;
          }
          const value = input.getData("source");
          output.send(new noflo.IP("openBracket", value));
          output.send({ destination: `content:${value}` });
          output.send(new noflo.IP("closeBracket", value));
          output.done();
        });
        return c;
      },
    });
    const inner = await loader.load("test/Inner");
    const graph = asAssembly(inner, { target: "test/Inner" });
    loader.registerComponent("test", "Wrapped", graph);
    const instance = await loader.load("test/Wrapped");
    const sockets = {};
    for (const name of ["msg", "out"]) {
      const socket = new noflo.internalSocket.createSocket();
      const port =
        name === "out"
          ? instance.outPorts.ports.out
          : instance.inPorts.ports[name];
      port.attach(socket);
      sockets[name] = socket;
    }
    const received = [];
    sockets.out.addEventListener("ip", (event) => {
      if (event.detail.type === "data") {
        received.push({ scope: event.detail.scope, data: event.detail.data });
      }
    });

    instance.start(() => {});
    // Two concurrent messages, each scoped; the inner emits a bracketed
    // stream per message
    sockets.msg.post(
      new noflo.IP("data", { errors: [], source: "a.md" }, { scope: "msg-1" }),
    );
    sockets.msg.post(
      new noflo.IP("data", { errors: [], source: "b.md" }, { scope: "msg-2" }),
    );
    await new Promise((resolve) => {
      const check = () => {
        if (received.length >= 2) {
          resolve();
          return;
        }
        setTimeout(check, 20);
      };
      setTimeout(check, 100);
    });

    assert.equal(received.length, 2, "one collected output per message");
    const scopes = received.map((entry) => entry.scope);
    assert.ok(
      scopes.includes("msg-1") && scopes.includes("msg-2"),
      `the outputs carry their own scopes — got ${scopes.join(", ")}`,
    );
    for (const entry of received) {
      assert.match(
        entry.data.destination,
        /content:\w+\.md$/,
        "each message's stream collected under its own message",
      );
    }
    // Close the boundary: the wrapper's start context pops when the
    // inner network ends (the same closedown discipline the asAssembly
    // specs pin)
    const ended = new Promise((resolve) => {
      instance.network.addEventListener("end", resolve);
    });
    sockets.msg.disconnect();
    await Promise.race([
      ended,
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    assert.equal(instance.load, 0, "the closedown cascade completed");
  });
});

describe("wd #36 verification: bare-class component definitions", () => {
  it("constructs a registered bare class (the loader finding, fixed)", async () => {
    // The incidental finding (work document #36, the update-#11 era):
    // ComponentLoader.createComponent's factory-function branch called
    // the definition without `new`, so a bare class registered directly
    // threw. The loader now detects the class shape (prototype.constructor
    // identity plus the class-source prefix) and constructs it; factory
    // functions keep the plain-call contract.
    class Bare extends noflo.Component {
      constructor() {
        super({
          inPorts: { in: { datatype: "all" } },
          outPorts: { out: { datatype: "all" } },
        });
      }
    }
    const loader = new noflo.ComponentLoader({});
    loader.registerComponent("test", "Bare", Bare);
    const instance = await loader.load("test/Bare");
    assert.ok(instance, "the bare class constructed");
    assert.strictEqual(instance.constructor.name, "Bare");
  });
});

describe("wd #36 verification: wrapAssembly subgraph support", () => {
  it("documents the current shape: a stock subgraph target", async () => {
    // The capability gap (work document #35 update #15): stock subgraphs
    // cannot become assembly participants — wrapAssembly skips graph
    // definitions with a report. Verified against the current
    // wrapAssembly: the skip either remains (the capability is still
    // open) or the graph wraps (if implemented). This spec pins the
    // current behavior.
    const catalog = {
      "yaml/ParseFrontmatter": {
        // A graph definition: the shape wrapAssembly must one day wrap
        getComponent: () => {
          const graph = noflo.importFbpJson({
            processes: { fm: { component: "test/Anything" } },
            connections: [],
          });
          return graph;
        },
      },
      "test/Anything": {
        getComponent: () => {
          const c = new noflo.Component();
          c.inPorts.add("in", { datatype: "all" });
          c.outPorts.add("out", { datatype: "all" });
          c.process(() => {});
          return c;
        },
      },
    };
    /** @type {Array<{ name: string, reason: string }>} */
    const skipped = [];
    const decorated = wrapAssembly(
      { list: () => catalog, get: async (name) => catalog[name] },
      {
        libraries: [{ library: "yaml", mapping: {} }],
        onSkip: (report) => skipped.push(report),
      },
    );
    void decorated;
    const skip = skipped.find((s) => s.name === "yaml/ParseFrontmatter");
    assert.ok(skip, "the graph definition was reported");
    // The current reason is asAssembly's own rejection (the module's
    // getComponent shape reaches asAssembly, which rejects the
    // GraphModel) — the capability gap's observable today
    assert.match(
      skip.reason,
      /must be a component instance with inPorts and outPorts/,
      "the graph definition is skipped, not wrapped",
    );
  });
});
