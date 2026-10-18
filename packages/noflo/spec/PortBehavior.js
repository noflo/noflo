// Per-instance port-behavior overrides (work document #44): the noflo.*
// node metadata keys applied by the Network after instantiation. The knob
// matrix from the work document — promote data → control, demote control
// → data, scoped flips, forwarding rules replaced and restored by
// omission — each verified at the Process API level, with the
// zero-regression posture pinned by a second instance of the same
// component carrying no metadata.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as noflo from "../src/lib/NoFlo.js";
import { Subgraph } from "../src/components/Subgraph.js";
import { applyPortMetadata } from "../src/lib/PortMetadata.js";

/**
 * A component with one data inport, one control-declared inport, one
 * unscoped-declared inport, and one bracket-forwarded inport — the knobs
 * the matrix exercises.
 *
 * @returns {noflo.Component} The component instance.
 */
const makeComponent = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "all" });
  c.inPorts.add("config", {
    control: true,
    scoped: false,
    datatype: "all",
  });
  c.inPorts.add("flat", { datatype: "all", scoped: false });
  c.inPorts.add("framed", { datatype: "all" });
  c.outPorts.add("out", { datatype: "all" });
  c.outPorts.add("error", { datatype: "object" });
  c.forwardBrackets = { framed: ["out"] };
  c.process((input, output) => {
    // The has-first pattern reading every leg non-consumingly before
    // consuming: the gate reads (control) resolve per activation, and
    // the data legs consume
    if (
      !input.hasData("config") ||
      !input.hasData("in") ||
      !input.hasData("flat") ||
      !input.hasStream("framed")
    ) {
      return;
    }
    const config = input.getData("config");
    const value = input.getData("in");
    const flat = input.getData("flat");
    const stream = input
      .getStream("framed")
      .filter((packet) => packet.type === "data")
      .map((packet) => packet.data);
    output.sendDone({ out: { config, value, flat, stream } });
  });
  return c;
};

const collect = (component, outPort = "out") => {
  const received = [];
  const out = noflo.internalSocket.createSocket();
  component.outPorts.ports[outPort].attach(out);
  out.addEventListener("ip", (event) => {
    if (event.detail.type === "data") {
      received.push(event.detail.data);
    } else if (event.detail.type === "openBracket") {
      received.push(new noflo.IP("openBracket", event.detail.data));
    } else if (event.detail.type === "closeBracket") {
      received.push(new noflo.IP("closeBracket", event.detail.data));
    }
  });
  return received;
};

const attach = (component, names) => {
  const sockets = {};
  for (const name of names) {
    const socket = noflo.internalSocket.createSocket();
    component.inPorts.ports[name].attach(socket);
    sockets[name] = socket;
  }
  return sockets;
};

