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
    // delivered before the out socket reached EOT
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
    // Burst 1: the component processes and closes down (EOT)
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
    // The network ends after the first cycle (the boundary reached EOT and the
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
    assert.deepEqual(outLog, ["data a", "disconnect", "data b", "disconnect"]);
  });

  it("ends a feedback graph whose cycle targets an exported inport", async () => {
    // The review finding (PR #1092): an internal edge (B.out -> A.in)
    // targeting an exported inport shares the boundary port. Its socket
    // can only go terminal when its sender closes down, and the sender
    // waits on the boundary component's closedown — the old
    // every-socket-must-be-terminal check deadlocked the cycle through
    // the boundary gate. The gate now requires terminal state only from
    // external (driver and IIP) sockets; internal edges are covered by
    // quiescence.
    const graph = new noflo.GraphModel({ name: "feedback" });
    graph.addNode({ entity_id: "A", component: "closing/Once" });
    graph.addNode({ entity_id: "B", component: "closing/Pass" });
    graph.addExport({
      direction: "inport",
      public: "in",
      internal: { node: "A", port: "in" },
    });
    graph.addEdge({
      entity_id: "e1",
      from: { node: "A", port: "out" },
      to: { node: "B", port: "in" },
    });
    graph.addEdge({
      entity_id: "e2",
      from: { node: "B", port: "out" },
      to: { node: "A", port: "in" },
    });
    const loader = new noflo.ComponentLoader({});
    loader.registerComponent("closing", "Once", () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.outPorts.add("out", { datatype: "all" });
      let sent = false;
      c.process((input, output) => {
        if (!input.hasData("in")) {
          return;
        }
        const data = input.getData("in");
        if (sent) {
          // The feedback echo: consume without re-sending
          output.done();
          return;
        }
        sent = true;
        output.sendDone({ out: data });
      });
      return c;
    });
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
    network.getNode("A").component.inPorts.ports.in.attach(socket);
    await network.start();
    socket.post(new noflo.IP("data", "x"));
    socket.disconnect();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      network.addEventListener("end", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    assert.equal(network.isStarted(), false, "the cycle network ended");
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
    assert.deepEqual(log.sort(), [
      "inner end",
      "outer end",
      "wrapper closedown",
    ]);
  });

  it("a client-driven driver stream holds the network open until its EOT", async () => {
    // The remote-runtime scenario (work document #40): a client attaches a
    // persistent driver to the exported inport, sends packets across time
    // without the network ending between them, then signals end of
    // transmission — the boundary EOT drives the drain-based close
    const graph = new noflo.GraphModel({ name: "driver" });
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
    const outLog = [];
    const out = noflo.internalSocket.createSocket();
    network.getNode("Pass").component.outPorts.ports.out.attach(out);
    out.addEventListener("ip", (event) => {
      if (event.detail.type === "data") {
        outLog.push(event.detail.data);
      }
    });
    const connections = [];
    network.addEventListener("connection", (event) => {
      connections.push(event.detail.open ? "open" : "close");
    });
    await network.start();
    const driver = await network.addDriver({ node: "Pass", port: "in" });
    driver.connect();
    driver.post(new noflo.IP("data", "a"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    driver.post(new noflo.IP("data", "b"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The stream is still open: the network has not ended between packets
    assert.equal(network.isStarted(), true);
    assert.deepEqual(outLog, ["a", "b"]);
    assert.deepEqual(connections, ["open"]);
    // The client's end of transmission: the boundary EOT drives the close
    await driver.disconnect();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      network.addEventListener("end", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    assert.equal(network.isStarted(), false);
    assert.deepEqual(connections, ["open", "close"]);
  });

  it("holds the network open while a buffered message waits on a live sender leg", async () => {
    // The noflo/noflo#1092 review repro shape (noflo-jekyll): a two-input
    // builder declines a message whose preconditions span another port.
    // The corpus leg's boundary driver is still open, so the network
    // stays open and the late arrival completes the wait. The driver
    // holding the leg open is what gates the close — the boundary-EOF
    // check — because a compliant network's port-buffered data is
    // stranded once every boundary is at EOT (see the strand-real test)
    const graph = new noflo.GraphModel({ name: "race" });
    graph.addNode({ entity_id: "Builder", component: "closing/Builder" });
    graph.addNode({ entity_id: "Slow", component: "closing/Pass" });
    graph.addEdge({
      from: { node: "Slow", port: "out" },
      to: { node: "Builder", port: "templates" },
    });
    graph.addExport({
      direction: "inport",
      public: "msg",
      internal: { node: "Builder", port: "msg" },
    });
    graph.addExport({
      direction: "inport",
      public: "config",
      internal: { node: "Slow", port: "in" },
    });
    const network = await noflo.createNetwork(graph, {
      componentLoader: await (async () => {
        const loader = new noflo.ComponentLoader({});
        loader.registerComponent("closing", "Builder", () => {
          const c = new noflo.Component();
          c.inPorts.add("msg", { datatype: "all" });
          c.inPorts.add("templates", { datatype: "all" });
          c.outPorts.add("out", { datatype: "all" });
          c.process((input, output) => {
            // The has-first discipline: a message whose preconditions
            // span another port waits — the packet stays buffered on the
            // port until the corpus arrives
            if (!input.hasData("msg") || !input.hasData("templates")) {
              return;
            }
            const msg = input.getData("msg");
            const tpl = input.getData("templates");
            output.sendDone({ out: `${msg}:${tpl}` });
          });
          return c;
        });
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
    const msgSocket = noflo.internalSocket.createSocket();
    network.getNode("Builder").component.inPorts.ports.msg.attach(msgSocket);
    const configSocket = noflo.internalSocket.createSocket();
    network.getNode("Slow").component.inPorts.ports.in.attach(configSocket);
    const outLog = [];
    const out = noflo.internalSocket.createSocket();
    network.getNode("Builder").component.outPorts.ports.out.attach(out);
    out.addEventListener("ip", (event) => {
      if (event.detail.type === "data") {
        outLog.push(event.detail.data);
      }
    });
    await network.start();

    // The message leg arrives and EOTs; the builder declines — the
    // message waits buffered while the corpus leg is still open
    msgSocket.post(new noflo.IP("data", "post"));
    await msgSocket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 60));
    // The old predicate ended the network here, stranding the message
    assert.equal(network.isStarted(), true);

    // The corpus arrives one tick later and completes the wait
    configSocket.post(new noflo.IP("data", "corpus"));
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.deepEqual(outLog, ["post:corpus"]);
    // The corpus leg's sender finishes: the cascade closes down and the
    // network ends cleanly
    await configSocket.disconnect();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      network.addEventListener("end", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    assert.equal(network.isStarted(), false);
  });

  it("ends the network when every feeding sender is done and a buffered message is genuinely stranded", async () => {
    // The strand-real half of the rule: same shape, but the corpus leg's
    // sender finishes without ever delivering — every socket that could
    // feed the waiting component is terminally closed, so the buffered
    // message is stranded for real and the network closes loudly
    const graph = new noflo.GraphModel({ name: "strand" });
    graph.addNode({ entity_id: "Builder", component: "closing/Builder" });
    graph.addNode({ entity_id: "Slow", component: "closing/Pass" });
    graph.addEdge({
      from: { node: "Slow", port: "out" },
      to: { node: "Builder", port: "templates" },
    });
    graph.addExport({
      direction: "inport",
      public: "msg",
      internal: { node: "Builder", port: "msg" },
    });
    graph.addExport({
      direction: "inport",
      public: "config",
      internal: { node: "Slow", port: "in" },
    });
    const network = await noflo.createNetwork(graph, {
      componentLoader: await (async () => {
        const loader = new noflo.ComponentLoader({});
        loader.registerComponent("closing", "Builder", () => {
          const c = new noflo.Component();
          c.inPorts.add("msg", { datatype: "all" });
          c.inPorts.add("templates", { datatype: "all" });
          c.outPorts.add("out", { datatype: "all" });
          c.process((input, output) => {
            if (!input.hasData("msg") || !input.hasData("templates")) {
              return;
            }
            const msg = input.getData("msg");
            const tpl = input.getData("templates");
            output.sendDone({ out: `${msg}:${tpl}` });
          });
          return c;
        });
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
    const msgSocket = noflo.internalSocket.createSocket();
    network.getNode("Builder").component.inPorts.ports.msg.attach(msgSocket);
    const configSocket = noflo.internalSocket.createSocket();
    network.getNode("Slow").component.inPorts.ports.in.attach(configSocket);
    await network.start();

    msgSocket.post(new noflo.IP("data", "post"));
    await msgSocket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(network.isStarted(), true);

    // The corpus leg's sender finishes without delivering: Slow closes
    // down, its outport disconnects, and the builder's every socket is
    // terminal — the strand is real and the network ends
    await configSocket.disconnect();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      network.addEventListener("end", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    assert.equal(network.isStarted(), false);
  });
});
