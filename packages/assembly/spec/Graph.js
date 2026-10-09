import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createNodeModulesRegistry } from "@noflo/loader-node";
import * as noflo from "@noflo/noflo";

const testDir = path.dirname(fileURLToPath(import.meta.url));
// The example package is its own discovery root: its components land in
// the `example/` namespace and its graphs register as graph models
const exampleDir = path.join(testDir, "..", "example");

/**
 * Loads an example graph as a started subgraph component.
 * @param {string} name
 */
const loadExample = async (name) => {
  const registry = await createNodeModulesRegistry(exampleDir);
  const loader = new noflo.ComponentLoader({ registry });
  const component = await loader.load(`example/${name}`);
  // Starting the component starts the internal network and delivers its
  // IIPs; data sent before start would race the implicit start
  await component.start();
  return component;
};

/**
 * @param {import("@noflo/noflo").Component} component
 */
const wire = (component) => {
  const inSocket = noflo.internalSocket.createSocket();
  const outSocket = noflo.internalSocket.createSocket();
  component.inPorts.in.attach(inSocket);
  component.outPorts.out.attach(outSocket);
  /** @type {Record<string, any>[]} */
  const results = [];
  outSocket.addEventListener(
    "ip",
    /** @param {CustomEvent} event */ (event) => {
      if (event.detail.type === "data") {
        results.push(event.detail.data);
      }
    },
  );
  return { inSocket, results };
};

describe("Assembly graphs", () => {
  it("BuildChassis builds a car chassis in a pipeline", async () => {
    const component = await loadExample("BuildChassis");
    const { inSocket, results } = wire(component);
    inSocket.post(new noflo.IP("data", { errors: [], id: 123 }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(results.length, 1);
    const msg = results[0];
    assert.equal(msg.errors.length, 0);
    assert.equal(msg.id, 123);
    assert.ok(msg.chassis);
    assert.equal(msg.chassis.frame, "Steel Frame");
    assert.equal(msg.chassis.engine, "Mercedes V8 5.0");
    assert.equal(msg.chassis.transmission, "ZF Automatic 6-speed");
    assert.ok(msg.chassis.driveShaft);
    await component.tearDown();
  });

  it("BuildBody builds a car body in a branching graph", async () => {
    const component = await loadExample("BuildBody");
    const { inSocket, results } = wire(component);
    inSocket.post(new noflo.IP("data", { errors: [], id: 123 }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(results.length, 1);
    const msg = results[0];
    assert.equal(msg.errors.length, 0);
    assert.equal(msg.id, 123);
    assert.ok(msg.body);
    assert.equal(msg.body.id, msg.id);
    assert.ok(msg.body.panels);
    assert.ok(msg.body.interior);
    assert.equal(msg.body.doors.length, 4);
    assert.ok(msg.body.electrics);
    await component.tearDown();
  });

  it("BuildCar builds a whole car with subgraphs", async () => {
    const component = await loadExample("BuildCar");
    const { inSocket, results } = wire(component);
    inSocket.post(new noflo.IP("data", { errors: [], id: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(results.length, 1);
    const msg = results[0];
    assert.equal(msg.errors.length, 0);
    assert.equal(msg.id, 1);
    assert.ok(msg.chassis);
    assert.ok(msg.body);
    await component.tearDown();
  });
});
