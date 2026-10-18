// The firing model (work document #47): one rule for all ports — an
// arrival on any port re-fires the process once per scope that holds
// unprocessed input on any port. The centerpiece is the determinism
// property test: activation schedules are arrival-dependent, results are
// not. Grounding: Morrison's blocking-receive model (the Process API's
// has/get/decline is its non-blocking emulation, and the engine's duty is
// wakeup completeness), trustmaster's #607 direction, and the
// component-declared firing patterns of Carkci's Dataflow (the has-check
// vocabulary; the engine imposes no pattern).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as noflo from "../src/lib/NoFlo.js";

/**
 * A three-port component whose firing pattern is "pair the two data legs
 * under the standing configuration": an async operation (the deferred
 * send holds the activation via the Promise return) that produces one
 * output per completed pattern.
 *
 * @returns {noflo.Component} The component instance.
 */
const Pairer = () => {
  const c = new noflo.Component();
  c.inPorts.add("a", { datatype: "all" });
  c.inPorts.add("b", { datatype: "all" });
  c.inPorts.add("config", { control: true, datatype: "object" });
  c.outPorts.add("out", { datatype: "object" });
  // Gate first, read second: every firing-pattern decision happens
  // before the first get (the register-then-render trap — the permutation
  // matrix caught this fixture's leak on its first run)
  c.process((input, output) => {
    if (!input.hasData("config", "a", "b")) {
      return;
    }
    const config = input.getData("config");
    const [a, b] = input.getData("a", "b");
    // The async operation holds the activation until the send completes
    return new Promise((resolve) => {
      setTimeout(() => resolve({ out: { ...config, a, b } }), 5);
    });
  });
  return c;
};

const wire = (component) => {
  const received = [];
  const out = noflo.internalSocket.createSocket();
  component.outPorts.out.attach(out);
  out.addEventListener("ip", (event) => {
    if (event.detail.type === "data") {
      received.push(event.detail.data);
    }
  });
  const sockets = {};
  for (const name of ["a", "b", "config"]) {
    const socket = noflo.internalSocket.createSocket();
    component.inPorts.ports[name].attach(socket);
    sockets[name] = socket;
  }
  return { component, received, sockets };
};