const post = (socket, type, data, scope) => {
  const packet = new noflo.IP(type, data);
  if (scope !== undefined) {
    packet.scope = scope;
  }
  socket.post(packet);
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("per-instance port behavior: the control knob", () => {
  it("promotes a data inport to the gate model", async () => {
    const instance = makeComponent();
    applyPortMetadata(instance, { "noflo.control": ["in"] });
    assert.strictEqual(instance.inPorts.ports.in.options.control, true);
    const received = collect(instance);
    const sockets = attach(instance, ["in", "config", "flat", "framed"]);

    // The promoted port's arrival alone fires nothing: a gate does not
    // activate on its own
    post(sockets.in, "data", "gated");
    await settle();
    assert.deepStrictEqual(received, [], "the gate buffers silently");

    // The other legs' arrivals re-fire the pending work, and the gate
    // read is non-consuming — the same standing value serves again
    post(sockets.config, "data", { mode: "m" });
    post(sockets.flat, "data", "f");
    post(sockets.framed, "openBracket", "s");
    post(sockets.framed, "data", "s1");
    post(sockets.framed, "data", "s2");
    post(sockets.framed, "closeBracket", "s");
    await settle();
    assert.deepStrictEqual(
      received,
      [
        {
          config: { mode: "m" },
          value: "gated",
          flat: "f",
          stream: ["s1", "s2"],
        },
      ],
      "the pending work completed on the other legs' arrivals",
    );
    assert.strictEqual(instance.load, 0);
  });

  it("demotes a declared control port to a firing edge", async () => {
    // Replace semantics: the empty list is the instance's complete gate
    // set — no gates, so the declared control port becomes a direct
    // firing edge with consuming reads
    const instance = makeComponent();
    applyPortMetadata(instance, { "noflo.control": [] });
    assert.strictEqual(instance.inPorts.ports.config.options.control, false);
    const received = collect(instance);
    const sockets = attach(instance, ["config", "in", "flat", "framed"]);

    // The demoted port's arrival fires directly
    post(sockets.config, "data", { mode: "m" });
    await settle();
    assert.deepStrictEqual(received, [], "the activation ran and declined");

    // The remaining legs complete the pattern
    post(sockets.in, "data", "v");
    post(sockets.flat, "data", "f");
    post(sockets.framed, "openBracket", "s");
    post(sockets.framed, "data", "s1");
    post(sockets.framed, "data", "s2");
    post(sockets.framed, "closeBracket", "s");
    await settle();
    assert.deepStrictEqual(
      received,
      [{ config: { mode: "m" }, value: "v", flat: "f", stream: ["s1", "s2"] }],
      "the demoted leg's value was consumed",
    );
  });

  it("replaces the declared gate set per instance", async () => {
    // Two instances of one component: the first promotes an extra gate
    // and demotes the declared one; the second, with no metadata, keeps
    // the declared behavior — the zero-regression posture
    const overridden = makeComponent();
    applyPortMetadata(overridden, { "noflo.control": ["in"] });
    const stock = makeComponent();

    assert.strictEqual(overridden.inPorts.ports.in.options.control, true);
    assert.strictEqual(overridden.inPorts.ports.config.options.control, false);
    assert.strictEqual(stock.inPorts.ports.in.options.control, false);
    assert.strictEqual(stock.inPorts.ports.config.options.control, true);
  });
});

describe("per-instance port behavior: the scoped knob", () => {
  it("flips a declared scoped port to unscoped", async () => {
    const instance = makeComponent();
    applyPortMetadata(instance, { "noflo.scoped": { in: false } });
    assert.strictEqual(instance.inPorts.ports.in.options.scoped, false);
    const received = collect(instance);
    const sockets = attach(instance, ["in", "config", "flat", "framed"]);

    // A scoped IP lands in the default buffer and is readable from a
    // scopeless activation
    post(sockets.in, "data", "s1", "request-1");
    post(sockets.config, "data", { mode: "m" });
    post(sockets.flat, "data", "f");
    post(sockets.framed, "openBracket", "s");
    post(sockets.framed, "data", "x");
    post(sockets.framed, "closeBracket", "s");
    await settle();
    assert.deepStrictEqual(
      received,
      [{ config: { mode: "m" }, value: "s1", flat: "f", stream: ["x"] }],
      "the scoped IP joined the unscoped pool",
    );
  });

  it("flips a declared unscoped port to scoped", async () => {
    const instance = makeComponent();
    applyPortMetadata(instance, { "noflo.scoped": { flat: true } });
    assert.strictEqual(instance.inPorts.ports.flat.options.scoped, true);
    const received = collect(instance);
    const sockets = attach(instance, ["in", "config", "flat", "framed"]);

    // Two scopes' flat legs buffer separately; each activation sees only
    // its scope's value
    post(sockets.in, "data", "v1", "s1");
    post(sockets.flat, "data", "f1", "s1");
    post(sockets.in, "data", "v2", "s2");
    post(sockets.flat, "data", "f2", "s2");
    post(sockets.config, "data", { mode: "m" });
    post(sockets.framed, "openBracket", "s");
    post(sockets.framed, "data", "x", "s1");
    post(sockets.framed, "closeBracket", "s");
    post(sockets.framed, "openBracket", "s");
    post(sockets.framed, "data", "y", "s2");
    post(sockets.framed, "closeBracket", "s");
    await settle();
    const byValue = received.map((r) => r.value);
    assert.deepStrictEqual(
      byValue.sort(),
      ["v1", "v2"],
      "each scope's legs paired independently",
    );
  });
});

describe("per-instance port behavior: the forwarding knob", () => {
  // Forwarded brackets attach to the ports the component's actual sends
  // go through (the send's port must be a forwarding target of the firing
  // inport). A dual-send relay makes the knob's effect observable: the
  // declared rule wraps the out leg; the override reroutes the framing to
  // the error leg
  const makeRelay = () => {
    const c = new noflo.Component();
    c.inPorts.add("in", { datatype: "all" });
    c.outPorts.add("out", { datatype: "all" });
    c.outPorts.add("error", { datatype: "object" });
    c.forwardBrackets = { in: ["out"] };
    c.process((input, output) => {
      if (input.hasData("in")) {
        const value = input.getData("in");
        output.send({ out: value });
        output.sendDone({ error: { detail: `processed:${value}` } });
      }
    });
    return c;
  };
  const framedStream = (socket) => {
    post(socket, "openBracket", "g");
    post(socket, "data", "x");
    post(socket, "closeBracket", "g");
  };
  const collectPorts = (instance) => ({
    outReceived: collect(instance, "out"),
    errorReceived: collect(instance, "error"),
  });

  it("declared: the framing wraps the out leg; the error leg is bare", async () => {
    const instance = makeRelay();
    const { outReceived, errorReceived } = collectPorts(instance);
    const sockets = attach(instance, ["in"]);
    framedStream(sockets.in);
    await settle();
    assert.deepStrictEqual(outReceived, [
      new noflo.IP("openBracket", "g"),
      "x",
      new noflo.IP("closeBracket", "g"),
    ]);
    assert.deepStrictEqual(errorReceived, [{ detail: "processed:x" }]);
  });

  it("replaces the declared rule: the framing reroutes to the error leg", async () => {
    const instance = makeRelay();
    applyPortMetadata(instance, { "noflo.forwardBrackets": { in: ["error"] } });
    const { outReceived, errorReceived } = collectPorts(instance);
    const sockets = attach(instance, ["in"]);
    framedStream(sockets.in);
    await settle();
    assert.deepStrictEqual(outReceived, ["x"], "the out leg is bare");
    assert.deepStrictEqual(
      errorReceived,
      [
        new noflo.IP("openBracket", "g"),
        { detail: "processed:x" },
        new noflo.IP("closeBracket", "g"),
      ],
      "the framing rides the error leg",
    );
  });

  it("terminates framing per instance via the empty rule", async () => {
    const instance = makeRelay();
    applyPortMetadata(instance, { "noflo.forwardBrackets": { in: [] } });
    const { outReceived, errorReceived } = collectPorts(instance);
    const sockets = attach(instance, ["in"]);
    framedStream(sockets.in);
    await settle();
    assert.deepStrictEqual(outReceived, ["x"], "the brackets terminated");
    assert.deepStrictEqual(errorReceived, [{ detail: "processed:x" }]);
  });
});

describe("per-instance port behavior: the outport-side scoped flip", () => {
  it("is rejected: its semantics need their own design pass", () => {
    // An outport's scoped option gates the scope stamping at send time,
    // and the flip interacts with the ordered-output and forwarding
    // machinery — the under-tested combination the review flagged.
    // Tightened rather than shipped untested
    const instance = makeComponent();
    assert.throws(
      () => applyPortMetadata(instance, { "noflo.scoped": { out: false } }),
      /the outport-side scoped flip interacts with the ordered-output and forwarding machinery/,
    );
  });
});

describe("per-instance port behavior: subgraph exclusion", () => {
  it("rejects noflo. overrides on subgraph nodes", async () => {
    const innerGraph = noflo.importFbpJson({
      processes: { inner: { component: "Sink" } },
    });
    const graph = noflo.importFbpJson({
      processes: {
        wrapped: {
          component: "Inner",
          metadata: { "noflo.control": ["in"] },
        },
      },
    });
    const network = await noflo.createNetwork(graph, { delay: true });
    network.loader.registerComponent("", "Inner", (metadata) =>
      new Subgraph(innerGraph, { metadata }),
    );
    network.loader.registerComponent("", "Sink", () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.process(() => {});
      return c;
    });
    await assert.rejects(
      () => network.connect(),
      /noflo\.\* overrides do not apply to subgraph nodes/,
    );
  });
});

