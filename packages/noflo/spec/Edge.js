//     (c) 2021-2026 Henri Bergius

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import {
  DEFAULT_HIGH_WATER_MARK,
  Edge,
  resolveHighWaterMark,
} from "../src/lib/Edge.js";
import * as internalSocket from "../src/lib/InternalSocket.js";
import IP from "../src/lib/IP.js";
import * as noflo from "../src/lib/NoFlo.js";
import { listen } from "./utils/events.js";
import { nativeGraph } from "./utils/nativeGraph.js";

/** Await a couple of microtask/macrotask turns so stream machinery settles. */
const settle = (turns = 5) =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
    void turns;
  });

describe("high-water mark resolution", () => {
  it("edge metadata wins over component and runtime defaults", () => {
    assert.equal(resolveHighWaterMark({ highWaterMark: 3 }, 16, 32), 3);
  });
  it("component default wins over runtime default", () => {
    assert.equal(resolveHighWaterMark(undefined, 16, 32), 16);
    assert.equal(resolveHighWaterMark({}, 16, 32), 16);
  });
  it("runtime default applies when nothing more specific is set", () => {
    assert.equal(resolveHighWaterMark(undefined, undefined, 32), 32);
  });
  it("absent everywhere resolves to the bounded default", () => {
    assert.equal(
      resolveHighWaterMark(undefined, undefined, undefined),
      DEFAULT_HIGH_WATER_MARK,
    );
  });
  it("explicit null opts out of backpressure as unbounded", () => {
    assert.equal(resolveHighWaterMark({ highWaterMark: null }, 16, 32), null);
    assert.equal(resolveHighWaterMark(undefined, null, 32), null);
    assert.equal(resolveHighWaterMark(undefined, undefined, null), null);
    assert.equal(resolveHighWaterMark({}, null, null), null);
  });
  it("zero is a valid synchronous configuration", () => {
    assert.equal(resolveHighWaterMark({ highWaterMark: 0 }, 16, 32), 0);
  });
  it("invalid values throw with their source", () => {
    assert.throws(
      () => resolveHighWaterMark({ highWaterMark: -1 }),
      /edge metadata/,
    );
    assert.throws(
      () => resolveHighWaterMark(undefined, 2.5),
      /component default/,
    );
    assert.throws(
      () => resolveHighWaterMark(undefined, undefined, "big"),
      /runtime default/,
    );
  });
});

