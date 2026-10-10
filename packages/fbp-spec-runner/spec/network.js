import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as noflo from "@noflo/noflo";
import { resolveFixtureGraph } from "../src/fixture.js";
import { executeTestCase } from "../src/network.js";

/**
 * Register the fixture project components on a loader.
 *
 * @param {import("@noflo/noflo").ComponentLoader} loader
 * @returns {Promise<void>}
 */
async function registerTestComponents(loader) {
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
  const failsPort = () => {
    const c = new noflo.Component();
    c.inPorts.add("in", { datatype: "all" });
    c.outPorts.add("out", { datatype: "all" });
    c.outPorts.add("error", { datatype: "object" });
    c.process((_input, output) => {
      output.error(new Error("sent on error port"));
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
  loader.registerComponent("test", "FailsPort", failsPort);
  loader.registerComponent("test", "NeverSend", neverSend);
  await loader.listComponents();
}

describe("in-process test case execution", () => {
  let loader = null;

  before(async () => {
    loader = new noflo.ComponentLoader({});
    await registerTestComponents(loader);
  });

  it("runs a simple passing case against a registered component", async () => {
    await executeTestCase(
      loader,
      { topic: "test/Repeat" },
      {
        name: "simple",
        assertion: "should repeat",
        inputs: { in: 42 },
        expect: { out: { equals: 42 } },
      },
    );
  });

  it("runs pairwise sequences against a stateful component", async () => {
    await executeTestCase(
      loader,
      { topic: "test/Accumulate" },
      {
        name: "sequence",
        assertion: "should accumulate",
        inputs: [{ in: 1 }, { in: 2 }, { in: 10 }],
        expect: [
          { out: { equals: 1 } },
          { out: { equals: 3 } },
          { out: { above: 12 } },
        ],
      },
    );
  });

  it("fails on a wrong expectation", async () => {
    await assert.rejects(
      executeTestCase(
        loader,
        { topic: "test/Repeat" },
        {
          name: "wrong",
          assertion: "should fail",
          inputs: { in: 1 },
          expect: { out: { equals: 2 } },
        },
      ),
      /deep equality/,
    );
  });

  it("rejects with the component error when the process throws", async () => {
    await assert.rejects(
      executeTestCase(
        loader,
        { topic: "test/Boom" },
        {
          name: "boom",
          assertion: "should reject",
          inputs: { in: 1 },
          expect: { out: { equals: 1 } },
        },
      ),
      /component exploded/,
    );
  });

  it("fails when data arrives on the error port without being expected", async () => {
    await assert.rejects(
      executeTestCase(
        loader,
        { topic: "test/FailsPort" },
        {
          name: "errorport",
          assertion: "should fail on error port",
          inputs: { in: 1 },
          expect: { out: { equals: 1 } },
        },
      ),
      /error packet on port 'error'/,
    );
  });

  it("times out when no data arrives", async () => {
    await assert.rejects(
      executeTestCase(
        loader,
        { topic: "test/NeverSend" },
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
      executeTestCase(
        loader,
        { topic: "test/Repeat" },
        {
          name: "mismatch",
          assertion: "should fail",
          inputs: [{ in: 1 }],
          expect: [{ out: { equals: 1 } }, { out: { equals: 2 } }],
        },
      ),
      /Mismatch between number of inputs/,
    );
  });
});

describe("fixture graph resolution", () => {
  it("returns null for suites without a fixture", () => {
    assert.equal(resolveFixtureGraph({ topic: "test/Repeat" }), null);
  });

  it("parses JSON fixtures", () => {
    const graph = resolveFixtureGraph({
      topic: "test/Repeat",
      fixture: {
        type: "json",
        data: JSON.stringify({
          processes: { Testee: { component: "test/Repeat" } },
          inports: { in: { process: "Testee", port: "in" } },
          outports: { out: { process: "Testee", port: "out" } },
        }),
      },
    });
    assert.equal(graph.processes.Testee.component, "test/Repeat");
  });

  it("reports fbp-spec's JSON fixture parse error message", () => {
    assert.throws(
      () =>
        resolveFixtureGraph({
          topic: "test/Repeat",
          fixture: { type: "json", data: "{nope" },
        }),
      /Could not parse JSON fixture/,
    );
  });

  it("parses FBP DSL fixtures case-insensitively, like the reference parser", () => {
    const graph = resolveFixtureGraph({
      topic: "test/Repeat",
      fixture: {
        type: "fbp",
        data: "INPORT=Testee.IN:in\nOUTPORT=Testee.OUT:out\nTestee(test/Repeat)",
      },
    });
    assert.deepEqual(graph.inports.in, { process: "Testee", port: "in" });
    assert.deepEqual(graph.outports.out, { process: "Testee", port: "out" });
  });

  it("reports fbp-spec's FBP fixture parse error message", () => {
    assert.throws(
      () =>
        resolveFixtureGraph({
          topic: "test/Repeat",
          fixture: { type: "fbp", data: "not valid fbp)(" },
        }),
      /Could not parse FBP fixture/,
    );
  });

  it("rejects unknown fixture types", () => {
    assert.throws(
      () =>
        resolveFixtureGraph({
          topic: "test/Repeat",
          fixture: { type: "yaml", data: "a: b" },
        }),
      /Unknown fixture type yaml/,
    );
  });
});

describe("in-process execution against explicit fixture graphs", () => {
  let loader = null;

  before(async () => {
    loader = new noflo.ComponentLoader({});
    await registerTestComponents(loader);
  });

  it("runs a case against a JSON fixture graph", async () => {
    await executeTestCase(
      loader,
      {
        topic: "test/Repeat",
        fixture: {
          type: "json",
          data: JSON.stringify({
            processes: { Testee: { component: "test/Repeat" } },
            inports: { in: { process: "Testee", port: "in" } },
            outports: { out: { process: "Testee", port: "out" } },
          }),
        },
      },
      {
        name: "json fixture",
        assertion: "should repeat through the graph",
        inputs: { in: 42 },
        expect: { out: { equals: 42 } },
      },
    );
  });

  it("runs a case against an FBP DSL fixture graph", async () => {
    await executeTestCase(
      loader,
      {
        topic: "test/Repeat",
        fixture: {
          type: "fbp",
          data: "INPORT=Testee.IN:in\nOUTPORT=Testee.OUT:out\nTestee(test/Repeat)",
        },
      },
      {
        name: "fbp fixture",
        assertion: "should repeat through the graph",
        inputs: { in: "hello" },
        expect: { out: { equals: "hello" } },
      },
    );
  });

  it("runs pairwise sequences against a stateful fixture graph", async () => {
    await executeTestCase(
      loader,
      {
        topic: "test/Accumulate",
        fixture: {
          type: "json",
          data: JSON.stringify({
            processes: { Testee: { component: "test/Accumulate" } },
            inports: { in: { process: "Testee", port: "in" } },
            outports: { out: { process: "Testee", port: "out" } },
          }),
        },
      },
      {
        name: "stateful graph",
        assertion: "should accumulate through the graph",
        inputs: [{ in: 1 }, { in: 2 }],
        expect: [{ out: { equals: 1 } }, { out: { equals: 3 } }],
      },
    );
  });

  it("supports multi-process fixture graphs with connections", async () => {
    const double = () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "int" });
      c.outPorts.add("out", { datatype: "int" });
      c.process((input, output) => {
        output.sendDone({ out: input.getData("in") * 2 });
      });
      return c;
    };
    loader.registerComponent("test", "Double", double);
    await executeTestCase(
      loader,
      {
        topic: "test/Double",
        fixture: {
          type: "json",
          data: JSON.stringify({
            processes: {
              Source: { component: "test/Repeat" },
              Testee: { component: "test/Double" },
            },
            connections: [
              {
                src: { process: "Source", port: "out" },
                tgt: { process: "Testee", port: "in" },
              },
            ],
            inports: { in: { process: "Source", port: "in" } },
            outports: { out: { process: "Testee", port: "out" } },
          }),
        },
      },
      {
        name: "wired graph",
        assertion: "should double through two processes",
        inputs: { in: 21 },
        expect: { out: { equals: 42 } },
      },
    );
  });

  it("rejects with the process error when a fixture component throws", async () => {
    await assert.rejects(
      executeTestCase(
        loader,
        {
          topic: "test/Boom",
          fixture: {
            type: "json",
            data: JSON.stringify({
              processes: { Testee: { component: "test/Boom" } },
              inports: { in: { process: "Testee", port: "in" } },
              outports: { out: { process: "Testee", port: "out" } },
            }),
          },
        },
        {
          name: "boom",
          assertion: "should reject",
          inputs: { in: 1 },
          expect: { out: { equals: 1 } },
        },
      ),
      /component exploded/,
    );
  });

  it("fails when an unexpected error packet arrives on the error export", async () => {
    await assert.rejects(
      executeTestCase(
        loader,
        {
          topic: "test/FailsPort",
          fixture: {
            type: "json",
            data: JSON.stringify({
              processes: { Testee: { component: "test/FailsPort" } },
              inports: { in: { process: "Testee", port: "in" } },
              outports: {
                out: { process: "Testee", port: "out" },
                error: { process: "Testee", port: "error" },
              },
            }),
          },
        },
        {
          name: "error export",
          assertion: "should fail on error port",
          inputs: { in: 1 },
          expect: { out: { equals: 1 } },
        },
      ),
      /error packet on port 'error'/,
    );
  });

  it("allows cases that expect data on the error export", async () => {
    await executeTestCase(
      loader,
      {
        topic: "test/FailsPort",
        fixture: {
          type: "json",
          data: JSON.stringify({
            processes: { Testee: { component: "test/FailsPort" } },
            inports: { in: { process: "Testee", port: "in" } },
            outports: {
              error: { process: "Testee", port: "error" },
            },
          }),
        },
      },
      {
        name: "expected error",
        assertion: "should receive the error",
        inputs: { in: 1 },
        expect: { error: { type: "object" } },
      },
    );
  });

  it("times out when the fixture never sends data", async () => {
    await assert.rejects(
      executeTestCase(
        loader,
        {
          topic: "test/NeverSend",
          fixture: {
            type: "json",
            data: JSON.stringify({
              processes: { Testee: { component: "test/NeverSend" } },
              inports: { in: { process: "Testee", port: "in" } },
              outports: { out: { process: "Testee", port: "out" } },
            }),
          },
        },
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

  it("rejects inputs to ports not exported by the fixture", async () => {
    await assert.rejects(
      executeTestCase(
        loader,
        {
          topic: "test/Repeat",
          fixture: {
            type: "json",
            data: JSON.stringify({
              processes: { Testee: { component: "test/Repeat" } },
              inports: { in: { process: "Testee", port: "in" } },
              outports: { out: { process: "Testee", port: "out" } },
            }),
          },
        },
        {
          name: "unknown port",
          assertion: "should fail on unknown port",
          inputs: { nope: 1 },
          expect: { out: { equals: 1 } },
        },
      ),
      /no exported inlet port 'nope'/,
    );
  });
});