describe("per-instance port behavior: validation", () => {
  it("rejects unknown noflo. keys", () => {
    const instance = makeComponent();
    assert.throws(
      () => applyPortMetadata(instance, { "noflo.triggering": ["in"] }),
      /the noflo\/port-behavior schema declares/,
    );
  });

  it("rejects nonexistent ports", () => {
    const instance = makeComponent();
    assert.throws(
      () => applyPortMetadata(instance, { "noflo.control": ["nope"] }),
      /names inport 'nope', which the component does not have/,
    );
    assert.throws(
      () => applyPortMetadata(instance, { "noflo.scoped": { nope: true } }),
      /names port 'nope', which the component does not have/,
    );
    assert.throws(
      () =>
        applyPortMetadata(instance, {
          "noflo.forwardBrackets": { in: ["nope"] },
        }),
      /references outport 'nope'/,
    );
  });

  it("rejects mistyped values", () => {
    const instance = makeComponent();
    assert.throws(
      () => applyPortMetadata(instance, { "noflo.control": "in" }),
      /must be an array/,
    );
    assert.throws(
      () => applyPortMetadata(instance, { "noflo.scoped": { in: "yes" } }),
      /must be booleans/,
    );
    assert.throws(
      () =>
        applyPortMetadata(instance, {
          "noflo.forwardBrackets": { framed: "out" },
        }),
      /must be arrays/,
    );
    assert.throws(
      () => applyPortMetadata(instance, { "noflo.control": [42] }),
      /must be port names/,
    );
  });

  it("rejects promoting an addressable inport to a gate", () => {
    const instance = new noflo.Component();
    instance.inPorts.add("addr", { datatype: "all", addressable: true });
    instance.inPorts.add("other", { datatype: "all" });
    instance.outPorts.add("out", { datatype: "all" });
    assert.throws(
      () => applyPortMetadata(instance, { "noflo.control": ["addr"] }),
      /the gate model does not support addressable ports/,
    );
  });

  it("is a no-op without noflo. metadata", () => {
    const instance = makeComponent();
    const before = JSON.stringify({
      control: Object.entries(instance.inPorts.ports).map(([name, port]) => [
        name,
        port.options.control,
      ]),
    });
    applyPortMetadata(instance, {});
    applyPortMetadata(instance, { assembly: { field: "x" } });
    const after = JSON.stringify({
      control: Object.entries(instance.inPorts.ports).map(([name, port]) => [
        name,
        port.options.control,
      ]),
    });
    assert.strictEqual(before, after, "untouched");
  });
});

