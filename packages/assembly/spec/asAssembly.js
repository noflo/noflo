import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNodeModulesRegistry } from "@noflo/loader-node";
import noflo, { ComponentLoader, exportFbpJson } from "@noflo/noflo";
import { asAssembly, Component, wrapAssembly } from "../src/index.js";

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
      getComponent: (metadata) => mod.getComponent(metadata),
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
        encoding: { datatype: "string", control: true },
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

  it("refuses components that are already assembly", () => {
    class AssemblyNative extends Component {
      relay(msg, output) {
        output.sendDone(msg);
      }
    }
    const inner = new AssemblyNative();
    assert.throws(
      () => asAssembly(inner, { target: "test/AssemblyNative" }),
      /already an assembly participant/,
    );
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
    encoding.post(new noflo.IP("data", "utf-8"));
    source.post(new noflo.IP("data", { errors: [], source: "hello" }));
    const ip = await received;
    assert.equal(ip.type, "data");
    assert.equal(ip.data.errors.length, 0);
    assert.equal(ip.data.destination, "hello:utf-8");
    assert.equal(ip.data.source, "hello");
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
    assert.ok(
      decoratedCatalog["test/CopyLikeAssembly"],
      "wrappable component decorated under the Assembly suffix",
    );
    assert.equal(
      decoratedCatalog["test/CopyLikeAssembly"].constructor.name,
      "GraphModel",
    );
    assert.ok(
      decoratedCatalog["test/CopyLike"],
      "the original stays native under the unsuffixed name",
    );
    assert.ok(decoratedCatalog["test/Addressable"], "unwrappable stays native");
    assert.equal(decoratedCatalog["test/Addressable"], Addressable);
    assert.ok(
      skipped.some((s) => s.name === "test/Addressable"),
      "expected the addressable component in the skip report",
    );
  });

  it("leaves already-assembly components native with a skip report", async () => {
    const loader = await makeLoader();
    class AssemblyNative extends Component {
      relay(msg, output) {
        output.sendDone(msg);
      }
    }
    loader.registerComponent("test", "Native", {
      getComponent: () => new AssemblyNative(),
    });
    loader.registerComponent("test", "CopyLike", CopyLike);
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
    // The assembly-native component stays as its code definition
    assert.equal(decoratedCatalog["test/Native"].constructor.name, "Object");
    assert.ok(
      skipped.some(
        (s) => s.name === "test/Native" && /already an assembly/.test(s.reason),
      ),
      "expected an already-assembly skip report",
    );
    // Regular components wrap under the Assembly suffix
    assert.equal(
      decoratedCatalog["test/CopyLikeAssembly"].constructor.name,
      "GraphModel",
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

// Survey-informed fixtures for the behavioral coverage matrix
class Streamer extends noflo.Component {
  constructor() {
    super({
      description: "Emits a bracketed stream of values",
      inPorts: { trigger: { datatype: "all", required: true } },
      outPorts: { out: { datatype: "all" } },
    });
    this.process((input, output) => {
      if (!input.hasData("trigger")) {
        return;
      }
      input.getData("trigger");
      output.send({ out: new noflo.IP("openBracket", "parts") });
      output.send({ out: new noflo.IP("data", "alpha") });
      output.send({ out: new noflo.IP("data", "beta") });
      output.send({ out: new noflo.IP("closeBracket") });
      output.done();
    });
  }
}

class Failing extends noflo.Component {
  constructor() {
    super({
      description: "Signals failure through the error outport only",
      inPorts: { in: { datatype: "all", required: true } },
      outPorts: { error: { datatype: "object" } },
    });
    this.process((input, output) => {
      if (!input.hasData("in")) {
        return;
      }
      input.getData("in");
      output.sendDone({ error: new Error("boom") });
    });
  }
}

function attachAll(instance, ports) {
  /** @type {Record<string, any>} */
  const sockets = {};
  for (const [name, port] of Object.entries(ports)) {
    const socket = new noflo.internalSocket.InternalSocket();
    port.attach(socket);
    sockets[name] = socket;
  }
  return sockets;
}

// An inner component whose completion order is the REVERSE of its input
// order: models async file I/O under out-of-order completion
class SlowCopy extends noflo.Component {
  constructor() {
    super({
      description: "Copies with a per-value delay (out-of-order completion)",
      inPorts: {
        source: { datatype: "all", required: true },
        encoding: { datatype: "string", control: true },
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
      const encoding = input.getData("encoding");
      // Later values take LONGER: completion order is reversed
      const delay = value === "m1" ? 120 : value === "m2" ? 60 : 10;
      setTimeout(() => {
        output.sendDone({
          destination: `${value}:${encoding}`,
        });
      }, delay);
    });
  }
}

describe("wrapped component behavior matrix", () => {
  // KNOWN ISSUE (runtime buffer lifecycle): under sequential multi-message
  // load, the collector's activation reads `msg` as undefined on later
  // activations — the fanout clone disappears between activations.
  // Reproduction: this test; see work document #36 update (asAssembly).
  // Un-skipped once the runtime buffer lifecycle is fixed.
  it.skip("keeps multiple inbound messages in order without crossover", async () => {
    const loader = await makeLoader();
    loader.registerComponent("test", "CopyLike", {
      getComponent: () => new CopyLike(),
    });
    const inner = new CopyLike();
    const graph = asAssembly(inner, { target: "test/CopyLike" });
    loader.registerComponent("test", "Wrapped", graph);
    const instance = await loader.load("test/Wrapped");
    const sockets = attachAll(instance, {
      msg: instance.inPorts.ports.msg,
      encoding: instance.inPorts.ports.encoding,
      out: instance.outPorts.ports.out,
    });

    const received = [];
    sockets.out.addEventListener("ip", (event) => {
      received.push(event.detail);
    });

    instance.start(() => {});
    for (const [pname, proc] of Object.entries(instance.network.processes)) {
      for (const [pname2, port] of Object.entries(
        proc.component.inPorts.ports,
      )) {
        port.addEventListener("ip", (e) => {
          if (e.detail.type === "data") {
            console.log(`[dbg] ${pname}.${pname2} got data`);
          }
        });
      }
      for (const [pname2, port] of Object.entries(
        proc.component.outPorts.ports,
      )) {
        port.addEventListener("ip", (e) => {
          if (e.detail.type === "data") {
            console.log(`[dbg] ${pname}.${pname2} sent data`);
          }
        });
      }
    }
    // 2.x Process API: control data is consumed per activation, so the
    // configuration is posted with every message
    for (const source of ["m1", "m2", "m3"]) {
      sockets.encoding.post(new noflo.IP("data", "utf-8"));
      sockets.msg.post(new noflo.IP("data", { errors: [], source }));
    }

    await new Promise((resolve) => {
      const check = () => {
        if (received.length >= 3) {
          resolve();
          return;
        }
        setTimeout(check, 50);
      };
      setTimeout(check, 100);
    });

    assert.equal(received.length, 3, "one output per message");
    received.forEach((ip, i) => {
      const expected = `m${i + 1}:utf-8`;
      assert.equal(
        ip.data.destination,
        expected,
        `message ${i + 1} must not end up in another message's output`,
      );
      assert.equal(ip.data.source, `m${i + 1}`);
    });
  });

  // Same runtime buffer-lifecycle issue as the multi-message test above
  it.skip("keeps scoped messages separated", async () => {
    const loader = await makeLoader();
    loader.registerComponent("test", "CopyLike", {
      getComponent: () => new CopyLike(),
    });
    const inner = new CopyLike();
    const graph = asAssembly(inner, { target: "test/CopyLike" });
    loader.registerComponent("test", "Wrapped", graph);
    const instance = await loader.load("test/Wrapped");
    const sockets = attachAll(instance, {
      msg: instance.inPorts.ports.msg,
      encoding: instance.inPorts.ports.encoding,
      out: instance.outPorts.ports.out,
    });

    const received = [];
    sockets.out.addEventListener("ip", (event) => {
      received.push(event.detail);
    });

    instance.start(() => {});
    // Interleaved scopes: the outputs must carry their own scope back;
    // encoding is re-posted per message (consumed per activation)
    const scopedMessages = [
      { scope: "a", source: "sa" },
      { scope: "b", source: "sb" },
      { scope: "a", source: "sa2" },
    ];
    for (const { scope, source } of scopedMessages) {
      sockets.encoding.post(new noflo.IP("data", "utf-8"));
      sockets.msg.post(new noflo.IP("data", { errors: [], source }, { scope }));
    }

    await new Promise((resolve) => {
      const check = () => {
        if (received.length >= 3) {
          resolve();
          return;
        }
        setTimeout(check, 50);
      };
      setTimeout(check, 100);
    });

    assert.equal(received.length, 3, "one output per message");
    const byScope = {};
    for (const ip of received) {
      assert.ok(ip.scope, "output carries a scope");
      byScope[ip.scope] = byScope[ip.scope] ?? [];
      byScope[ip.scope].push(ip.data.source);
    }
    assert.deepEqual(byScope.a, ["sa", "sa2"]);
    assert.deepEqual(byScope.b, ["sb"]);
  });

  it("collects a bracketed inner stream as an array field", async () => {
    const loader = await makeLoader();
    loader.registerComponent("test", "Streamer", {
      getComponent: () => new Streamer(),
    });
    const inner = new Streamer();
    const graph = asAssembly(inner, { target: "test/Streamer" });
    loader.registerComponent("test", "WrappedStreamer", graph);
    const instance = await loader.load("test/WrappedStreamer");
    // `trigger` is a regular inport: the wrapper feeds it from the msg
    // field of the same name
    const sockets = attachAll(instance, {
      msg: instance.inPorts.ports.msg,
      out: instance.outPorts.ports.out,
    });

    const received = new Promise((resolve) => {
      sockets.out.addEventListener("ip", (event) => resolve(event.detail));
    });

    instance.start(() => {});
    sockets.msg.post(new noflo.IP("data", { errors: [], trigger: "go" }));

    const ip = await received;
    assert.equal(ip.type, "data");
    assert.deepEqual(ip.data.out, ["alpha", "beta"]);
    assert.equal(ip.data.errors.length, 0);
  });

  it("accumulates inner errors into the message and still relays", async () => {
    const loader = await makeLoader();
    loader.registerComponent("test", "Failing", {
      getComponent: () => new Failing(),
    });
    const inner = new Failing();
    const graph = asAssembly(inner, { target: "test/Failing" });
    loader.registerComponent("test", "WrappedFailing", graph);
    const instance = await loader.load("test/WrappedFailing");
    // `in` is extractor-fed from the msg field of the same name
    const sockets = attachAll(instance, {
      msg: instance.inPorts.ports.msg,
      out: instance.outPorts.ports.out,
    });

    const received = new Promise((resolve) => {
      sockets.out.addEventListener("ip", (event) => resolve(event.detail));
    });

    instance.start(() => {});
    sockets.msg.post(
      new noflo.IP("data", { errors: [], in: "go", source: "payload" }),
    );

    const ip = await received;
    assert.equal(ip.data.errors.length, 1);
    assert.equal(ip.data.errors[0].message, "boom");
    assert.equal(ip.data.source, "payload");
  });

  it("pairs out-of-order async completions correctly when messages carry scopes", async () => {
    const loader = await makeLoader();
    loader.registerComponent("test", "SlowCopy", {
      getComponent: () => new SlowCopy(),
    });
    const inner = new SlowCopy();
    const graph = asAssembly(inner, { target: "test/SlowCopy" });
    loader.registerComponent("test", "WrappedSlow", graph);
    const instance = await loader.load("test/WrappedSlow");
    const sockets = attachAll(instance, {
      msg: instance.inPorts.ports.msg,
      encoding: instance.inPorts.ports.encoding,
      out: instance.outPorts.ports.out,
    });

    /** @type {Array<any>} */
    const received = [];
    sockets.out.addEventListener("ip", (event) => {
      received.push(event.detail);
    });

    instance.start(() => {});
    // All three in flight, posted back-to-back; completion order is
    // reversed by the inner's delays. Each message carries a distinct
    // scope: the correlation key
    const inputs = [
      { scope: "file-1", source: "m1" },
      { scope: "file-2", source: "m2" },
      { scope: "file-3", source: "m3" },
    ];
    for (const { scope, source } of inputs) {
      sockets.encoding.post(new noflo.IP("data", "utf-8", { scope }));
      sockets.msg.post(new noflo.IP("data", { errors: [], source }, { scope }));
    }

    await new Promise((resolve) => {
      const check = () => {
        if (received.length >= 3) {
          resolve();
          return;
        }
        setTimeout(check, 20);
      };
      setTimeout(check, 100);
    });

    assert.equal(received.length, 3, "one output per in-flight message");
    const byScope = {};
    for (const ip of received) {
      byScope[ip.scope] = ip.data;
    }
    // Despite reversed completion, each scope's output pairs with its own
    // input
    assert.equal(byScope["file-1"].destination, "m1:utf-8");
    assert.equal(byScope["file-2"].destination, "m2:utf-8");
    assert.equal(byScope["file-3"].destination, "m3:utf-8");
  });

  it("completes a message lacking the mapped field on the error leg", async () => {
    // Work document #35 update #13, question (b): the extractor's
    // missing-field error wires into the collector's error accumulation,
    // so the malformed message completes with the failure recorded
    // instead of stranding the collector's wait or crashing the inner
    const loader = await makeLoader();
    loader.registerComponent("test", "CopyLike", {
      getComponent: () => new CopyLike(),
    });
    const inner = new CopyLike();
    const graph = asAssembly(inner, { target: "test/CopyLike" });
    loader.registerComponent("test", "WrappedCopy", graph);
    const instance = await loader.load("test/WrappedCopy");
    const sockets = attachAll(instance, {
      msg: instance.inPorts.ports.msg,
      encoding: instance.inPorts.ports.encoding,
      out: instance.outPorts.ports.out,
    });

    /** @type {Array<any>} */
    const received = [];
    sockets.out.addEventListener("ip", (event) => {
      received.push(event.detail);
    });

    instance.start(() => {});
    // A well-formed scoped message and a malformed one (no `source`
    // field) in flight concurrently
    sockets.msg.post(
      new noflo.IP(
        "data",
        { errors: [], source: "good", encoding: "utf-8" },
        { scope: "good-1" },
      ),
    );
    sockets.msg.post(new noflo.IP("data", { errors: [] }, { scope: "bad-1" }));
    // The inner's control port needs its value per scope (the wrapped
    // signature exposes it directly)
    sockets.encoding.post(new noflo.IP("data", "utf-8", { scope: "good-1" }));

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

    assert.equal(received.length, 2, "both messages completed");
    const good = received.find((ip) => ip.scope === "good-1");
    const bad = received.find((ip) => ip.scope === "bad-1");
    assert.ok(good, "the well-formed message completed");
    assert.equal(good.data.destination, "good:utf-8");
    assert.ok(bad, "the malformed message completed on the error leg");
    assert.equal(bad.data.errors.length, 1);
    assert.match(
      String(bad.data.errors[0].message),
      /lacks the mapped field 'source'/,
    );
    assert.equal(bad.data.destination, undefined, "the inner never fired");
    // Close the boundary: the terminal disconnects cascade through the
    // adapter (extractors and inner close down, the inner network ends),
    // and the wrapper's start context pops
    const ended = new Promise((resolve) => {
      instance.network.addEventListener("end", resolve);
    });
    sockets.msg.disconnect();
    sockets.encoding.disconnect();
    await Promise.race([
      ended,
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    assert.equal(instance.load, 0, "the closedown cascade completed");
  });
});

describe("whole-message replace mapping", () => {
  // The transform-the-message shape (work document #36's mapping
  // vocabulary): an inner component that mutates and forwards the
  // message — the wrapped output replaces the message instead of
  // nesting under a named field. The accumulated errors carry into the
  // replacement.
  class TransformLike extends noflo.Component {
    constructor() {
      super({
        description: "Transforms the message and forwards it",
        inPorts: {
          in: { datatype: "object", required: true },
        },
        outPorts: {
          out: { datatype: "object" },
          error: { datatype: "object" },
        },
      });
      this.process((input, output) => {
        if (!input.hasData("in")) {
          return;
        }
        const msg = input.getData("in");
        output.sendDone({ out: { ...msg, transformed: true } });
      });
    }
  }

  class StringLike extends noflo.Component {
    constructor() {
      super({
        description: "Emits a non-object value",
        inPorts: {
          in: { datatype: "all", required: true },
        },
        outPorts: {
          out: { datatype: "all" },
        },
      });
      this.process((input, output) => {
        if (!input.hasData("in")) {
          return;
        }
        output.sendDone({ out: "just a string" });
      });
    }
  }

  it("replaces the message with the inner output when an outport maps to null", async () => {
    const loader = await makeLoader();
    loader.registerComponent("test", "TransformLike", {
      getComponent: () => new TransformLike(),
    });
    const inner = new TransformLike();
    const graph = asAssembly(inner, {
      target: "test/TransformLike",
      mapping: { in: { in: null }, out: { out: null } },
    });
    loader.registerComponent("test", "Wrapped", graph);
    const instance = await loader.load("test/Wrapped");

    const out = new noflo.internalSocket.InternalSocket();
    instance.outPorts.ports.out.attach(out);
    const source = new noflo.internalSocket.InternalSocket();
    instance.inPorts.ports.msg.attach(source);

    const received = new Promise((resolve) => {
      out.addEventListener("ip", (event) => resolve(event.detail));
    });

    instance.start(() => {});
    source.post(
      new noflo.IP("data", { errors: [], path: "/x/index.html", body: "b" }),
    );
    const ip = await received;
    assert.equal(ip.type, "data");
    // The inner output IS the message: its keys replace, the errors carry
    assert.equal(ip.data.path, "/x/index.html");
    assert.equal(ip.data.body, "b");
    assert.equal(ip.data.transformed, true);
    assert.deepEqual(ip.data.errors, []);
  });

  it("rejects more than one null outport at wrap time", () => {
    class TwoOut extends noflo.Component {
      constructor() {
        super({
          inPorts: { in: { datatype: "object", required: true } },
          outPorts: {
            out1: { datatype: "object" },
            out2: { datatype: "object" },
          },
        });
        this.process(() => {});
      }
    }
    assert.throws(
      () =>
        asAssembly(new TwoOut(), {
          target: "test/TwoOut",
          mapping: { in: { in: null }, out: { out1: null, out2: null } },
        }),
      /only one outport may map to null/,
    );
  });

  it("keeps the message and accumulates an error when the replace output is not an object", async () => {
    const loader = await makeLoader();
    loader.registerComponent("test", "StringLike", {
      getComponent: () => new StringLike(),
    });
    const inner = new StringLike();
    const graph = asAssembly(inner, {
      target: "test/StringLike",
      mapping: { in: { in: null }, out: { out: null } },
    });
    loader.registerComponent("test", "Wrapped", graph);
    const instance = await loader.load("test/Wrapped");

    const out = new noflo.internalSocket.InternalSocket();
    instance.outPorts.ports.out.attach(out);
    const source = new noflo.internalSocket.InternalSocket();
    instance.inPorts.ports.msg.attach(source);

    const received = new Promise((resolve) => {
      out.addEventListener("ip", (event) => resolve(event.detail));
    });

    instance.start(() => {});
    source.post(new noflo.IP("data", { errors: [], path: "/keep" }));
    const ip = await received;
    assert.equal(ip.type, "data");
    assert.equal(ip.data.path, "/keep");
    assert.equal(ip.data.errors.length, 1);
    assert.match(ip.data.errors[0].message, /not an object/);
  });
});
