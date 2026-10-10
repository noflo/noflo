import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import flowtrace from "flowtrace";
import { Subgraph } from "../src/components/Subgraph.js";
import * as noflo from "../src/lib/NoFlo.js";
import { listen, listenOnce } from "./utils/events.js";
import { nativeGraph } from "./utils/nativeGraph.js";

describe("NoFlo Subgraph component", () => {
  let c = null;
  beforeEach(() => {
    c = new Subgraph();
  });

  const Split = () => {
    const inst = new noflo.Component();
    inst.inPorts.add("in", { datatype: "all" });
    inst.outPorts.add("out", { datatype: "all" });
    inst.process((input, output) => {
      const data = input.getData("in");
      output.sendDone({ out: data });
    });
    return inst;
  };

  const SubgraphMerge = () => {
    const inst = new noflo.Component();
    inst.inPorts.add("in", { datatype: "all" });
    inst.outPorts.add("out", { datatype: "all" });
    inst.forwardBrackets = {};
    inst.process((input, output) => {
      const packet = input.get("in");
      if (packet.type !== "data") {
        output.done();
        return;
      }
      output.sendDone({ out: packet.data });
    });
    return inst;
  };

  describe("initially", () => {
    it("should be ready", () => {
      assert.strictEqual(c.ready, true);
    });
    it("should not contain a network", () => {
      assert.strictEqual(c.network, null);
    });
    it("should have no inports", () => {
      assert.deepEqual(Object.keys(c.inPorts.ports), []);
      assert.deepEqual(Object.keys(c.outPorts.ports), []);
    });
  });
  describe("with JSON graph definition", () => {
    it("should emit a ready event after network has been loaded", (_t, done) => {
      listenOnce(c, "ready", () => {
        assert.notEqual(c.network, null);
        assert.strictEqual(c.ready, true);
        done();
      });
      listenOnce(c, "network", (network) => {
        network.loader.components.Split = Split;
        network.loader.registerComponent("", "Merge", SubgraphMerge);
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.start().catch(done);
      });
      c.setGraph({
        processes: {
          Split: {
            component: "Split",
          },
          Merge: {
            component: "Merge",
          },
        },
      });
    });
    it("should expose available ports", (_t, done) => {
      listenOnce(c, "ready", () => {
        assert.deepEqual(Object.keys(c.inPorts.ports), []);
        assert.deepEqual(Object.keys(c.outPorts.ports), []);
        done();
      });
      listenOnce(c, "network", () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start().catch(done);
      });
      c.setGraph({
        processes: {
          Split: {
            component: "Split",
          },
          Merge: {
            component: "Merge",
          },
        },
        connections: [
          {
            src: {
              process: "Merge",
              port: "out",
            },
            tgt: {
              process: "Split",
              port: "in",
            },
          },
        ],
      });
    });
    it("should update description from the graph", (_t, done) => {
      listenOnce(c, "ready", () => {
        assert.notEqual(c.network, null);
        assert.strictEqual(c.ready, true);
        assert.strictEqual(c.description, "Hello, World!");
        done();
      });
      listenOnce(c, "network", (network) => {
        network.loader.components.Split = Split;
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        assert.strictEqual(c.description, "Hello, World!");
        c.start().catch(done);
      });
      c.setGraph({
        properties: {
          description: "Hello, World!",
        },
        processes: {
          Split: {
            component: "Split",
          },
        },
      });
    });
    it("should expose only exported ports when they exist", (_t, done) => {
      listenOnce(c, "ready", () => {
        assert.deepEqual(Object.keys(c.inPorts.ports), []);
        assert.deepEqual(Object.keys(c.outPorts.ports), ["out"]);
        done();
      });
      listenOnce(c, "network", () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start().catch(done);
      });
      c.setGraph({
        outports: {
          out: {
            process: "Split",
            port: "out",
          },
        },
        processes: {
          Split: {
            component: "Split",
          },
          Merge: {
            component: "Merge",
          },
        },
        connections: [
          {
            src: {
              process: "Merge",
              port: "out",
            },
            tgt: {
              process: "Split",
              port: "in",
            },
          },
        ],
      });
    });
    it("should be able to run the graph", (_t, done) => {
      listenOnce(c, "ready", () => {
        const ins = noflo.internalSocket.createSocket();
        const out = noflo.internalSocket.createSocket();
        c.inPorts.in.attach(ins);
        c.outPorts.out.attach(out);
        listen(out, "data", (data) => {
          assert.strictEqual(data, "Foo");
          done();
        });
        ins.send("Foo");
      });
      listenOnce(c, "network", () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start().catch(done);
      });
      c.setGraph({
        inports: {
          in: {
            process: "Merge",
            port: "in",
          },
        },
        outports: {
          out: {
            process: "Split",
            port: "out",
          },
        },
        processes: {
          Split: {
            component: "Split",
          },
          Merge: {
            component: "Merge",
          },
        },
        connections: [
          {
            src: {
              process: "Merge",
              port: "out",
            },
            tgt: {
              process: "Split",
              port: "in",
            },
          },
        ],
      });
    });
  });
  describe("with a Graph instance", () => {
    let gr = null;
    before(() => {
      gr = nativeGraph("Hello, world");
      gr.addNode("Split", "Split");
      gr.addNode("Merge", "Merge");
      gr.addEdge("Merge", "out", "Split", "in");
      gr.addInport("in", "Merge", "in");
      gr.addOutport("out", "Split", "out");
    });
    it("should emit a ready event after network has been loaded", (_t, done) => {
      listenOnce(c, "ready", () => {
        assert.notEqual(c.network, null);
        assert.strictEqual(c.ready, true);
        done();
      });
      listenOnce(c, "network", () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start().catch(done);
      });
      c.setGraph(gr);
      assert.strictEqual(c.ready, false);
    });
    it("should expose available ports", (_t, done) => {
      listenOnce(c, "ready", () => {
        assert.deepEqual(Object.keys(c.inPorts.ports), ["in"]);
        assert.deepEqual(Object.keys(c.outPorts.ports), ["out"]);
        done();
      });
      listenOnce(c, "network", () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start().catch(done);
      });
      c.setGraph(gr);
    });
    it("should be able to run the graph", (_t, done) => {
      let doned = false;
      listenOnce(c, "ready", () => {
        const ins = noflo.internalSocket.createSocket();
        const out = noflo.internalSocket.createSocket();
        c.inPorts.in.attach(ins);
        c.outPorts.out.attach(out);
        listen(out, "data", (data) => {
          assert.strictEqual(data, "Baz");
          if (doned) {
            process.exit(1);
          }
          done();
          doned = true;
        });
        ins.send("Baz");
      });
      listenOnce(c, "network", () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start().catch(done);
      });
      c.setGraph(gr);
    });
  });
  describe("with an FBP JSON fixture with INPORTs and OUTPORTs", () => {
    const fbpJson = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("./fixtures/subgraph.json", import.meta.url)),
        "utf-8",
      ),
    );
    it("should emit a ready event after network has been loaded", (_t, done) => {
      listenOnce(c, "ready", () => {
        assert.notEqual(c.network, null);
        assert.strictEqual(c.ready, true);
        done();
      });
      listenOnce(c, "network", () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start().catch(done);
      });
      c.setGraph(fbpJson);
      assert.strictEqual(c.ready, false);
    });
    it("should expose available ports", (_t, done) => {
      listenOnce(c, "ready", () => {
        assert.deepEqual(Object.keys(c.inPorts.ports), ["in"]);
        assert.deepEqual(Object.keys(c.outPorts.ports), ["out"]);
        done();
      });
      listenOnce(c, "network", () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start().catch(done);
      });
      c.setGraph(fbpJson);
    });
    it("should be able to run the graph", (_t, done) => {
      listenOnce(c, "ready", () => {
        const ins = noflo.internalSocket.createSocket();
        const out = noflo.internalSocket.createSocket();
        c.inPorts.in.attach(ins);
        c.outPorts.out.attach(out);
        let received = false;
        listen(out, "data", (data) => {
          assert.strictEqual(data, "Foo");
          received = true;
        });
        listen(out, "disconnect", () => {
          assert.strictEqual(received, true, "should have transmitted data");
          done();
        });
        ins.connect();
        ins.send("Foo");
        ins.disconnect();
      });
      listenOnce(c, "network", () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start().catch(done);
      });
      c.setGraph(fbpJson);
    });
  });
  describe("when a subgraph is used as a component", () => {
    const createSplit = () => {
      c = new noflo.Component();
      c.inPorts.add("in", {
        required: true,
        datatype: "string",
        default: "default-value",
      });
      c.outPorts.add("out", { datatype: "string" });
      c.process((input, output) => {
        const data = input.getData("in");
        output.sendDone({ out: data });
      });
      return c;
    };

    const grDefaults = nativeGraph("Child Graph Using Defaults");
    grDefaults.addNode("SplitIn", "Split");
    grDefaults.addNode("SplitOut", "Split");
    grDefaults.addInport("in", "SplitIn", "in");
    grDefaults.addOutport("out", "SplitOut", "out");
    grDefaults.addEdge("SplitIn", "out", "SplitOut", "in");

    const grInitials = nativeGraph("Child Graph Using Initials");
    grInitials.addNode("SplitIn", "Split");
    grInitials.addNode("SplitOut", "Split");
    grInitials.addInport("in", "SplitIn", "in");
    grInitials.addOutport("out", "SplitOut", "out");
    grInitials.addInitial("initial-value", "SplitIn", "in");
    grInitials.addEdge("SplitIn", "out", "SplitOut", "in");

    let cl = null;
    before(() => {
      cl = new noflo.ComponentLoader({});
      return cl.listComponents().then(() => {
        cl.components.Split = createSplit;
        cl.components.Defaults = grDefaults;
        cl.components.Initials = grInitials;
      });
    });

    it("should send defaults", async () => {
      const inst = await cl.load("Defaults");
      const o = noflo.internalSocket.createSocket();
      inst.outPorts.out.attach(o);
      const data = new Promise((resolve) => {
        listenOnce(o, "data", (data) => {
          assert.strictEqual(data, "default-value");
          resolve();
        });
      });
      await inst.start();
      await data;
    });

    it("should send initials", async () => {
      const inst = await cl.load("Initials");
      const o = noflo.internalSocket.createSocket();
      inst.outPorts.out.attach(o);
      const data = new Promise((resolve) => {
        listenOnce(o, "data", (data) => {
          assert.strictEqual(data, "initial-value");
          resolve();
        });
      });
      await inst.start();
      await data;
    });

    it("should not send defaults when an inport is attached externally", async () => {
      const inst = await cl.load("Defaults");
      const i = noflo.internalSocket.createSocket();
      const o = noflo.internalSocket.createSocket();
      inst.inPorts.in.attach(i);
      inst.outPorts.out.attach(o);
      const data = new Promise((resolve) => {
        listenOnce(o, "data", (data) => {
          assert.strictEqual(data, "Foo");
          resolve();
        });
      });
      await inst.start();
      i.send("Foo");
      await data;
    });

    it("should deactivate after processing is complete", async () => {
      const inst = await cl.load("Defaults");
      const i = noflo.internalSocket.createSocket();
      const o = noflo.internalSocket.createSocket();
      inst.inPorts.in.attach(i);
      inst.outPorts.out.attach(o);
      const expected = ["ACTIVATE 1", "data Foo", "DEACTIVATE 0"];
      const received = [];
      const done = new Promise((resolve) => {
        listen(o, "ip", (ip) => {
          received.push(`${ip.type} ${ip.data}`);
        });
        listen(inst, "activate", (load) => {
          received.push(`ACTIVATE ${load}`);
        });
        listen(inst, "deactivate", (load) => {
          received.push(`DEACTIVATE ${load}`);
          if (received.length !== expected.length) {
            return;
          }
          resolve();
        });
      });
      await inst.start();
      i.send("Foo");
      await done;
      assert.deepStrictEqual(received, expected);
    });

    it.skip("should activate automatically when receiving data", async () => {
      const inst = await cl.load("Defaults");
      const i = noflo.internalSocket.createSocket();
      const o = noflo.internalSocket.createSocket();
      inst.inPorts.in.attach(i);
      inst.outPorts.out.attach(o);
      const expected = ["ACTIVATE 1", "data Foo", "DEACTIVATE 0"];
      const received = [];
      const done = new Promise((resolve) => {
        listen(o, "ip", (ip) => received.push(`${ip.type} ${ip.data}`));
        listen(inst, "activate", (load) => received.push(`ACTIVATE ${load}`));
        listen(inst, "deactivate", (load) => {
          received.push(`DEACTIVATE ${load}`);
          if (received.length !== expected.length) {
            return;
          }
          resolve();
        });
      });
      await inst.start();
      i.send("Foo");
      await done;
      assert.deepStrictEqual(received, expected);
    });

    it("should deliver internal IIPs when the parent network starts, before any data", async () => {
      // The guarantee: a subgraph network starts together with its parent
      // network, so its internal IIPs are delivered during the parent's
      // start sequence — before the parent sends its own initials and
      // before any runtime data flows.
      const parentGraph = nativeGraph("Parent With Initials Child");
      parentGraph.addNode("Child", "Initials");
      parentGraph.addInport("in", "Child", "in");
      parentGraph.addOutport("out", "Child", "out");
      const network = await noflo.createNetwork(parentGraph, {
        componentLoader: cl,
      });
      const child = network.processes.Child.component;
      const i = noflo.internalSocket.createSocket();
      const o = noflo.internalSocket.createSocket();
      // Sockets attach before start so the IIP-driven emission is seen
      child.inPorts.in.attach(i);
      child.outPorts.out.attach(o);
      const received = [];
      listen(o, "ip", (ip) => {
        if (ip.type === "data") {
          received.push(ip.data);
        }
      });
      await network.start();
      // The IIP was delivered during start; data sent afterwards pairs
      // with the already-delivered initial
      i.send("Foo");
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.deepStrictEqual(received, ["initial-value", "Foo"]);
      await network.stop();
    });

    it("should apply internal IIPs to data sent after an explicit component start", async () => {
      const inst = await cl.load("Initials");
      const i = noflo.internalSocket.createSocket();
      const o = noflo.internalSocket.createSocket();
      inst.inPorts.in.attach(i);
      inst.outPorts.out.attach(o);
      const received = [];
      listen(o, "ip", (ip) => {
        if (ip.type === "data") {
          received.push(ip.data);
        }
      });
      await inst.start();
      i.send("Foo");
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.deepStrictEqual(received, ["initial-value", "Foo"]);
      await inst.tearDown();
    });

    it("should not restart an already-started internal network on a redundant start", async () => {
      // A subgraph whose internal network was started implicitly (data
      // triggering the exported inport connect) must not get torn down
      // and restarted when the parent network later starts the component
      const inst = await cl.load("Defaults");
      const i = noflo.internalSocket.createSocket();
      const o = noflo.internalSocket.createSocket();
      inst.inPorts.in.attach(i);
      inst.outPorts.out.attach(o);
      // Implicit start via data before any explicit start
      i.send("Foo");
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.strictEqual(inst.network.isStarted(), true);
      // Parent-style explicit start must not stop/restart the network
      await inst.start();
      assert.strictEqual(inst.network.isStarted(), true);
      // The default was delivered once, not again after the restart
      const received = [];
      listen(o, "ip", (ip) => {
        if (ip.type === "data") {
          received.push(ip.data);
        }
      });
      i.send("Bar");
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.deepStrictEqual(received, ["Bar"]);
      await inst.tearDown();
    });

    it("should reactivate when receiving new data packets", async () => {
      const inst = await cl.load("Defaults");
      const i = noflo.internalSocket.createSocket();
      const o = noflo.internalSocket.createSocket();
      inst.inPorts.in.attach(i);
      inst.outPorts.out.attach(o);
      const expected = [
        "ACTIVATE 1",
        "data Foo",
        "DEACTIVATE 0",
        "ACTIVATE 1",
        "data Bar",
        "data Baz",
        "DEACTIVATE 0",
        "ACTIVATE 1",
        "data Foobar",
        "DEACTIVATE 0",
      ];
      const received = [];
      const send = [["Foo"], ["Bar", "Baz"], ["Foobar"]];
      const sendNext = () => {
        if (!send.length) {
          return;
        }
        const sends = send.shift();
        for (const d of sends) {
          i.post(new noflo.IP("data", d));
        }
      };
      const done = new Promise((resolve) => {
        listen(o, "ip", (ip) => {
          received.push(`${ip.type} ${ip.data}`);
        });
        listen(inst, "activate", (load) => {
          received.push(`ACTIVATE ${load}`);
        });
        listen(inst, "deactivate", (load) => {
          received.push(`DEACTIVATE ${load}`);
          sendNext();
          if (received.length !== expected.length) {
            return;
          }
          resolve();
        });
      });
      await inst.start();
      sendNext();
      await done;
      assert.deepStrictEqual(received, expected);
    });
  });
  describe("event forwarding on parent network", () => {
    describe("with a single level subgraph", () => {
      let graph = null;
      let network = null;
      before(async () => {
        graph = nativeGraph("main");
        network = await noflo.createNetwork(graph, {
          delay: true,
        });
        network.loader.components.Split = Split;
        network.loader.components.Merge = SubgraphMerge;
        const sg = nativeGraph("Subgraph");
        sg.addNode("A", "Split");
        sg.addNode("B", "Merge");
        sg.addEdge("A", "out", "B", "in");
        sg.addInport("in", "A", "in");
        sg.addOutport("out", "B", "out");
        await network.loader.registerGraph("foo", "AB", sg);
        await network.connect();
      });
      it("should instantiate the subgraph when node is added", async () => {
        await network.addNode({
          entity_id: "Sub",
          component: "foo/AB",
        });
        await network.addNode({
          entity_id: "Split",
          component: "Split",
        });
        await network.addEdge({
          from: {
            node: "Sub",
            port: "out",
          },
          to: {
            node: "Split",
            port: "in",
          },
        });
        assert.ok(Object.keys(network.processes).length > 0);
        assert.ok(network.processes.Sub);
      });
      it("should be possible to start the graph", async () => {
        await network.start();
      });
      it("should forward IP events", async () => {
        const expectedIps = [
          { id: "DATA -> IN Sub()", subgraph: undefined },
          { id: "A() OUT -> IN B()", subgraph: ["Sub"] },
          { id: "Sub() OUT -> IN Split()", subgraph: undefined },
        ];
        let index = 0;
        const done = new Promise((resolve) => {
          const listenNext = () => {
            const expected = expectedIps[index];
            listenOnce(network, "ip", (ip) => {
              assert.strictEqual(ip.id, expected.id);
              assert.strictEqual(ip.type, "data");
              assert.strictEqual(ip.data, "foo");
              assert.deepStrictEqual(ip.subgraph, expected.subgraph);
              index += 1;
              if (index < expectedIps.length) {
                listenNext();
                return;
              }
              resolve();
            });
          };
          listenNext();
        });
        await network.addInitial({
          from: {
            data: "foo",
          },
          to: {
            node: "Sub",
            port: "in",
          },
        });
        await done;
      });
    });
    describe("with two levels of subgraphs", () => {
      let graph = null;
      let network = null;
      const trace = new flowtrace.Flowtrace();
      before(async () => {
        graph = nativeGraph("main");
        network = await noflo.createNetwork(graph, {
          delay: true,
          flowtrace: trace,
        });
        network.loader.components.Split = Split;
        network.loader.components.Merge = SubgraphMerge;
        const sg = nativeGraph("Subgraph");
        sg.addNode("A", "Split");
        sg.addNode("B", "Merge");
        sg.addEdge("A", "out", "B", "in");
        sg.addInport("in", "A", "in");
        sg.addOutport("out", "B", "out");
        const sg2 = nativeGraph("Subgraph");
        sg2.addNode("A", "foo/AB");
        sg2.addNode("B", "Merge");
        sg2.addEdge("A", "out", "B", "in");
        sg2.addInport("in", "A", "in");
        sg2.addOutport("out", "B", "out");
        await network.loader.registerGraph("foo", "AB", sg);
        await network.loader.registerGraph("foo", "AB2", sg2);
        await network.connect();
      });
      it("should instantiate the subgraphs when node is added", async () => {
        await network.addNode({
          entity_id: "Sub",
          component: "foo/AB2",
        });
        await network.addNode({
          entity_id: "Split",
          component: "Split",
        });
        await network.addEdge({
          from: {
            node: "Sub",
            port: "out",
          },
          to: {
            node: "Split",
            port: "in",
          },
        });
        assert.ok(Object.keys(network.processes).length > 0);
        assert.ok(network.processes.Sub);
      });
      it("should be possible to start the graph", async () => {
        await network.start();
      });
      it("should forward IP events", async () => {
        const expectedIps = [
          { id: "DATA -> IN Sub()", subgraph: undefined },
          { id: "A() OUT -> IN B()", subgraph: ["Sub", "A"] },
          { id: "A() OUT -> IN B()", subgraph: ["Sub"] },
          { id: "Sub() OUT -> IN Split()", subgraph: undefined },
        ];
        let index = 0;
        const done = new Promise((resolve) => {
          const listenNext = () => {
            const expected = expectedIps[index];
            listenOnce(network, "ip", (ip) => {
              assert.strictEqual(ip.id, expected.id);
              assert.strictEqual(ip.type, "data");
              assert.strictEqual(ip.data, "foo");
              assert.deepStrictEqual(ip.subgraph, expected.subgraph);
              index += 1;
              if (index < expectedIps.length) {
                listenNext();
                return;
              }
              resolve();
            });
          };
          listenNext();
        });
        await network.addInitial({
          from: {
            data: "foo",
          },
          to: {
            node: "Sub",
            port: "in",
          },
        });
        await done;
      });
      it("should finish", async () => {
        await new Promise((resolve) => {
          listenOnce(network, "end", () => {
            resolve();
          });
        });
      });
      it("should produce a Flowtrace with both graphs included", () => {
        const collectedTrace = trace.toJSON();
        assert.deepEqual(
          Object.keys(collectedTrace.header.graphs),
          ["main", "foo/AB2", "foo/AB"],
          "should have exported all graphs",
        );
        const eventTypes = collectedTrace.events.map(
          (e) => `${e.protocol}:${e.command}`,
        );
        assert.deepStrictEqual(eventTypes, [
          "network:started",
          "network:data",
          "network:data",
          "network:data",
          "network:data",
          "network:stopped",
        ]);
        const subgraphs = collectedTrace.events.map((e) => {
          const s = e.payload.subgraph ? e.payload.subgraph.join(":") : "";
          return s;
        });
        assert.deepStrictEqual(subgraphs, ["", "", "Sub:A", "Sub", "", ""]);
      });
    });
  });
});