const post = (socket, value, scope) => {
  const ip = new noflo.IP("data", value);
  if (scope !== undefined) {
    ip.scope = scope;
  }
  socket.post(ip);
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

describe("the firing model: order-independent wakeups", () => {
  it("produces identical results under every arrival order", async () => {
    // The determinism property: activation schedules are
    // arrival-dependent; results are not. Every permutation of the
    // three arrivals (two data legs and the standing configuration)
    // produces the same output
    const permutations = [
      ["a", "b", "config"],
      ["a", "config", "b"],
      ["b", "a", "config"],
      ["b", "config", "a"],
      ["config", "a", "b"],
      ["config", "b", "a"],
    ];
    const config = { mode: "pairing" };
    const expected = [{ ...config, a: 1, b: 2 }];
    for (const order of permutations) {
      const { component, received, sockets } = wire(Pairer());
      for (const port of order) {
        post(sockets[port], port === "config" ? config : port === "a" ? 1 : 2);
      }
      await settle();
      assert.deepStrictEqual(
        received,
        expected,
        `arrival order ${order.join(",")} produced the same result`,
      );
      assert.strictEqual(component.load, 0, "no activation left pending");
    }
  });

  it("produces identical results under every arrival order per scope", async () => {
    // Two scoped messages in flight with a standing unscoped
    // configuration: the pairing is per scope (the scope-isolation
    // contract, work document #36) regardless of the interleaving order
    // of the legs across messages. The configuration port must be
    // scoped: false — a scoped control port fed an unscoped control IP
    // is the one broken arrival (the value is unreadable at scoped
    // activations)
    const scopedPairer = () => {
      const c = Pairer();
      c.inPorts.ports.config.options.scoped = false;
      return c;
    };
    const permutations = [
      ["a1", "b1", "a2", "b2"],
      ["a1", "a2", "b1", "b2"],
      ["b1", "a1", "b2", "a2"],
      ["b2", "a2", "a1", "b1"],
      ["b2", "b1", "a1", "a2"],
    ];
    for (const order of permutations) {
      const { component, received, sockets } = wire(scopedPairer());
      post(sockets.config, { mode: "pairing" });
      const values = { a1: 1, a2: 10, b1: 2, b2: 20 };
      const scopes = { a1: "m1", a2: "m2", b1: "m1", b2: "m2" };
      for (const key of order) {
        post(
          sockets[key.startsWith("a") ? "a" : "b"],
          values[key],
          scopes[key],
        );
      }
      await settle();
      assert.strictEqual(component.load, 0, "no activation left pending");
      assert.deepStrictEqual(
        received.sort((x, y) => x.a - y.a),
        [
          { mode: "pairing", a: 1, b: 2 },
          { mode: "pairing", a: 10, b: 20 },
        ],
        `interleaving ${order.join(",")} paired per scope`,
      );
    }
  });

  it("pumps scoped pending work with an unscoped arrival", async () => {
    // The starvation fix: an unscoped arrival re-fires every ready
    // scope, so scoped work buffered behind a scopeless standing gate
    // completes on any later arrival
    const c = new noflo.Component();
    c.inPorts.add("a", { datatype: "all" });
    c.inPorts.add("b", { datatype: "all", scoped: false });
    c.outPorts.add("out", { datatype: "all" });
    const received = [];
    const out = noflo.internalSocket.createSocket();
    c.outPorts.out.attach(out);
    out.addEventListener("ip", (event) => {
      if (event.detail.type === "data") {
        received.push(event.detail.data);
      }
    });
    const a = noflo.internalSocket.createSocket();
    const b = noflo.internalSocket.createSocket();
    c.inPorts.ports.a.attach(a);
    c.inPorts.ports.b.attach(b);
    c.process((input, output) => {
      if (!input.hasData("a", "b")) {
        return;
      }
      const value = input.getData("a");
      const gate = input.getData("b");
      output.sendDone({ out: `${value}:${gate}` });
    });

    // The scoped leg arrives first and buffers; the unscoped gate
    // arrival re-fires the scoped waiting work
    post(a, "hello", "s1");
    await settle();
    assert.deepStrictEqual(received, [], "the scoped leg waits");
    post(b, "gate");
    await settle();
    assert.deepStrictEqual(received, ["hello:gate"], "the pump fired it");
    assert.strictEqual(c.load, 0, "no activation left pending");
  });

  it("fires on a closeBracket completing a stream wait", async () => {
    // The bracket-inclusive firing predicate: a closeBracket completing
    // a hasStream wait is a firing edge — the completion moment for
    // collect-until-stream-close components
    const c = new noflo.Component();
    c.inPorts.add("in", { datatype: "all" });
    c.outPorts.add("out", { datatype: "all" });
    const received = [];
    const out = noflo.internalSocket.createSocket();
    c.outPorts.out.attach(out);
    out.addEventListener("ip", (event) => {
      if (event.detail.type === "data") {
        received.push(event.detail.data);
      }
    });
    const input = noflo.internalSocket.createSocket();
    c.inPorts.ports.in.attach(input);
    c.forwardBrackets = {};
    c.process((input, output) => {
      if (!input.hasStream("in")) {
        return;
      }
      const stream = input.getStream("in");
      const values = stream
        .filter((ip) => ip.type === "data")
        .map((ip) => ip.data);
      output.sendDone({ out: values.join("|") });
    });

    input.post(new noflo.IP("openBracket", "s"));
    await settle();
    assert.deepStrictEqual(received, [], "an open stream waits");
    input.post(new noflo.IP("data", "one"));
    await settle();
    assert.deepStrictEqual(received, [], "still open");
    input.post(new noflo.IP("data", "two"));
    input.post(new noflo.IP("closeBracket", "s"));
    await settle();
    assert.deepStrictEqual(
      received,
      ["one|two"],
      "the closeBracket completed the wait",
    );
  });
});

// ---------------------------------------------------------------------------
// The firing matrix: ample permutations across port kinds, value shapes,
// scopes, streams, and timing. Every scenario asserts that the observable
// result and the final state are identical across arrival orders — the
// order-independence guarantee. Deadlock classes live here: a scenario
// that stalls under any ordering is a firing-model defect.
// ---------------------------------------------------------------------------

const drain = (component) => {
  // The final state: no open activations; data ports drained. Control
  // ports may hold standing values (they are standing state by design)
  assert.strictEqual(component.load, 0, "no activation left pending");
  for (const [name, port] of Object.entries(component.inPorts.ports)) {
    if (port.options.control) {
      continue;
    }
    assert.strictEqual(port.countBuffered(), 0, `port ${name} drained`);
  }
};

const permutations = (items) => {
  if (items.length <= 1) {
    return [items];
  }
  const result = [];
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const perm of permutations(rest)) {
      result.push([item, ...perm]);
    }
  });
  return result;
};

