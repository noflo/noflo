import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as noflo from "../src/lib/NoFlo.js";
import {
  guardAccepts,
  guardSubsumes,
  resolveContractPolicy,
} from "../src/lib/PortContract.js";
import { applyPortMetadata } from "../src/lib/PortMetadata.js";
import { nativeGraph } from "./utils/nativeGraph.js";

describe("PortContract policy resolution", () => {
  it("resolves the first defined candidate", () => {
    assert.equal(resolveContractPolicy("strict", "diagnostic", "off"), "strict");
    assert.equal(resolveContractPolicy(undefined, "diagnostic", "off"), "diagnostic");
    assert.equal(resolveContractPolicy(undefined, undefined, "off"), "off");
    assert.equal(resolveContractPolicy(), "off");
  });

  it("rejects policies outside the vocabulary", () => {
    assert.throws(
      () => resolveContractPolicy("loud"),
      /Invalid port-contract policy/,
    );
  });
});

describe("guardAccepts", () => {
  const guard = {
    type: "object",
    required: ["id", "errors"],
  };

  it("accepts objects satisfying the required keys", () => {
    assert.equal(guardAccepts(guard, { id: 1, errors: [] }), true);
  });

  it("rejects objects missing required keys", () => {
    assert.equal(guardAccepts(guard, { id: 1 }), false);
    assert.equal(guardAccepts(guard, "string"), false);
    assert.equal(guardAccepts(guard, null), false);
  });

  it("passes unguarded values", () => {
    assert.equal(guardAccepts(null, { anything: true }), true);
    assert.equal(guardAccepts(undefined, 42), true);
  });

  it("checks enum, bounds, and integer types", () => {
    const g = { type: "integer", min: 1, max: 4 };
    assert.equal(guardAccepts(g, 2), true);
    assert.equal(guardAccepts(g, 5), false);
    assert.equal(guardAccepts(g, 1.5), false);
    const e = { enum: ["a", "b"] };
    assert.equal(guardAccepts(e, "a"), true);
    assert.equal(guardAccepts(e, "c"), false);
  });
});

describe("guardSubsumes", () => {
  it("passes when the target demands nothing", () => {
    assert.equal(guardSubsumes(null, null), true);
    assert.equal(guardSubsumes({ type: "object" }, null), true);
    assert.equal(guardSubsumes(null, {}), true);
  });

  it("fails when the source makes no promise and the target demands", () => {
    assert.equal(guardSubsumes(null, { type: "object" }), false);
    assert.equal(guardSubsumes({}, { type: "object" }), false);
  });

  it("fails on the staged-completeness gap", () => {
    const frame = { type: "object", required: ["chassis", "errors", "id"] };
    const combined = {
      type: "object",
      required: ["chassis", "errors", "id", "body"],
    };
    assert.equal(guardSubsumes(frame, combined), false);
    assert.equal(guardSubsumes(combined, frame), true);
  });

  it("checks types, enums, bounds, and required sets directionally", () => {
    assert.equal(guardSubsumes({ type: "integer" }, { type: "number" }), true);
    assert.equal(guardSubsumes({ type: "number" }, { type: "integer" }), false);
    assert.equal(
      guardSubsumes({ enum: ["a"] }, { enum: ["a", "b"] }),
      true,
    );
    assert.equal(
      guardSubsumes({ enum: ["a", "b"] }, { enum: ["a"] }),
      false,
    );
    // An unbounded source cannot subsume a bounded target: it could
    // emit values outside the demanded interval
    assert.equal(guardSubsumes({ min: 2 }, { min: 1, max: 10 }), false);
    assert.equal(
      guardSubsumes({ min: 2, max: 9 }, { min: 1, max: 10 }),
      true,
    );
    assert.equal(guardSubsumes({ min: 0 }, { min: 1 }), false);
    assert.equal(
      guardSubsumes({ required: ["a", "b"] }, { required: ["a"] }),
      true,
    );
    assert.equal(
      guardSubsumes({ required: ["a"] }, { required: ["a", "b"] }),
      false,
    );
  });
});

/** A guarded sender whose outgoing messages are complete cars. */
const CompleteSender = () =>
  new noflo.Component({
    inPorts: { in: { datatype: "bang" } },
    outPorts: {
      out: {
        datatype: "object",
        guard: { type: "object", required: ["id", "chassis"] },
      },
    },
    process(input, output) {
      output.sendDone({ out: { id: 1, chassis: {} } });
    },
  });