describe("per-instance port behavior: the network wiring", () => {
  it("applies the overrides at network build and isolates them per instance", async () => {
    const graph = noflo.importFbpJson({
      processes: {
        gated: {
          component: "Knobbed",
          metadata: { "noflo.control": ["in"] },
        },
        stock: { component: "Knobbed" },
      },
    });
    const network = await noflo.createNetwork(graph, { delay: true });
    network.loader.registerComponent("", "Knobbed", makeComponent);
    await network.connect();
    assert.strictEqual(
      network.processes.gated.component.inPorts.ports.in.options.control,
      true,
      "the gated instance promotes",
    );
    assert.strictEqual(
      network.processes.gated.component.inPorts.ports.config.options.control,
      false,
      "the gated instance demotes",
    );
    assert.strictEqual(
      network.processes.stock.component.inPorts.ports.in.options.control,
      false,
      "the stock instance keeps the declaration",
    );
    assert.strictEqual(
      network.processes.stock.component.inPorts.ports.config.options.control,
      true,
      "the stock instance keeps the declaration",
    );
    await network.stop();
  });

  it("surfaces validation errors with the node id", async () => {
    const graph = noflo.importFbpJson({
      processes: {
        broken: {
          component: "Knobbed",
          metadata: { "noflo.control": ["nope"] },
        },
      },
    });
    const network = await noflo.createNetwork(graph, { delay: true });
    network.loader.registerComponent("", "Knobbed", makeComponent);
    await assert.rejects(
      () => network.connect(),
      /Node broken: noflo\.control names inport 'nope'/,
    );
  });
});