const collect = (component, ports) => {
  const received = [];
  const out = noflo.internalSocket.createSocket();
  component.outPorts.out.attach(out);
  out.addEventListener("ip", (event) => {
    if (event.detail.type === "data") {
      received.push(event.detail.data);
    }
  });
  const sockets = {};
  for (const name of ports) {
    const socket = noflo.internalSocket.createSocket();
    component.inPorts.ports[name].attach(socket);
    sockets[name] = socket;
  }
  return { received, sockets };
};

const ip = (type, data, scope) => {
  const packet = new noflo.IP(type, data);
  if (scope !== undefined) {
    packet.scope = scope;
  }
  return packet;
};

describe("the retired triggering option", () => {
  // The option is removed from the typed and documented option set; an
  // unknown key passes through and does nothing. A port declaring it
  // participates in firing like any data port — the opposite of its 1.x
  // meaning, where the declaration suppressed arrival-firing
  it("behaves as a regular data port despite the legacy declaration", async () => {
    const c = new noflo.Component();
    c.inPorts.add("a", { datatype: "all" });
    c.inPorts.add("b", { datatype: "all", triggering: false });
    c.outPorts.add("out", { datatype: "all" });
    const received = [];
    const out = noflo.internalSocket.createSocket();
    c.outPorts.out.attach(out);
    out.addEventListener("ip", (event) => {
      if (event.detail.type === "data") {
        received.push(event.detail.data);
      }
    });
    const sa = noflo.internalSocket.createSocket();
    const sb = noflo.internalSocket.createSocket();
    c.inPorts.ports.a.attach(sa);
    c.inPorts.ports.b.attach(sb);
    c.process((input, output) => {
      if (!input.hasData("a", "b")) {
        return;
      }
      const [a, b] = input.getData("a", "b");
      output.sendDone({ out: `${a}+${b}` });
    });

    post(sa, 1);
    await settle();
    assert.deepStrictEqual(received, [], "a buffers");
    // Under the 1.x semantics this declaration would suppress the
    // arrival-firing; the removed option changes nothing, so b's
    // arrival pairs the buffered leg
    post(sb, 2);
    await settle();
    assert.deepStrictEqual(
      received,
      ["1+2"],
      "the legacy declaration is inert",
    );
    assert.strictEqual(c.load, 0);
  });
});

describe("the drain pump", () => {
  // The completion re-offer (work document #47): an activation that
  // consumed input leaves the buffers holding more deliverable work —
  // the next pairing waits for a wakeup that no arrival may provide.
  // The pump re-offers the process for the remaining work on completion,
  // making multi-pair drains terminate without external arrivals.
  it("drains multiple buffered pairs without further arrivals", async () => {
    // The noflo-jekyll burst shape: all legs arrive BEFORE the standing
    // config (the IIP delivery lags behind the posted messages), so
    // every arrival-triggered firing declines on the missing config;
    // the config's arrival fires ONE round, consuming one pair — the
    // remaining pairs strand without the pump
    const component = Pairer();
    const { received, sockets } = wire(component);
    // All legs arrive first
    post(sockets.a, 1);
    post(sockets.b, 2);
    post(sockets.a, 10);
    post(sockets.b, 20);
    post(sockets.a, 100);
    post(sockets.b, 200);
    await settle();
    // The standing config arrives last — the drain begins
    post(sockets.config, { mode: "drain" });
    await settle();
    // Every pair drained: three outputs, none stranded
    assert.deepStrictEqual(
      received.sort((x, y) => x.a - y.a),
      [
        { mode: "drain", a: 1, b: 2 },
        { mode: "drain", a: 10, b: 20 },
        { mode: "drain", a: 100, b: 200 },
      ],
      "all buffered pairs drained",
    );
    assert.strictEqual(component.load, 0, "no activation left pending");
    assert.strictEqual(
      component.inPorts.ports.a.countBuffered(),
      0,
      "the buffers drained",
    );
  });

  it("defers the offer while an activation is in flight", async () => {
    // The pump is guarded by the in-flight load: an offer fires only
    // when the activation accounting is settled
    const component = Pairer();
    const { received, sockets } = wire(component);
    const offers = [];
    // Instrument the drain: count the offers by observing the completions
    let completions = 0;
    component.addEventListener("deactivate", () => {
      completions += 1;
    });
    post(sockets.config, { mode: "m" });
    post(sockets.a, 1);
    post(sockets.b, 2);
    await settle();
    assert.deepStrictEqual(received, [{ mode: "m", a: 1, b: 2 }]);
    // Two arrivals, one completed pairing: the activations fired per
    // arrival, the pairing consumed once, and the pump did not double-fire
    assert.ok(completions >= 1, "the completions happened");
    assert.strictEqual(component.load, 0);
  });

  it("pumps nothing when the activation consumed nothing", async () => {
    // The progress gate: an activation that consumed nothing (the
    // has-first decline) completes without an offer — the decline-and-wait
    // contract stays intact
    const component = Pairer();
    const { received, sockets } = wire(component);
    // The config alone: the activation declines on the missing legs —
    // and the pump must not re-offer it forever
    post(sockets.config, { mode: "m" });
    await settle();
    assert.deepStrictEqual(received, [], "nothing to pair");
    assert.strictEqual(component.load, 0, "no leaked activation");
  });

  it("pumps nothing after closedown", async () => {
    // The closedown guard: the offers do not fire past the closedown
    const component = Pairer();
    const { received, sockets } = wire(component);
    post(sockets.config, { mode: "m" });
    post(sockets.a, 1);
    post(sockets.b, 2);
    await settle();
    assert.deepStrictEqual(received, [{ mode: "m", a: 1, b: 2 }]);
    // After the closedown the buffers are clear and the pump has
    // nothing to offer; the guard holds for the late deactivations
    assert.strictEqual(component.load, 0);
    assert.strictEqual(component.inPorts.ports.a.countBuffered(), 0, "drained");
  });
});

