import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createNodeModulesRegistry } from "@noflo/loader-node";
import * as noflo from "@noflo/noflo";
import Ajv2020 from "ajv/dist/2020.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
// The example package is its own discovery root: its components land in
// the `example/` namespace, its graphs register as graph models, and its
// committed noflo.json carries the schemas table (the #25/#37 dogfood).
const exampleDir = path.join(testDir, "..", "example");

/** The committed manifest. */
const manifest = JSON.parse(
  fs.readFileSync(path.join(exampleDir, "noflo.json"), "utf8"),
);

/** Resolve a named schema from the manifest's schemas table. */
function readSchema(id) {
  const entry = manifest.schemas[id];
  assert.ok(entry, `schema ${id} missing from the manifest`);
  return JSON.parse(fs.readFileSync(path.join(exampleDir, entry.path), "utf8"));
}

/** An ajv instance with the whole schemas table compiled. Mirrors the publish gate's validator: bodies register under their bare $id and their urn:noflo:id@digest published alias (the pinned refs resolve through the alias), and the NoFlo meta-catalog is stripped (meta-schema identity is the gate's own check). */
function makeAjv() {
  const ajv = new Ajv2020({ strict: false });
  for (const [id, entry] of Object.entries(manifest.schemas)) {
    const body = readSchema(id);
    const { $schema, ...clean } = body;
    ajv.addSchema(clean);
    const { $id, ...alias } = clean;
    ajv.addSchema(alias, `urn:noflo:${id}@${entry.digest}`);
  }
  return ajv;
}

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
  return { inSocket, outSocket, results };
};

describe("example schemas dogfood", () => {
  it("the committed manifest carries the car schemas table", () => {
    const expected = [
      "car/order",
      "car/chassis",
      "car/chassis-complete",
      "car/body",
      "car/body-complete",
      "car/assembly-chassis",
      "car/assembly-chassis-complete",
      "car/assembly-body",
      "car/assembly-body-complete",
      "car/assembly-combined",
      "car/car",
    ];
    for (const id of expected) {
      const entry = manifest.schemas[id];
      assert.ok(entry, `${id} missing`);
      assert.match(entry.digest, /^[0-9a-f]{64}$/);
      assert.ok(fs.existsSync(path.join(exampleDir, entry.path)));
    }
  });

  it("component ports carry schema references and projected guards", () => {
    const mount = manifest.components.find(
      /** @param {{ name: string }} c */ (c) =>
        c.name === "example/MountEngine",
    );
    const inPort = mount.signature.inports.find(
      /** @param {{ name: string }} p */ (p) => p.name === "in",
    );
    assert.equal(inPort.schema.id, "car/assembly-chassis");
    // The in-band guard projects the schema's object shape
    assert.deepEqual(inPort.guard, {
      type: "object",
      required: ["chassis", "errors", "id"],
    });
    // The inline control-port schema was hoisted, digest-keyed
    const engine = mount.signature.inports.find(
      /** @param {{ name: string }} p */ (p) => p.name === "engine",
    );
    assert.match(engine.schema.digest, /^[0-9a-f]{64}$/);
    assert.deepEqual(engine.guard, { type: "string" });
  });

  it("the BuildCar run releases a message that validates against car/car", async () => {
    const component = await loadExample("BuildCar");
    const { inSocket, results } = wire(component);

    inSocket.send(new noflo.IP("data", { errors: [], id: 7 }));
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(results.length, 1, "one released car");
    const car = results[0];

    const ajv = makeAjv();
    const validate = ajv.getSchema("car/car");
    assert.ok(validate);
    const ok = validate(car);
    assert.deepEqual(
      validate.errors ?? [],
      [],
      `released car failed car/car: ${JSON.stringify(car, null, 1)}`,
    );
    assert.ok(ok);
    // Order mints its own production id; both lines carry it
    assert.ok(car.id >= 1, "the production id is minted");
    assert.equal(car.chassis.id, car.id);
    assert.equal(car.body.id, car.id);
  });

  it("a malformed order fails the car/order schema", () => {
    const ajv = makeAjv();
    const validate = ajv.getSchema("car/order");
    assert.ok(validate);
    assert.equal(validate({ errors: [] }), false, "missing id rejected");
    assert.equal(validate({ id: 0, errors: [] }), false, "id 0 rejected");
    assert.equal(validate({ id: 3 }), false, "missing errors rejected");
    assert.equal(validate({ id: 3, errors: [] }), true);
  });

  it("a car missing the completion stages fails car/car", () => {
    const ajv = makeAjv();
    const validate = ajv.getSchema("car/car");
    assert.ok(validate);
    const incomplete = {
      errors: [],
      id: 1,
      chassis: { id: 1, frame: "Steel Frame" },
      body: { id: 1 },
    };
    assert.equal(validate(incomplete), false, "incomplete car rejected");
  });
});
