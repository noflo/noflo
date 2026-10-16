import assert from "node:assert/strict";
import { describe, it } from "node:test";
import noflo, { EVENT_TYPE, Flowtrace } from "@noflo/noflo";
import { wrapAssembly } from "../src/index.js";

// A plain regular component in the style of the migrated libraries: two
// inports (one data, one control), two outports, per-activation processing
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
    this.process((input, output) => {
      if (!input.hasData("source", "encoding")) {
        return;
      }
      output.sendDone({
        destination: `${input.getData("source")}:${input.getData("encoding")}`,
      });
    });
  }
}

/**
 * Build a network whose loader registry is wrapAssembly-decorated, with
 * the wrapped `test/CopyLikeAssembly` as its only node. The adapter
 * components the generated graph references are registered the same way
 * `asAssembly`'s specs do.
 *
 * @param {noflo.Flowtrace} trace
 * @returns {Promise<noflo.Network>}
 */
async function makeWrappedNetwork(trace) {
  const loader = new noflo.ComponentLoader({ registry: {} });
  loader.registerComponent("test", "CopyLike", {
    getComponent: () => new CopyLike(),
  });
  const catalog = await loader.listComponents();
  const decorated = wrapAssembly(
    { list: () => catalog, get: async (name) => catalog[name] },
    { libraries: [{ library: "test" }] },
  );
  const appLoader = new noflo.ComponentLoader({ registry: decorated });
  for (const name of [
    "ExtractField",
    "ToField",
    "CollectFields",
    "Fork",
    "Merge",
  ]) {
    const mod = await import(`@noflo/assembly-utils/components/${name}.js`);
    appLoader.registerComponent("assembly-utils", name, {
      getComponent: (metadata) => mod.getComponent(metadata),
    });
  }

  const graph = new noflo.GraphModel({ name: "main" });
  graph.addNode({ entity_id: "Wrap", component: "test/CopyLikeAssembly" });
  graph.addExport({
    direction: "inport",
    public: "msg",
    internal: { node: "Wrap", port: "msg" },
  });
  graph.addExport({
    direction: "inport",
    public: "encoding",
    internal: { node: "Wrap", port: "encoding" },
  });
  graph.addExport({
    direction: "outport",
    public: "out",
    internal: { node: "Wrap", port: "out" },
  });

  const network = await noflo.createNetwork(graph, {
    flowtrace: trace,
    componentLoader: appLoader,
    delay: true,
  });
  await network.connect();
  return network;
}

describe("flowtrace over wrapAssembly-wrapped components", () => {
  it("relays a wrapped message and ends the network", async () => {
    // Regression (work document #36): the collector's firing pattern used
    // to consume the message in an activation that then waited for the
    // inner leg — inside a network the relay never happened and the
    // network hung. The collector now has-checks the complete
    // precondition set before consuming anything.
    const trace = new Flowtrace();
    const network = await makeWrappedNetwork(trace);
    await network.addInitial({
      from: { data: "utf-8" },
      to: { node: "Wrap", port: "encoding" },
    });
    await network.start();

    const relayed = new Promise((resolve) => {
      const wrapOut = new noflo.internalSocket.InternalSocket();
      network.processes.Wrap.component.outPorts.ports.out.attach(wrapOut);
      wrapOut.addEventListener("ip", (event) => {
        if (event.detail.type === "data") {
          resolve(event.detail.data);
        }
      });
    });
    await network.addInitial({
      from: { data: { errors: [], source: "hello" } },
      to: { node: "Wrap", port: "msg" },
    });

    const message = await Promise.race([
      relayed,
      new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    assert.deepEqual(message, {
      errors: [],
      source: "hello",
      destination: "hello:utf-8",
    });

    const ended = new Promise((resolve) => {
      network.addEventListener("end", () => resolve());
    });
    await Promise.race([
      ended,
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    assert.ok(!network.isRunning(), "the network finished");
  });

  it("records the wrapped subgraph with its adapter pipeline", async () => {
    const trace = new Flowtrace();
    const network = await makeWrappedNetwork(trace);
    await network.addInitial({
      from: { data: "utf-8" },
      to: { node: "Wrap", port: "encoding" },
    });
    await network.start();
    await network.addInitial({
      from: { data: { errors: [], source: "hello" } },
      to: { node: "Wrap", port: "msg" },
    });
    await new Promise((resolve) => {
      network.addEventListener("end", () => resolve());
    });

    const state = trace.toJSON();
    // The wrapped graph registers under its suffixed catalog name next to
    // the main graph, and its definition is the adapter pipeline
    assert.deepEqual(Object.keys(state.snapshot.graphs).sort(), [
      "main",
      "test/CopyLikeAssembly",
    ]);
    assert.equal(state.snapshot.main, "main");
    const wrapped = state.snapshot.graphs["test/CopyLikeAssembly"];
    const nodeIds = wrapped.nodes.map((node) => node.id);
    for (const expected of ["fanout", "extract_source", "inner", "collector"]) {
      assert.ok(nodeIds.includes(expected), `adapter node ${expected} present`);
    }

    const events = state.chunks.map(([, type, payload, meta]) => ({
      type,
      payload,
      subgraph: meta?.subgraph ?? null,
      src: meta?.src ?? null,
      tgt: meta?.tgt ?? null,
    }));

    // Every adapter-node event attributes to the wrapped subgraph path
    const wrappedEvents = events.filter((event) => event.subgraph !== null);
    assert.ok(wrappedEvents.length > 0, "wrapped events recorded");
    for (const event of wrappedEvents) {
      assert.deepEqual(event.subgraph, ["Wrap"]);
    }

    // Intra-adapter DATA hops resolve to adapter node ids
    const hops = wrappedEvents.filter(
      (event) => event.type === EVENT_TYPE.DATA && event.src && event.tgt,
    );
    assert.ok(
      hops.some(
        (event) =>
          event.src.node === "fanout" &&
          event.src.port === "out" &&
          event.tgt.node === "extract_source" &&
          event.tgt.port === "msg",
      ),
    );
    assert.ok(
      hops.some(
        (event) =>
          event.src.node === "inner" &&
          event.src.port === "destination" &&
          event.tgt.node === "collector" &&
          event.tgt.port === "data",
      ),
    );

    // The collector fires only after the inner leg has arrived: its
    // ACTIVATION_BEGIN follows the inner output's DATA event. Pre-fix the
    // collector activated on the message leg, consumed it, and waited
    // forever.
    const innerDataIndex = events.findIndex(
      (event) =>
        event.type === EVENT_TYPE.DATA &&
        event.src?.node === "inner" &&
        event.tgt?.node === "collector",
    );
    const collectorBeginIndex = events.findIndex(
      (event) =>
        event.type === EVENT_TYPE.ACTIVATION_BEGIN &&
        event.payload[0] === "collector",
    );
    assert.ok(innerDataIndex >= 0, "inner output recorded");
    assert.ok(collectorBeginIndex >= 0, "collector activation recorded");
    assert.ok(
      collectorBeginIndex > innerDataIndex,
      "the collector activates after the inner leg arrived",
    );
    const collectorEnd = events.find(
      (event) =>
        event.type === EVENT_TYPE.ACTIVATION_END &&
        event.payload[0] === "collector" &&
        event.payload[1] === 0,
    );
    assert.ok(collectorEnd, "the collector closes after relaying");

    // The recording ends with the network stopping
    const last = events[events.length - 1];
    assert.equal(last.type, EVENT_TYPE.LIFECYCLE);
    assert.equal(last.payload, 2);
  });
});