/** A guarded receiver demanding the complete car. */
const CompletenessDemanding = (policy) => () =>
  new noflo.Component({
    inPorts: {
      in: {
        datatype: "object",
        contract: policy,
        guard: { type: "object", required: ["id", "chassis", "body"] },
      },
    },
    outPorts: { out: { datatype: "object" } },
    process(input, output) {
      output.sendDone({ out: input.get("in") });
    },
  });

describe("PortContract network surfaces", () => {
  it("off (default): a subsumption-violating edge builds and runs", async () => {
    const g = nativeGraph();
    g.addNode("s", "S");
    g.addNode("r", "R");
    g.addEdge({ from: { node: "s", port: "out" }, to: { node: "r", port: "in" } });
    const network = await noflo.createNetwork(g, {
      asyncDelivery: true,
      delay: true,
    });
    network.loader.components.S = CompleteSender;
    network.loader.components.R = CompletenessDemanding("off");
    await network.connect();
    // The build succeeded despite the incomplete guarantee
    assert.equal(network.connections.length, 1);
  });

  it("strict: a subsumption-violating edge fails the build loudly", async () => {
    const g = nativeGraph();
    g.addNode("s", "S");
    g.addNode("r", "R");
    g.addEdge({
      from: { node: "s", port: "out" },
      to: { node: "r", port: "in" },
      metadata: { contract: "strict" },
    });
    const network = await noflo.createNetwork(g, {
      asyncDelivery: true,
      delay: true,
    });
    network.loader.components.S = CompleteSender;
    network.loader.components.R = CompletenessDemanding("strict");
    await assert.rejects(
      () => network.connect(),
      /Port-contract subsumption violation/,
    );
  });

  it("diagnostic: a subsumption-violating edge builds with a warning", async () => {
    const g = nativeGraph();
    g.addNode("s", "S");
    g.addNode("r", "R");
    g.addEdge({
      from: { node: "s", port: "out" },
      to: { node: "r", port: "in" },
      metadata: { contract: "diagnostic" },
    });
    const network = await noflo.createNetwork(g, {
      asyncDelivery: true,
      delay: true,
    });
    network.loader.components.S = CompleteSender;
    network.loader.components.R = CompletenessDemanding("diagnostic");
    await network.connect();
    assert.equal(network.connections.length, 1);
  });

  it("strict: an IIP violating the target guard fails the build", async () => {
    const g = nativeGraph();
    g.addNode("r", "R");
    g.addInitial(3, "r", "in");
    const network = await noflo.createNetwork(g, {
      asyncDelivery: true,
      delay: true,
    });
    network.loader.components.R = CompletenessDemanding("strict");
    await assert.rejects(
      () => network.connect(),
      /violates the port guard/,
    );
  });

  it("strict: a lying sender escalates as a process error", async () => {
    const LyingSender = () =>
      new noflo.Component({
        inPorts: { in: { datatype: "bang" } },
        outPorts: {
          out: {
            datatype: "object",
            contract: "strict",
            guard: { type: "object", required: ["id", "chassis", "body"] },
          },
        },
        process(input, output) {
          // The sender lies: its payload lacks body
          output.sendDone({ out: { id: 1, chassis: {} } });
        },
      });
    const g = nativeGraph();
    g.addNode("s", "S");
    g.addNode("r", "R");
    g.addEdge({ from: { node: "s", port: "out" }, to: { node: "r", port: "in" } });
    g.addInitial(null, "s", "in");
    const network = await noflo.createNetwork(g, {
      asyncDelivery: true,
      delay: true,
    });
    network.loader.components.S = LyingSender;
    network.loader.components.R = CompletenessDemanding("off");
    await network.connect();
    const errors = [];
    network.addEventListener("process-error", (event) => {
      errors.push(event.detail);
    });
    await network.start();
    await network.stop();
    // The escalation is asynchronous: the async-delivery IIP trigger
    // fires the sender late in the drain sequence, so the process-error
    // lands on the network's event after stop begins
    const deadline = Date.now() + 5_000;
    while (errors.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(errors.length > 0, true, "a process error was raised");
    const err = errors[0].error ?? errors[0];
    assert.match(String(err?.message ?? err), /violates its own port guard/);
  });

  it("noflo.contract node metadata applies the instance-wide policy", () => {
    const component = CompletenessDemanding("off")();
    applyPortMetadata(component, { "noflo.contract": "diagnostic" });
    assert.equal(component.inPorts.ports.in.getContractPolicy(), "diagnostic");
    assert.throws(
      () => applyPortMetadata(component, { "noflo.contract": "loud" }),
      /off, diagnostic, strict/,
    );
  });
});
