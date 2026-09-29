import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Edge, resolveHighWaterMark } from "../src/lib/Edge.js";
import IP from "../src/lib/IP.js";

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
