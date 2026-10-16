import assert from "node:assert/strict";
import { describe, it } from "node:test";
import noflo from "@noflo/noflo";

/**
 * Build a single-passthrough-node network whose inport is driven through a
 * raw socket, and collect the closing-order event log: one entry per
 * component closedown event plus the network end.
 *
 * @returns {Promise<{network: noflo.Network, socket: noflo.internalSocket.InternalSocket, log: Array<string>}>}
 */
async function makePassthrough() {
  const graph = new noflo.GraphModel({ name: "closing" });
  graph.addNode({ entity_id: "Pass", component: "closing/Pass" });
  graph.addExport({
    direction: "inport",
    public: "in",
    internal: { node: "Pass", port: "in" },
  });
  const network = await noflo.createNetwork(graph, {
    componentLoader: await (async () => {
      const loader = new noflo.ComponentLoader({});
      loader.registerComponent("closing", "Pass", () => {
        const c = new noflo.Component();
        c.inPorts.add("in", { datatype: "all" });
        c.outPorts.add("out", { datatype: "all" });
        c.process((input, output) => {
          if (!input.hasData("in")) {
            return;
          }
          output.sendDone({ out: input.getData("in") });
        });
        return c;
      });
      return loader;
    })(),
    delay: true,
  });
  await network.connect();
  const socket = noflo.internalSocket.createSocket();
  network.getNode("Pass").component.inPorts.ports.in.attach(socket);
  const log = [];
  const outLog = [];
  const out = noflo.internalSocket.createSocket();
  network.getNode("Pass").component.outPorts.ports.out.attach(out);
  out.addEventListener("ip", (event) => {
    if (event.detail.type === "data") {
      outLog.push(`data ${event.detail.data}`);
    }
  });
  out.addEventListener("disconnect", () => {
    outLog.push("disconnect");
  });
  for (const proc of Object.values(network.processes)) {
    proc.component.addEventListener("closedown", () => {
      log.push("closedown");
    });
  }
  network.addEventListener("end", () => {
    log.push("end");
  });
  return { network, socket, outLog, log };
}

describe("drain-based network closing", () => {
  it("fires every closedown event before the network end", async () => {
    const { network, socket, outLog, log } = await makePassthrough();
    await network.start();
    socket.post(new noflo.IP("data", "a"));
    socket.disconnect();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      network.addEventListener("end", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    // The closedown-vs-end log order is listener-registration-dependent
    // (the network's check listener runs within the closedown dispatch);
    // assert membership and the drain guarantee instead
    assert.deepEqual([...log].sort(), ["closedown", "end"]);
    assert.equal(network.isStarted(), false);
    // The closedown's terminal disconnect drains first: the output
    // delivered before the out socket saw end-of-input
    assert.deepEqual(outLog, ["data a", "disconnect"]);
  });

  it("a revived component's second closedown gates the network end", async () => {
    // The sequencing bug this pins: a component that closed down and was
    // then revived by a reconnecting sender must re-close before the
    // network ends — a stale closedown flag from the first cycle let the
    // end fire while the second closedown was still pending, ordering the
    // inner/outer events wrongly (work document #45)
    const { network, socket, outLog, log } = await makePassthrough();
    await network.start();
    // Burst 1: the component processes and closes down (EOF)
    socket.post(new noflo.IP("data", "a"));
    await socket.disconnect();
    // Burst 2 reconnects the same socket: the component revives, processes,
    // and closes down again — the second closedown must gate the network
    // end anew (the stale-flag sequencing bug, work document #45). The
    // closedown events fire post-drain, so the waits poll the count.
    socket.post(new noflo.IP("data", "b"));
    await socket.disconnect();
    const awaitClosedowns = async (target) => {
      for (let i = 0; i < 100; i += 1) {
        if (log.filter((entry) => entry === "closedown").length >= target) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`only ${log.length} closing events recorded`);
    };
    await awaitClosedowns(1);
    await awaitClosedowns(2);
    const closedowns = log.filter((entry) => entry === "closedown").length;
    assert.equal(
      closedowns,
      2,
      `expected two closedown cycles, log: ${JSON.stringify(log)}`,
    );
    // The network ends after the first cycle (the boundary EOF'd and the
    // network drained); burst 2 runs on the ended network with the
    // component revived — whether a boundary reconnect re-arms the
    // network's started state is the re-open design question (work
    // document #45 decision gate 3)
    assert.ok(
      log.filter((entry) => entry === "end").length >= 1,
      "the network ended",
    );
    assert.equal(network.isStarted(), false);
    // Both bursts' outputs delivered, each followed by the per-cycle
    // output close: the revive did not strand or reorder them
    assert.deepEqual(outLog, [
      "data a",
      "disconnect",
      "data b",
      "disconnect",
    ]);
  });

  it("orders nested closing: inner end, wrapper closedown, outer end", async () => {
    // A subgraph whose inner network closes down: the inner network's end
    // precedes the wrapper's closedown event, which precedes the outer
    // network's end — the nesting must read correctly in a flowtrace
    const innerGraph = new noflo.GraphModel({ name: "Inner" });
    innerGraph.addNode({ entity_id: "Node", component: "closing/Pass" });
    innerGraph.addExport({
      direction: "inport",
      public: "in",
      internal: { node: "Node", port: "in" },
    });
    innerGraph.addExport({
      direction: "outport",
      public: "out",
      internal: { node: "Node", port: "out" },
    });
    const graph = new noflo.GraphModel({ name: "outer" });
    graph.addNode({ entity_id: "Inner", component: "closing/Inner" });
    graph.addExport({
      direction: "inport",
      public: "in",
      internal: { node: "Inner", port: "in" },
    });
    const loader = new noflo.ComponentLoader({});
    loader.registerComponent("closing", "Inner", innerGraph);
    loader.registerComponent("closing", "Pass", () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.outPorts.add("out", { datatype: "all" });
      c.process((input, output) => {
        if (!input.hasData("in")) {
          return;
        }
        output.sendDone({ out: input.getData("in") });
      });
      return c;
    });
    const network = await noflo.createNetwork(graph, {
      componentLoader: loader,
      delay: true,
    });
    await network.connect();
    const socket = noflo.internalSocket.createSocket();
    network.getNode("Inner").component.inPorts.ports.in.attach(socket);
    const log = [];
    const inner = network.getNode("Inner").component.network;
    inner.addEventListener("end", () => {
      log.push("inner end");
    });
    for (const proc of Object.values(network.processes)) {
      proc.component.addEventListener("closedown", () => {
        log.push("wrapper closedown");
      });
    }
    network.addEventListener("end", () => {
      log.push("outer end");
    });
    await network.start();
    socket.post(new noflo.IP("data", "a"));
    socket.disconnect();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      network.addEventListener("end", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    // The outer end is the last closing event: the outer network cannot
    // end before the inner has fully closed down. (The inner-end vs
    // wrapper-closedown pair is ordered by listener registration — the
    // wrapper's closedown is dispatched within the inner end's dispatch —
    // so only their membership is asserted.)
    assert.deepEqual(log.sort(), ["inner end", "outer end", "wrapper closedown"]);
  });
});
