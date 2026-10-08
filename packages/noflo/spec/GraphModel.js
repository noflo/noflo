import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GraphModel } from "@noflo/graph";
import * as noflo from "../src/lib/NoFlo.js";

const Split = () =>
  new noflo.Component({
    inPorts: {
      in: { datatype: "all" },
    },
    outPorts: {
      out: { datatype: "all" },
    },
    process(input, output) {
      output.sendDone({ out: input.get("in") });
    },
  });
const Callback = () =>
  new noflo.Component({
    inPorts: {
      in: { datatype: "all" },
      callback: {
        datatype: "all",
        control: true,
      },
    },
    process(input, output) {
      if (!input.hasData("in") || !input.hasData("callback")) {
        return;
      }
      const cb = input.getData("callback");
      const data = input.getData("in");
      cb(data);
      output.done();
    },
  });

/** Build a loader-configured network from a native model. */
async function nativeNetwork(model) {
  const network = await noflo.createNetwork(model, {
    asyncDelivery: true,
    delay: true,
    baseDir: process.cwd(),
  });
  network.loader.components.Split = Split;
  network.loader.components.Callback = Callback;
  return network;
}

describe("Network from the native graph model", () => {
  it("runs a network built from a GraphModel", async () => {
    const model = new GraphModel({ name: "native" });
    model.addNode({ entity_id: "Split", component: "Split" });
    model.addNode({ entity_id: "Callback", component: "Callback" });
    model.addEdge({
      from: { node: "Split", port: "out" },
      to: { node: "Callback", port: "in" },
    });

    const network = await nativeNetwork(model);
    await network.connect();
    await network.start();

    assert.deepEqual(Object.keys(network.processes), ["Split", "Callback"]);
    assert.equal(network.isStarted(), true);
    await network.stop();
  });

  it("delivers graph IIPs as initial packets", async () => {
    /** @type {() => void} */
    let deliver;
    const gate = new Promise((resolve) => {
      deliver = resolve;
    });

    const model = new GraphModel({ name: "native-iip" });
    model.addNode({ entity_id: "Split", component: "Split" });
    model.addNode({ entity_id: "Callback", component: "Callback" });
    model.addEdge({
      from: { node: "Split", port: "out" },
      to: { node: "Callback", port: "in" },
    });
    model.addIIP({ data: "Foo", to: { node: "Split", port: "in" } });
    model.addIIP({
      data: (data) => {
        assert.equal(data, "Foo");
        deliver();
      },
      to: { node: "Callback", port: "callback" },
    });

    const network = await nativeNetwork(model);
    await network.connect();
    await network.start();
    await gate;
    await network.stop();
  });

  it("mirrors live-edit mutations back into the model", async () => {
    const model = new GraphModel({ name: "native-live" });
    model.addNode({ entity_id: "Callback", component: "Callback" });

    const network = await nativeNetwork(model);
    await network.connect();

    await network.addNode({
      entity_id: "Split",
      component: "Split",
      metadata: {},
    });
    assert.equal(model.hasNode("Split"), true);
    assert.equal(model.node("Split").component, "Split");

    await network.renameNode("Split", "Splitter");
    assert.equal(model.hasNode("Split"), false);
    assert.equal(model.hasNode("Splitter"), true);

    await network.removeNode({ entity_id: "Splitter", component: "Split" });
    assert.equal(model.hasNode("Splitter"), false);

    await network.stop();
  });

  it("mirrors live-edit edge mutations back into the model", async () => {
    const model = new GraphModel({ name: "native-live-edge" });
    model.addNode({ entity_id: "Split", component: "Split" });
    model.addNode({ entity_id: "Callback", component: "Callback" });

    const network = await nativeNetwork(model);
    await network.connect();

    await network.addEdge({
      from: { node: "Split", port: "out" },
      to: { node: "Callback", port: "in" },
    });
    assert.equal(model.edges().length, 1);

    await network.removeEdge({
      from: { node: "Split", port: "out" },
      to: { node: "Callback", port: "in" },
    });
    assert.equal(model.edges().length, 0);

    await network.stop();
  });
});
