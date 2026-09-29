import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as noflo from "noflo";
import { executeTestCase } from "../src/network.js";

describe("in-process test case execution", () => {
  let loader = null;

  before(async () => {
    loader = new noflo.ComponentLoader(process.cwd());
    await loader.listComponents();
    const repeat = () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.outPorts.add("out", { datatype: "all" });
      c.process((input, output) => {
        output.sendDone({ out: input.getData("in") });
      });
      return c;
    };
    const accumulate = () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "int" });
      c.outPorts.add("out", { datatype: "int" });
      let sum = 0;
      c.process((input, output) => {
        sum += input.getData("in");
        output.sendDone({ out: sum });
      });
      return c;
    };
    const boom = () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.outPorts.add("out", { datatype: "all" });
      c.process(() => {
        throw new Error("component exploded");
      });
      return c;
    };
    const neverSend = () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.outPorts.add("out", { datatype: "all" });
      c.process(() => {
        /* receives but never outputs */
      });
      return c;
    };
    loader.registerComponent("test", "Repeat", repeat);
    loader.registerComponent("test", "Accumulate", accumulate);
    loader.registerComponent("test", "Boom", boom);
    loader.registerComponent("test", "NeverSend", neverSend);
  });

  it("runs a simple passing case against a registered component", async () => {
    await executeTestCase(loader, "test/Repeat", {
      name: "simple",
      assertion: "should repeat",
      inputs: { in: 42 },
      expect: { out: { equals: 42 } },
    });
  });

  it("runs pairwise sequences against a stateful component", async () => {
    await executeTestCase(loader, "test/Accumulate", {
      name: "sequence",
      assertion: "should accumulate",
      inputs: [{ in: 1 }, { in: 2 }, { in: 10 }],
      expect: [
        { out: { equals: 1 } },
        { out: { equals: 3 } },
        { out: { above: 12 } },
      ],
    });
  });

  it("fails on a wrong expectation", async () => {
    await assert.rejects(
      executeTestCase(loader, "test/Repeat", {
        name: "wrong",
        assertion: "should fail",
        inputs: { in: 1 },
        expect: { out: { equals: 2 } },
      }),
      /deep equality/,
    );
  });

  it("rejects with the component error when the process throws", async () => {
    await assert.rejects(
      executeTestCase(loader, "test/Boom", {
        name: "boom",
        assertion: "should reject",
        inputs: { in: 1 },
        expect: { out: { equals: 1 } },
      }),
      /component exploded/,
    );
  });

  it("times out when no data arrives", async () => {
    await assert.rejects(
      executeTestCase(
        loader,
        "test/NeverSend",
        {
          name: "timeout",
          assertion: "should time out",
          inputs: { in: 1 },
          expect: { out: { equals: 1 } },
        },
        200,
      ),
      /Timeout/,
    );
  });

  it("rejects mismatched input/expect sequence lengths", async () => {
    await assert.rejects(
      executeTestCase(loader, "test/Repeat", {
        name: "mismatch",
        assertion: "should fail",
        inputs: [{ in: 1 }],
        expect: [{ out: { equals: 1 } }, { out: { equals: 2 } }],
      }),
      /Mismatch between number of inputs/,
    );
  });
});