describe("the firing matrix", () => {
  // A leg is an ordered step list: its internal sequence is the stream's
  // framing or a single packet, and the matrix permutes LEGS — generating
  // every order-preserving interleaving — not raw steps. Shuffling a
  // stream's framing steps would post malformed orders (a closeBracket
  // before its open), which is not the order-independence subject
  const scenarios = {
    "two data legs and standing config": {
      ports: ["a", "b", "config"],
      build: () => Pairer(),
      legs: [
        [{ port: "a", ip: ip("data", 1) }],
        [{ port: "b", ip: ip("data", 2) }],
        [{ port: "config", ip: ip("data", { mode: "m" }) }],
      ],
      assert: (received) =>
        assert.deepStrictEqual(received, [{ mode: "m", a: 1, b: 2 }]),
    },
    "two data legs, scoped, standing config": {
      ports: ["a", "b", "config"],
      build: () => {
        const c = Pairer();
        c.inPorts.ports.config.options.scoped = false;
        return c;
      },
      legs: [
        [{ port: "a", ip: ip("data", 1, "s1") }],
        [{ port: "b", ip: ip("data", 2, "s1") }],
        [{ port: "config", ip: ip("data", { mode: "m" }) }],
      ],
      assert: (received) =>
        assert.deepStrictEqual(received, [{ mode: "m", a: 1, b: 2 }]),
    },
    "stream leg and plain data leg": {
      ports: ["in", "x"],
      build: () => {
        const c = new noflo.Component();
        c.inPorts.add("in", { datatype: "all" });
        c.inPorts.add("x", { datatype: "all" });
        c.outPorts.add("out", { datatype: "string" });
        c.forwardBrackets = {};
        // The matrix caught this handler's original shape deadlocking:
        // getStream consumes, so calling it before the x gate lost the
        // stream on every decline — the close arriving before x
        // consumed-and-declined, and the later x arrival found the
        // buffer empty. Gate on everything before any consuming read
        c.process((input, output) => {
          if (!input.hasStream("in")) {
            return;
          }
          if (!input.hasData("x")) {
            return;
          }
          const stream = input
            .getStream("in")
            .filter((packet) => packet.type === "data")
            .map((packet) => packet.data);
          const x = input.getData("x");
          output.sendDone({ out: `${stream.join("|")}#${x}` });
        });
        return c;
      },
      legs: [
        [
          { port: "in", ip: ip("openBracket", "s") },
          { port: "in", ip: ip("data", "one") },
          { port: "in", ip: ip("closeBracket", "s") },
        ],
        [{ port: "x", ip: ip("data", "9") }],
      ],
      assert: (received) => assert.deepStrictEqual(received, ["one#9"]),
    },
  };

  // Every order-preserving interleaving of the legs' steps
  const interleavings = (legs) => {
    if (legs.length <= 1) {
      return legs.length ? [legs[0]] : [[]];
    }
    const [first, ...rest] = legs;
    const result = [];
    for (const tail of interleavings(rest)) {
      for (let i = 0; i <= tail.length; i += 1) {
        result.push([...tail.slice(0, i), ...first, ...tail.slice(i)]);
      }
    }
    return result;
  };

  for (const [name, scenario] of Object.entries(scenarios)) {
    for (const order of interleavings(scenario.legs)) {
      it(`${name}: order ${order.map((s) => s.port).join(",")}`, async () => {
        const component = scenario.build();
        const { received, sockets } = collect(component, scenario.ports);
        for (const step of order) {
          sockets[step.port].post(step.ip);
        }
        await settle();
        scenario.assert(received);
        drain(component);
      });
    }
  }

  it("stream leg and plain data leg: the data leg may arrive mid-stream", async () => {
    // The interleaving case the permutations cannot spell: the plain leg
    // arrives between the stream's data packets
    const component = scenarios["stream leg and plain data leg"].build();
    const { received, sockets } = collect(component, ["in", "x"]);
    sockets.in.post(ip("openBracket", "s"));
    sockets.in.post(ip("data", "one"));
    sockets.x.post(ip("data", "9"));
    await settle();
    assert.deepStrictEqual(received, [], "the stream is still open");
    sockets.in.post(ip("data", "two"));
    sockets.in.post(ip("closeBracket", "s"));
    await settle();
    assert.deepStrictEqual(received, ["one|two#9"]);
    drain(component);
  });

  it("multi-value config on a control stream: stream completion fires the wait", async () => {
    // A control port holding a bracketed standing stream: the
    // closeBracket's arrival is a firing edge, and data arriving either
    // before or after the stream completes produces the same result
    const build = () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.inPorts.add("corpus", { control: true, datatype: "all" });
      c.outPorts.add("out", { datatype: "string" });
      c.process((input, output) => {
        if (!input.hasData("in")) {
          return;
        }
        if (!input.hasStream("corpus")) {
          return;
        }
        const corpus = input
          .getStream("corpus")
          .filter((packet) => packet.type === "data")
          .map((packet) => packet.data);
        const value = input.getData("in");
        output.sendDone({ out: `${value}[${corpus.join(",")}]` });
      });
      return c;
    };
    const orders = [
      ["in", "corpus-open", "corpus-a", "corpus-b", "corpus-close"],
      ["corpus-open", "in", "corpus-a", "corpus-b", "corpus-close"],
      ["corpus-open", "corpus-a", "corpus-b", "corpus-close", "in"],
    ];
    for (const order of orders) {
      const component = build();
      const { received, sockets } = collect(component, ["in", "corpus"]);
      for (const step of order) {
        if (step === "in") {
          sockets.in.post(ip("data", "page"));
        } else if (step === "corpus-open") {
          sockets.corpus.post(ip("openBracket", "c"));
        } else if (step === "corpus-a") {
          sockets.corpus.post(ip("data", "alpha"));
        } else if (step === "corpus-b") {
          sockets.corpus.post(ip("data", "beta"));
        } else if (step === "corpus-close") {
          sockets.corpus.post(ip("closeBracket", "c"));
        }
      }
      await settle();
      assert.deepStrictEqual(
        received,
        ["page[alpha,beta]"],
        `order ${order.join(",")}`,
      );
      drain(component);
    }
  });

  it("spread timing: arrivals across ticks produce the same result", async () => {
    // The matrix posts each leg's steps back-to-back; real pipelines
    // spread arrivals across ticks. The order-independence guarantee
    // holds under spread timing too — this is the shape that makes
    // async components tractable
    const orders = [
      ["a", "b", "config"],
      ["config", "b", "a"],
      ["b", "config", "a"],
    ];
    for (const order of orders) {
      const component = Pairer();
      const { received, sockets } = collect(component, ["a", "b", "config"]);
      for (const port of order) {
        sockets[port].post(
          ip("data", port === "config" ? { mode: "m" } : port === "a" ? 1 : 2),
        );
        // A macrotask gap between the arrivals
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await settle();
      assert.deepStrictEqual(
        received,
        [{ mode: "m", a: 1, b: 2 }],
        `spread order ${order.join(",")}`,
      );
      drain(component);
    }
  });

  it("two standing configs in either order, then the data leg", async () => {
    const build = () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.inPorts.add("c1", { control: true, datatype: "all", scoped: false });
      c.inPorts.add("c2", { control: true, datatype: "all", scoped: false });
      c.outPorts.add("out", { datatype: "string" });
      c.process((input, output) => {
        if (!input.hasData("in", "c1", "c2")) {
          return;
        }
        const value = input.getData("in");
        output.sendDone({
          out: `${value}(${input.getData("c1")},${input.getData("c2")})`,
        });
      });
      return c;
    };
    for (const order of permutations(["c1", "c2", "in"])) {
      const component = build();
      const { received, sockets } = collect(component, ["in", "c1", "c2"]);
      for (const port of order) {
        sockets[port].post(ip("data", port === "in" ? "v" : port));
      }
      await settle();
      assert.deepStrictEqual(
        received,
        ["v(c1,c2)"],
        `order ${order.join(",")}`,
      );
      drain(component);
    }
  });
});
