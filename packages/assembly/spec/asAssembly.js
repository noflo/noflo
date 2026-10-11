import assert from "node:assert/strict";
import { describe, it } from "node:test";
import noflo, { ComponentLoader } from "@noflo/noflo";
import { createNodeModulesRegistry } from "@noflo/loader-node";
import { asAssembly, wrapAssembly } from "../src/index.js";
import { exportFbpJson } from "@noflo/noflo";

const baseDir = new URL("../", import.meta.url).pathname;

async function makeLoader() {
  const registry = await createNodeModulesRegistry(baseDir, {});
  const loader = new noflo.ComponentLoader({ registry });
  // The adapter components the generated graphs reference
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
      getComponent: () => mod.getComponent(),
    });
  }
  return loader;
}

// A plain regular component, in the style of the migrated libraries
class CopyLike extends noflo.Component {
  constructor() {
    super({
      description: "Copies a value from source to destination field",
      inPorts: {
        source: { datatype: "all", required: true },
        encoding: { datatype: "string", control: true, default: "utf-8" },
      },
      outPorts: {
        destination: { datatype: "all" },
        error: { datatype: "object" },
      },
    });
    this.wire();
  }

  wire() {
    this.process((input, output) => {
      if (!input.hasData("source", "encoding")) {
        return;
      }
      const value = input.getData("source");
      output.sendDone({
        destination: `${value}:${input.getData("encoding")}`,
      });
    });
  }
}

class SideEffectOnly extends noflo.Component {
  constructor() {
    super({
      description: "Logs and relays nothing back",
      inPorts: {
        payload: { datatype: "all", required: true },
      },
      outPorts: {
        error: { datatype: "object" },
      },
    });
  }

  process(input, output) {
    if (!input.hasData("payload")) {
      return;
    }
    output.done();
  }
}

class Addressable extends noflo.Component {
  constructor() {
    super({
      description: "Unwrappable: addressable port",
      inPorts: {
        in: { datatype: "all", addressable: true },
      },
      outPorts: {
        out: { datatype: "all" },
      },
    });
  }

  process(input, output) {
    output.done();
  }
}

describe("asAssembly", () => {
  it("builds an adapter graph for a regular component", () => {
    const inner = new CopyLike();
    const graph = asAssembly(inner, { target: "test/CopyLike" });
    const serialized = graph.serialize();
    const processes = serialized.nodes.map((n) => n.entity_id);
    assert.ok(processes.includes("inner"));
    assert.ok(processes.includes("fanout"));
    assert.ok(processes.includes("collector"));
    assert.ok(
      serialized.nodes.some((n) => n.component === "test/CopyLike"),
      "the inner component reference is in the graph",
    );
  });

  it("exposes control ports on the wrapped signature", () => {
    const inner = new CopyLike();
    const graph = asAssembly(inner, { target: "test/CopyLike" });
    const exports = graph.serialize().exports ?? [];
    const control = exports.find((e) => e.public === "encoding");
    assert.ok(control, "expected the control port exposed");
  });

  it("rejects addressable ports loudly", () => {
    const inner = new Addressable();
    assert.throws(
      () => asAssembly(inner, { target: "test/Addressable" }),
      /addressable ports are not supported/,
    );
  });
});

describe("wrapped component end-to-end", () => {
  it("runs a wrapped component through the loader", async () => {
    const loader = await makeLoader();
    loader.registerComponent("test", "CopyLike", {
      getComponent: () => new CopyLike(),
    });
    const inner = new CopyLike();
    const graph = asAssembly(inner, { target: "test/CopyLike" });
    loader.registerComponent("test", "Wrapped", graph);

    const instance = await loader.load("test/Wrapped");
    assert.ok(instance, "wrapped component loads");
    assert.equal(instance.isSubgraph(), true);
  });

  it("carries the message through the adapter and accumulates errors", async () => {
    const loader = await makeLoader();
    loader.registerComponent("test", "CopyLike", {
      getComponent: () => new CopyLike(),
    });
    const inner = new CopyLike();
    const graph = asAssembly(inner, { target: "test/CopyLike" });
    loader.registerComponent("test", "Wrapped", graph);
    const instance = await loader.load("test/Wrapped");

    const out = new noflo.internalSocket.InternalSocket();
    instance.outPorts.ports.out.attach(out);
    const source = new noflo.internalSocket.InternalSocket();
    instance.inPorts.ports.msg.attach(source);
    // The inner component's control port is exposed on the wrapper
    const encoding = new noflo.internalSocket.InternalSocket();
    instance.inPorts.ports.encoding.attach(encoding);

    const received = new Promise((resolve) => {
      out.addEventListener("ip", (event) => resolve(event.detail));
    });

    instance.start(() => {});
    for (const [pname, proc] of Object.entries(instance.network.processes)) {

      for (const [pname2, port] of Object.entries(proc.component.inPorts.ports)) {
        port.addEventListener("ip", (e) => {
          if (e.detail.type === "data") {
            console.log(`[dbg] ${pname}.${pname2} got data`);
          }
        });
      }
      for (const [pname2, port] of Object.entries(proc.component.outPorts.ports)) {
        port.addEventListener("ip", (e) => {
          if (e.detail.type === "data") {
            console.log(`[dbg] ${pname}.${pname2} sent data`);
          }
        });
      }
    }
    encoding.post(new noflo.IP("data", "utf-8"));
    source.post(new noflo.IP("data", { errors: [], value: "hello" }));
    const ip = await received;
    assert.equal(ip.type, "data");
    assert.equal(ip.data.errors.length, 0);
    assert.equal(ip.data.destination, "hello:utf-8");
  });
});

describe("wrapAssembly", () => {
  it("decorates configured libraries and reports skips", async () => {
    const loader = await makeLoader();
    loader.registerComponent("test", "CopyLike", CopyLike);
    loader.registerComponent("test", "Addressable", Addressable);
    const catalog = await loader.listComponents();

    /** @type {Array<{ name: string, reason: string }>} */
    const skipped = [];
    const decorated = wrapAssembly(
      { list: () => catalog, get: async (name) => catalog[name] },
      {
        libraries: [{ library: "test" }],
        onSkip: (report) => skipped.push(report),
      },
    );

    const decoratedCatalog = decorated.list();
    assert.ok(decoratedCatalog["test/CopyLike"], "wrappable component decorated");
    assert.equal(
      decoratedCatalog["test/CopyLike"].constructor.name,
      "GraphModel",
    );
    assert.ok(decoratedCatalog["test/Addressable"], "unwrappable stays native");
    assert.equal(decoratedCatalog["test/Addressable"], Addressable);
    assert.ok(
      skipped.some((s) => s.name === "test/Addressable"),
      "expected the addressable component in the skip report",
    );
  });

  it("resolves wrapped components through get", async () => {
    const loader = await makeLoader();
    loader.registerComponent("test", "CopyLike", CopyLike);
    const catalog = await loader.listComponents();
    const decorated = wrapAssembly(
      { list: () => catalog, get: async (name) => catalog[name] },
      { libraries: [{ library: "test" }] },
    );
    const definition = await decorated.get("test/CopyLike");
    assert.ok(definition, "wrapped definition resolves");
  });
});