describe("Edge data transport", () => {
  it("delivers IPs in write order", async () => {
    const edge = new Edge();
    const received = [];
    edge.onDelivery((ip) => {
      received.push(ip);
    });
    await edge.write(new IP("data", 1));
    await edge.write(new IP("data", 2));
    await edge.write(new IP("data", 3));
    await settle();
    assert.deepEqual(
      received.map((ip) => ip.data),
      [1, 2, 3],
    );
  });

  it("bracket streams maintain integrity across the stream boundary", async () => {
    const edge = new Edge();
    const received = [];
    edge.onDelivery((ip) => {
      received.push(ip);
    });
    await edge.write(new IP("openBracket", "group"));
    await edge.write(new IP("data", 42));
    await edge.write(new IP("closeBracket", "group"));
    await settle();
    assert.deepEqual(
      received.map((ip) => ip.type),
      ["openBracket", "data", "closeBracket"],
    );
  });

  it("mismatched closeBracket rejects the write", async () => {
    const edge = new Edge();
    await assert.rejects(
      edge.write(new IP("closeBracket", "stray")),
      /closeBracket without a matching openBracket/,
    );
  });

  it("observe middleware runs before the IP enters the stream", async () => {
    const edge = new Edge();
    const order = [];
    const received = [];
    edge
      .observe((ip, next) => {
        order.push(`observe:${ip.data}`);
        next();
      })
      .onDelivery((ip) => {
        received.push(ip.data);
      });
    await edge.write(new IP("data", "payload"));
    await settle();
    assert.deepEqual(order, ["observe:payload"]);
    assert.deepEqual(received, ["payload"]);
  });

  it("multiple observers run in registration order", async () => {
    const edge = new Edge();
    const order = [];
    edge
      .observe((_ip, next) => {
        order.push("first");
        next();
      })
      .observe((_ip, next) => {
        order.push("second");
        next();
      })
      .onDelivery(() => {});
    await edge.write(new IP("data", 1));
    await settle();
    assert.deepEqual(order, ["first", "second"]);
  });

  it("unbounded edges never apply backpressure", async () => {
    const edge = new Edge();
    /** @type {Promise<void>[]} */
    let releaseConsumer;
    releaseConsumer = null;
    edge.onDelivery(
      () =>
        new Promise((resolve) => {
          // Slow consumer: never released during this test
          releaseConsumer = resolve;
        }),
    );
    await edge.write(new IP("data", 1));
    await edge.write(new IP("data", 2));
    await edge.write(new IP("data", 3));
    await settle();
    assert.ok(edge.desiredSize() > 0, "desiredSize stays positive");
    void releaseConsumer;
  });

  it("bounded edges backpressure against a slow consumer", async () => {
    const edge = new Edge({ highWaterMark: 1 });
    /** @type {(() => void)[]} */
    const releases = [];
    edge.onDelivery(
      () =>
        new Promise((resolve) => {
          releases.push(resolve);
        }),
    );
    // First write is deliverable within the HWM
    await edge.write(new IP("data", 1));
    const second = edge.write(new IP("data", 2));
    let settled = false;
    second.then(() => {
      settled = true;
    });
    await settle();
    assert.equal(settled, false, "second write waits for buffer space");
    assert.ok(edge.desiredSize() <= 0, "desiredSize signals backpressure");
    // Release the first delivery
    releases[0]();
    await settle();
    // Release the second delivery
    releases[1]();
    await second;
    assert.equal(settled, true);
  });

  it("highWaterMark zero is synchronous: writes resolve only once consumed", async () => {
    const edge = new Edge({ highWaterMark: 0 });
    /** @type {() => void} */
    let release = () => {};
    edge.onDelivery(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = edge.write(new IP("data", 1));
    let settled = false;
    first.then(() => {
      settled = true;
    });
    await settle();
    assert.equal(settled, false, "write waits for consumption");
    release();
    await first;
    assert.equal(settled, true);
  });

  it("escalates delivery-handler throws through the error handler on bounded edges", async () => {
    const edge = new Edge({ highWaterMark: 1 });
    const escalated = [];
    edge.onErrorDelivery((error) => escalated.push(error));
    let delivered = 0;
    edge.onDelivery((ip) => {
      delivered += 1;
      if (ip.data === "boom") {
        throw new Error("listener exploded");
      }
    });
    await edge.write(new IP("data", "ok"));
    await edge.write(new IP("data", "boom"));
    await new Promise((resolve) => setImmediate(resolve));
    // Both writes were delivered; the second's throw was escalated
    assert.equal(delivered, 2);
    assert.equal(escalated.length, 1);
    assert.match(escalated[0].message, /listener exploded/);
    // Bookkeeping stayed consistent: the edge still admits further writes
    await edge.write(new IP("data", "after"));
    assert.equal(delivered, 3);
  });

  it("records delivery-handler throws as lastError without an error handler", async () => {
    const edge = new Edge({ highWaterMark: 1 });
    edge.onDelivery(() => {
      throw new Error("no handler for this");
    });
    await edge.write(new IP("data", "x"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(edge.lastError.message, /no handler for this/);
  });

  it("close ends the stream for writing", async () => {
    const edge = new Edge();
    edge.onDelivery(() => {});
    await edge.write(new IP("data", 1));
    await edge.close();
    await assert.rejects(edge.write(new IP("data", 2)));
  });
});

describe("InternalSocket delegating transport to Edge", () => {
  it("delivers posted IPs synchronously when the edge is unbounded", () => {
    const socket = internalSocket.createSocket({}, { highWaterMark: null });
    const received = [];
    listen(socket, "ip", (ip) => {
      received.push(ip);
    });
    socket.post(new IP("data", "first"));
    socket.post(new IP("data", "second"));
    // No awaiting: unbounded edge takes the synchronous fast path
    assert.deepEqual(
      received.map((ip) => ip.data),
      ["first", "second"],
    );
  });

  it("delivers posted IPs one microtask late on the bounded default", async () => {
    const socket = internalSocket.createSocket();
    assert.equal(socket.edge.highWaterMark, DEFAULT_HIGH_WATER_MARK);
    const received = [];
    listen(socket, "ip", (ip) => {
      received.push(ip);
    });
    socket.post(new IP("data", "first"));
    // Not synchronous like unbounded edges: delivery is deferred
    assert.deepEqual(received, []);
    await socket.lastWrite;
    await Promise.resolve();
    assert.deepEqual(
      received.map((ip) => ip.data),
      ["first"],
    );
  });

  it("keeps the connection open after a posted packet on the bounded default", async () => {
    const socket = internalSocket.createSocket();
    const events = [];
    listen(socket, "ip", () => {
      events.push("ip");
    });
    listen(socket, "connect", () => {
      events.push("connect");
    });
    listen(socket, "disconnect", () => {
      events.push("disconnect");
    });
    // Sending no longer disconnects: ending a transmission is the
    // sender's explicit decision (work document #40 update #5)
    const write = socket.post(new IP("data", "first"));
    // Nothing delivered synchronously on a bounded edge
    assert.deepEqual(events, ["connect"]);
    await write;
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events, ["connect", "ip"]);
    assert.equal(socket.isConnected(), true, "still connected after the send");
    // The explicit sender-terminal disconnect drains first
    const drained = socket.disconnect();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events, ["connect", "ip", "disconnect"]);
    await drained;
  });

  it("emits a same-tick explicit disconnect after delivery on the bounded default", async () => {
    const socket = internalSocket.createSocket();
    const events = [];
    listen(socket, "ip", () => {
      events.push("ip");
    });
    listen(socket, "disconnect", () => {
      events.push("disconnect");
    });
    socket.connect();
    socket.post(new IP("data", "first"));
    socket.disconnect();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events, ["ip", "disconnect"]);
  });

  it("emits disconnect synchronously after data on unbounded edges", () => {
    const socket = internalSocket.createSocket({}, { highWaterMark: null });
    const events = [];
    listen(socket, "ip", () => {
      events.push("ip");
    });
    listen(socket, "disconnect", () => {
      events.push("disconnect");
    });
    socket.post(new IP("data", "first"));
    // No awaiting: unbounded edges keep the 1.x synchronous ordering
    assert.deepEqual(events, ["ip"]);
    socket.disconnect();
    assert.deepEqual(events, ["ip", "disconnect"]);
  });

  it("emits only ip events for bracketed packets", async () => {
    const socket = internalSocket.createSocket({}, { highWaterMark: null });
    const events = [];
    listen(socket, "ip", (ip) => {
      events.push(`ip:${ip.type}`);
    });
    socket.post(new IP("openBracket", "g"));
    socket.post(new IP("data", 42));
    socket.post(new IP("closeBracket", "g"));
    assert.deepEqual(events, ["ip:openBracket", "ip:data", "ip:closeBracket"]);
  });

  it("applies the edge metadata high-water mark", async () => {
    const socket = internalSocket.createSocket({ highWaterMark: 1 });
    assert.equal(socket.edge.highWaterMark, 1);
    const received = [];
    listen(socket, "ip", (ip) => {
      received.push(ip);
    });
    socket.post(new IP("data", 1));
    socket.post(new IP("data", 2));
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    assert.deepEqual(
      received.map((ip) => ip.data),
      [1, 2],
    );
    // With no consumer pacing (fire-and-forget legacy delivery), capacity
    // returns once both packets have been delivered
    assert.equal(socket.edge.desiredSize(), 1);
  });
});

