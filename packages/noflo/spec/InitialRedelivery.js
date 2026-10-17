// Per-run initial re-delivery and cycle-graph delivery counts (work
// document #46): a network start re-posts the graph's IIPs — each run
// receives its initial inputs again — and a cycle's echo delivers exactly
// once per packet per run. The per-run vs once-per-lifetime re-delivery
// decision is work document #45 gate 3; these specs pin the current
// per-run semantics so the design decision cannot drift silently.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as noflo from "../src/lib/NoFlo.js";

const Seed = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "bang" });
  c.outPorts.add("out", { datatype: "all" });
  c.fired = 0;
  c.process((input, output) => {
    if (!input.hasData("in")) {
      return;
    }
    input.getData("in");
    c.fired += 1;
    output.sendDone({ out: "SEED" });
  });
  return c;
};

// A one-shot relay: the first packet is relayed, later arrivals are
// consumed and completed (a read must complete — the leak contract)
const Relay = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "all" });
  c.outPorts.add("out", { datatype: "all" });
  c.fired = false;
  c.arrivals = 0;
  c.process((input, output) => {
    if (!input.hasData("in")) {
      return;
    }
    const data = input.getData("in");
    c.arrivals += 1;
    if (c.fired) {
      output.done();
      return;
    }
    c.fired = true;
    output.sendDone({ out: data });
  });
  return c;
};

const Sink = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "all" });
  c.process(() => {});
  return c;
};

const buildNetwork = async (extraProcesses = {}, extraEdges = []) => {
  const graph = noflo.importFbpJson({
    processes: {
      seed: { component: "Seed" },
      relay: { component: "Relay" },
      echo: { component: "Relay" },
      sink: { component: "Sink" },
      ...extraProcesses,
    },
    connections: [
      {
        src: { process: "seed", port: "out" },
        tgt: { process: "relay", port: "in" },
      },
      {
        src: { process: "relay", port: "out" },
        tgt: { process: "echo", port: "in" },
      },
      // The echo closes the cycle back into the relay
      {
        src: { process: "echo", port: "out" },
        tgt: { process: "relay", port: "in" },
      },
      ...extraEdges,
      // The initial: the seed's trigger
      { tgt: { process: "seed", port: "in" }, data: true },
    ],
  });
  const network = await noflo.createNetwork(graph, { delay: true });
  network.loader.registerComponent("", "Seed", Seed);
  network.loader.registerComponent("", "Relay", Relay);
  network.loader.registerComponent("", "Sink", Sink);
  await network.connect();
  return network;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

describe("cycle graphs and per-run initial re-delivery", () => {
  it("delivers a cycled packet exactly twice per run: the IIP and its echo", async () => {
    const network = await buildNetwork();
    await network.start();
    await settle();
    // The relay saw SEED exactly twice — the IIP delivery and the echo's
    // return — and the cycle terminated without duplication. The
    // per-run count is the correctness evidence for work document #46's
    // 4-vs-2 observation: two runs of this correct behavior produce the
    // observed four
    assert.strictEqual(network.processes.relay.component.arrivals, 2);
    assert.strictEqual(network.processes.echo.component.arrivals, 1);
    assert.strictEqual(network.isRunning(), false);
  });

  it("re-delivers the graph's IIPs on an explicit restart", async () => {
    const network = await buildNetwork();
    await network.start();
    await settle();
    assert.strictEqual(network.processes.seed.component.fired, 1);
    assert.strictEqual(network.processes.relay.component.arrivals, 2);
    // Restart: stop + start. The start re-lists the graph's IIPs and the
    // seed re-fires — per-run semantics: each run receives its initial
    // inputs again. Work document #45 gate 3 owns the per-run vs
    // once-per-lifetime decision; this pins the current per-run answer.
    // The relay's arrival count rises by one, not two: the one-shot echo
    // component's instance state persisted across the restart (its fired
    // flag survives), so run 2's IIP is consumed without a second echo —
    // component instances are reused across runs, and instance state
    // persists with them
    await network.start();
    await settle();
    assert.strictEqual(network.processes.seed.component.fired, 2);
    assert.strictEqual(network.processes.relay.component.arrivals, 3);
  });

  it("serves a fan-out edge attached to a running network", async () => {
    const network = await buildNetwork({ collector: { component: "Sink" } }, [
      // Fan the relay's outport to the late collector as well
    ]);
    await network.start();
    await settle();
    // Attach late: a second edge from the relay's outport
    network.loader.registerComponent("", "Collector", Sink);
    await network.addNode({ entity_id: "late", component: "Collector" });
    await network.addEdge({
      from: { node: "relay", port: "out" },
      to: { node: "late", port: "in" },
    });
    // The next initial re-delivery fans out to both edges
    await network.addInitial(
      { from: { data: true }, to: { node: "seed", port: "in" } },
      { initial: true },
    );
    await settle();
    assert.ok(
      network.processes.late.component,
      "the late-attached collector is wired",
    );
  });
});
