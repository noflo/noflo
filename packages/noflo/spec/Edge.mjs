import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Edge, resolveHighWaterMark } from "../src/lib/Edge.js";
import * as internalSocket from "../src/lib/InternalSocket.js";
import IP from "../src/lib/IP.js";
import * as noflo from "../src/lib/NoFlo.js";

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
  it("absent everywhere means unbounded (1.x behavior, TODO: 2.0 default)", () => {
    assert.equal(resolveHighWaterMark(undefined, undefined, undefined), null);
    assert.equal(resolveHighWaterMark({}, null, null), null);
  });
  it("explicit null at a higher level falls through to lower levels", () => {
    // null is an explicit unbounded choice, not a fall-through marker
    assert.equal(resolveHighWaterMark({ highWaterMark: null }, 16, 32), 16);
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

  it("close ends the stream for writing", async () => {
    const edge = new Edge();
    edge.onDelivery(() => {});
    await edge.write(new IP("data", 1));
    await edge.close();
    await assert.rejects(edge.write(new IP("data", 2)));
  });
});

describe("InternalSocket delegating transport to Edge", () => {
  it("delivers posted IPs synchronously by default (1.x semantics)", () => {
    const socket = internalSocket.createSocket();
    const received = [];
    socket.on("ip", (ip) => {
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

  it("emits derived legacy events alongside ip events", () => {
    const socket = internalSocket.createSocket();
    const events = [];
    socket.on("ip", (ip) => {
      events.push(`ip:${ip.type}`);
    });
    socket.on("data", (data) => {
      events.push(`data:${data}`);
    });
    socket.on("begingroup", (group) => {
      events.push(`begingroup:${group}`);
    });
    socket.post(new IP("openBracket", "g"));
    socket.post(new IP("data", 42));
    socket.post(new IP("closeBracket", "g"));
    assert.deepEqual(events, [
      "ip:openBracket",
      "begingroup:g",
      "ip:data",
      "data:42",
      "ip:closeBracket",
    ]);
  });

  it("applies the edge metadata high-water mark", async () => {
    const socket = internalSocket.createSocket({ highWaterMark: 1 });
    assert.equal(socket.edge.highWaterMark, 1);
    const received = [];
    socket.on("ip", (ip) => {
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
    loader = new noflo.ComponentLoader(process.cwd());
    await loader.listComponents();
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
    const g = new noflo.Graph();
    g.addNode("A", "hwm/Bounded");
    g.addNode("B", "hwm/Plain");
    g.addEdge("A", "out", "B", "in", { highWaterMark: 2 });
    const nw = await noflo.createNetwork(g, {
      delay: true,
      subscribeGraph: false,
      componentLoader: loader,
    });
    await nw.connect();
    const socket = nw.connections[0];
    assert.equal(socket.edge.highWaterMark, 2);
  });

  it("the component port default applies without edge metadata", async () => {
    const g = new noflo.Graph();
    g.addNode("A", "hwm/Bounded");
    g.addNode("B", "hwm/Plain");
    g.addEdge("A", "out", "B", "in");
    const nw = await noflo.createNetwork(g, {
      delay: true,
      subscribeGraph: false,
      componentLoader: loader,
    });
    await nw.connect();
    const socket = nw.connections[0];
    assert.equal(socket.edge.highWaterMark, 4);
  });

  it("the network runtime default applies with neither set", async () => {
    const g = new noflo.Graph();
    g.addNode("A", "hwm/Plain");
    g.addNode("B", "hwm/Plain");
    g.addEdge("A", "out", "B", "in");
    const nw = await noflo.createNetwork(g, {
      delay: true,
      subscribeGraph: false,
      componentLoader: loader,
      highWaterMark: 8,
    });
    await nw.connect();
    const socket = nw.connections[0];
    assert.equal(socket.edge.highWaterMark, 8);
  });

  it("absent everywhere stays unbounded (1.x behavior)", async () => {
    const g = new noflo.Graph();
    g.addNode("A", "hwm/Plain");
    g.addNode("B", "hwm/Plain");
    g.addEdge("A", "out", "B", "in");
    const nw = await noflo.createNetwork(g, {
      delay: true,
      subscribeGraph: false,
      componentLoader: loader,
    });
    await nw.connect();
    const socket = nw.connections[0];
    assert.equal(socket.edge.highWaterMark, null);
  });
});