describe("hierarchical high-water mark wiring through networks", () => {
  let loader;
  before(async () => {
    loader = new noflo.ComponentLoader({});
    const bounded = () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.outPorts.add("out", { datatype: "all", highWaterMark: 4 });
      c.process((input, output) => {
        output.sendDone({ out: input.getData("in") });
      });
      return c;
    };
    const plain = () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.outPorts.add("out", { datatype: "all" });
      c.process((input, output) => {
        output.sendDone({ out: input.getData("in") });
      });
      return c;
    };
    loader.registerComponent("hwm", "Bounded", bounded);
    loader.registerComponent("hwm", "Plain", plain);
  });

  it("edge metadata wins over the component port default", async () => {
    const g = nativeGraph();
    g.addNode("A", "hwm/Bounded");
    g.addNode("B", "hwm/Plain");
    g.addEdge("A", "out", "B", "in", { highWaterMark: 2 });
    const nw = await noflo.createNetwork(g, {
      delay: true,
      componentLoader: loader,
    });
    await nw.connect();
    const socket = nw.connections[0];
    assert.equal(socket.edge.highWaterMark, 2);
  });

  it("the component port default applies without edge metadata", async () => {
    const g = nativeGraph();
    g.addNode("A", "hwm/Bounded");
    g.addNode("B", "hwm/Plain");
    g.addEdge("A", "out", "B", "in");
    const nw = await noflo.createNetwork(g, {
      delay: true,
      componentLoader: loader,
    });
    await nw.connect();
    const socket = nw.connections[0];
    assert.equal(socket.edge.highWaterMark, 4);
  });

  it("the network runtime default applies with neither set", async () => {
    const g = nativeGraph();
    g.addNode("A", "hwm/Plain");
    g.addNode("B", "hwm/Plain");
    g.addEdge("A", "out", "B", "in");
    const nw = await noflo.createNetwork(g, {
      delay: true,
      componentLoader: loader,
      highWaterMark: 8,
    });
    await nw.connect();
    const socket = nw.connections[0];
    assert.equal(socket.edge.highWaterMark, 8);
  });

  it("absent everywhere resolves to the bounded default", async () => {
    const g = nativeGraph();
    g.addNode("A", "hwm/Plain");
    g.addNode("B", "hwm/Plain");
    g.addEdge("A", "out", "B", "in");
    const nw = await noflo.createNetwork(g, {
      delay: true,
      componentLoader: loader,
    });
    await nw.connect();
    const socket = nw.connections[0];
    assert.equal(socket.edge.highWaterMark, DEFAULT_HIGH_WATER_MARK);
  });
  it("network-level null opts out as unbounded", async () => {
    const g = nativeGraph();
    g.addNode("A", "hwm/Plain");
    g.addNode("B", "hwm/Plain");
    g.addEdge("A", "out", "B", "in");
    const nw = await noflo.createNetwork(g, {
      delay: true,
      componentLoader: loader,
      highWaterMark: null,
    });
    await nw.connect();
    const socket = nw.connections[0];
    assert.equal(socket.edge.highWaterMark, null);
  });
});

