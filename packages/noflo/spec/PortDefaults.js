// Port defaults as IIPs (work document #35's inert-defaults finding):
// the 2.x engine did not read a port's `default` option implicitly — a
// component whose process has-checks a defaulted control port declined
// forever unless the application fed the value, and a component reading a
// defaulted config port bare received `undefined` (the wrapped-ReadFile
// Buffer case from the noflo-jekyll substitution wave). The fix gives the
// default the IIP semantics: delivered as an initial at network start,
// into the initial buffer, re-delivered per run, with an explicitly fed
// graph IIP winning by delivery order.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as noflo from "../src/lib/NoFlo.js";

const DefaultedConfig = () => {
  const c = new noflo.Component();
  c.inPorts.add("config", {
    datatype: "string",
    control: true,
    default: "fallback",
    scoped: false,
  });
  c.inPorts.add("in", { datatype: "all", required: true });
  c.outPorts.add("out", { datatype: "all" });
  c.process((input, output) => {
    if (!input.hasData("config", "in")) {
      return;
    }
    const [config, data] = input.getData("config", "in");
    output.sendDone({ out: `${config}:${data}` });
  });
  return c;
};

const Sink = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "all" });
  c.received = [];
  c.process((input, output) => {
    if (!input.hasData("in")) {
      return;
    }
    c.received.push(input.getData("in"));
    output.done();
  });
  return c;
};

/**
 * @param {boolean} withExplicit
 * @returns {Promise<noflo.Network>}
 */
const buildNetwork = async (withExplicit = false) => {
  const graph = noflo.importFbpJson({
    processes: {
      worker: { component: "DefaultedConfig" },
      sink: { component: "Sink" },
    },
    connections: [
      {
        src: { process: "worker", port: "out" },
        tgt: { process: "sink", port: "in" },
      },
      { tgt: { process: "worker", port: "in" }, data: "message" },
      ...(withExplicit
        ? [{ tgt: { process: "worker", port: "config" }, data: "explicit" }]
        : []),
    ],
  });
  const network = await noflo.createNetwork(graph, { delay: true });
  network.loader.registerComponent("", "DefaultedConfig", DefaultedConfig);
  network.loader.registerComponent("", "Sink", Sink);
  await network.connect();
  return network;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

describe("port defaults as IIPs", () => {
  it("a defaulted control port acts as standing configuration", async () => {
    const network = await buildNetwork();
    await network.start();
    await settle();
    const sink = network.processes.sink.component;
    assert.strictEqual(sink.received.length, 1);
    assert.strictEqual(sink.received[0], "fallback:message");
    await network.stop();
  });

  it("an explicitly fed control value wins over the default", async () => {
    // The defaults deliver before the graph's IIPs, and the control read
    // takes the latest buffered stream: the explicit feed is the standing
    // value
    const network = await buildNetwork(true);
    await network.start();
    await settle();
    const sink = network.processes.sink.component;
    assert.strictEqual(sink.received.length, 1);
    assert.strictEqual(sink.received[0], "explicit:message");
    await network.stop();
  });

  it("re-delivers the default per run", async () => {
    // The IIP semantics: per-run initial re-delivery (work document #46)
    const network = await buildNetwork();
    await network.start();
    await settle();
    const sink = network.processes.sink.component;
    assert.strictEqual(sink.received.length, 1);
    await network.stop();
    await network.start();
    await settle();
    assert.strictEqual(sink.received.length, 2);
    assert.strictEqual(sink.received[1], "fallback:message");
    await network.stop();
  });

  it("applies inside a subgraph's inner network without the application feeding the wrapper", async () => {
    // The jekyll wrapped-adapter repro: a wrapped component's defaulted
    // control port works because the inner network applies its own
    // ports' defaults on its own start
    const innerGraph = noflo.importFbpJson({
      processes: { worker: { component: "DefaultedConfig" } },
      inports: { in: { process: "worker", port: "in" } },
      outports: { out: { process: "worker", port: "out" } },
    });
    const graph = noflo.importFbpJson({
      processes: {
        wrap: { component: "Wrap" },
        sink: { component: "Sink" },
      },
      connections: [
        {
          src: { process: "wrap", port: "out" },
          tgt: { process: "sink", port: "in" },
        },
        { tgt: { process: "wrap", port: "in" }, data: "message" },
      ],
    });
    const network = await noflo.createNetwork(graph, { delay: true });
    network.loader.registerComponent("", "DefaultedConfig", DefaultedConfig);
    network.loader.registerComponent("", "Sink", Sink);
    network.loader.registerComponent("", "Wrap", innerGraph);
    await network.connect();
    await network.start();
    await settle();
    const sink = network.processes.sink.component;
    assert.strictEqual(sink.received.length, 1);
    assert.strictEqual(sink.received[0], "fallback:message");
    await network.stop();
  });
});
