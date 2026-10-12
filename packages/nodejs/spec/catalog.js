import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Component, ComponentLoader } from "@noflo/noflo";
import { catalogFromLoader, componentDetail } from "../src/catalog.js";

class Forward extends Component {
  constructor() {
    super({
      description: "Forwards",
      inPorts: {
        in: { datatype: "string", required: true },
        config: { datatype: "string", control: true, required: true },
      },
      outPorts: { out: { datatype: "string" } },
    });
    this.process(function process(input, output) {
      if (!input.hasData("in")) {
        return;
      }
      output.sendDone({ out: input.getData("in") });
    });
  }
}

class NoPorts extends Component {
  constructor() {
    super({});
    this.process(function process() {});
  }
}

const registry = {
  list: () => ({
    "test/Forward": { getComponent: () => new Forward() },
    "test/NoPorts": { getComponent: () => new NoPorts() },
  }),
  get: (name) => {
    const implementations = {
      "test/Forward": { getComponent: () => new Forward() },
      "test/NoPorts": { getComponent: () => new NoPorts() },
    };
    const implementation = implementations[name];
    return implementation
      ? Promise.resolve(implementation)
      : Promise.resolve(undefined);
  },
};

describe("catalog", () => {
  describe("componentDetail", () => {
    it("derives the wire signature from an instantiated component", () => {
      const detail = componentDetail(new Forward());
      assert.equal(detail.type, "elementary");
      assert.deepEqual(
        detail.in.map((p) => p.id),
        ["in", "config"],
      );
      assert.equal(detail.in[0].type, "string");
      assert.equal(detail.in[0].required, true);
      assert.equal(detail.in[0].control, undefined);
      assert.equal(detail.in[1].control, true);
      assert.deepEqual(
        detail.out.map((p) => p.id),
        ["out"],
      );
      assert.equal(detail.out[0].type, "string");
    });
  });

  describe("catalogFromLoader", () => {
    it("harvests every component in the loader's catalog", async () => {
      const loader = new ComponentLoader({
        registry: /** @type {any} */ (registry),
      });
      const catalog = await catalogFromLoader(loader);
      const signatures = await catalog.signatures();
      assert.deepEqual(Object.keys(signatures).sort(), [
        "test/Forward",
        "test/NoPorts",
      ]);
      assert.equal(signatures["test/Forward"].type, "elementary");
      assert.equal(signatures["test/NoPorts"].in.length, 0);
      assert.equal(signatures["test/NoPorts"].out.length, 0);
    });
  });
});