describe("network-level edge observation", () => {
  let observeLoader;
  before(async () => {
    observeLoader = new noflo.ComponentLoader({});
    const repeat = () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.outPorts.add("out", { datatype: "all" });
      c.process((input, output) => {
        output.sendDone({ out: input.getData("in") });
      });
      return c;
    };
    observeLoader.registerComponent("obs", "Repeat", repeat);
  });

  it("sees every IP on every edge before delivery, with socket context", async () => {
    const g = nativeGraph();
    g.addNode("A", "obs/Repeat");
    g.addNode("B", "obs/Repeat");
    g.addNode("C", "obs/Repeat");
    g.addEdge("A", "out", "B", "in");
    g.addEdge("B", "out", "C", "in");
    const nw = await noflo.createNetwork(g, {
      delay: true,
      componentLoader: observeLoader,
    });
    await nw.connect();
    /** @type {{ from: string, data: any }[]} */
    const seen = [];
    nw.observe((ip, socket, next) => {
      seen.push({
        from: socket.from ? socket.from.process.id : null,
        data: ip.data,
      });
      next();
    });
    await nw.addInitial({
      from: { data: "hello" },
      to: { node: "A", port: "in" },
    });
    await nw.start();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    // The packet traverses the IIP edge (no source process) and both
    // component edges
    assert.deepEqual(
      seen.map((entry) => entry.from),
      [null, "A", "B"],
    );
    assert.ok(seen.every((entry) => entry.data === "hello"));
  });

  it("observers registered before wiring still apply to later edges", async () => {
    const g = nativeGraph();
    g.addNode("A", "obs/Repeat");
    g.addNode("B", "obs/Repeat");
    const nw = await noflo.createNetwork(g, {
      delay: true,
      componentLoader: observeLoader,
    });
    let observed = 0;
    nw.observe((_ip, _socket, next) => {
      observed += 1;
      next();
    });
    // Load processes, then wire an edge after observer registration
    await nw.connect();
    await nw.addEdge({
      from: { node: "A", port: "out" },
      to: { node: "B", port: "in" },
    });
    await nw.addInitial({ from: { data: 42 }, to: { node: "A", port: "in" } });
    await nw.start();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    // Both the IIP edge and the component edge observe the packet
    assert.equal(observed, 2);
  });
});
