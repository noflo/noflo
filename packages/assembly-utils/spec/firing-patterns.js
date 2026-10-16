import assert from "node:assert/strict";
import { describe, it } from "node:test";
import noflo from "@noflo/noflo";
import { getComponent as getAll } from "../components/All.js";
import { getComponent as getMerge } from "../components/Merge.js";

/**
 * Attach an addressable inport socket with an explicit connection index.
 *
 * @param {noflo.Component} component
 * @param {number} index
 * @returns {noflo.internalSocket.InternalSocket}
 */
function attachIn(component, index) {
  const socket = new noflo.internalSocket.InternalSocket();
  component.inPorts.ports.in.attach(socket, index);
  return socket;
}

/**
 * Attach the outport and collect data payloads.
 *
 * @param {noflo.Component} component
 * @param {Array<any>} received
 * @returns {noflo.internalSocket.InternalSocket}
 */
function attachOut(component, received) {
  const socket = new noflo.internalSocket.InternalSocket();
  component.outPorts.ports.out.attach(socket);
  socket.addEventListener("ip", (event) => {
    if (event.detail.type === "data") {
      received.push(event.detail.data);
    }
  });
  return socket;
}

describe("barrier firing patterns under concurrent scoped messages", () => {
  // The concurrency contract (work document #36): concurrent in-flight
  // messages must carry scopes. These specs pin that the barrier
  // components resolve per scope — interleaved scoped messages pair
  // correctly, no leg crossing.
  it("Merge pairs interleaved scoped messages per scope", async () => {
    const merge = getMerge();
    /** @type {Array<any>} */
    const received = [];
    attachOut(merge, received);
    const sockets = [0, 1].map((index) => attachIn(merge, index));

    const post = (socket, value, scope) => {
      const ip = new noflo.IP("data", value);
      ip.scope = scope;
      socket.post(ip);
    };
    // Two messages, each with one leg per connection, interleaved across
    // messages on each connection: A-conn0, B-conn0, A-conn1, B-conn1
    post(sockets[0], { errors: [], a: 1 }, "msgA");
    post(sockets[0], { errors: [], a: 20 }, "msgB");
    post(sockets[1], { errors: [], b: 2 }, "msgA");
    post(sockets[1], { errors: [], b: 10 }, "msgB");

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(received.length, 2, "one merged message per scope");
    assert.deepEqual(
      received.find((message) => message.a === 1),
      { errors: [], a: 1, b: 2 },
      "message A's legs merged together",
    );
    assert.deepEqual(
      received.find((message) => message.a === 20),
      { errors: [], a: 20, b: 10 },
      "message B's legs merged together",
    );
    assert.equal(merge.load, 0, "no activation left pending");
    assert.equal(
      merge.inPorts.ports.in.countBuffered(),
      0,
      "all legs consumed",
    );
  });

  it("All assembles interleaved scoped streams per scope", async () => {
    const all = getAll();
    /** @type {Array<any>} */
    const received = [];
    attachOut(all, received);
    const sockets = [0, 1].map((index) => attachIn(all, index));

    const post = (socket, type, value, scope) => {
      const ip = new noflo.IP(type, value);
      ip.scope = scope;
      socket.post(ip);
    };
    // Two bracketed messages, each streamed into both connections,
    // interleaved across scopes and connections
    post(sockets[0], "openBracket", "a", "msgA");
    post(sockets[0], "data", { errors: [], v: "a0" }, "msgA");
    post(sockets[1], "openBracket", "a", "msgA");
    post(sockets[1], "data", { errors: [], v: "a1" }, "msgA");
    post(sockets[0], "openBracket", "b", "msgB");
    post(sockets[0], "data", { errors: [], v: "b0" }, "msgB");
    post(sockets[1], "openBracket", "b", "msgB");
    post(sockets[1], "data", { errors: [], v: "b1" }, "msgB");
    post(sockets[0], "closeBracket", "a", "msgA");
    post(sockets[1], "closeBracket", "a", "msgA");
    post(sockets[0], "closeBracket", "b", "msgB");
    post(sockets[1], "closeBracket", "b", "msgB");

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(received.length, 2, "one assembled message per scope");
    const messageA = received.find((message) =>
      message.data.some((stream) => stream.some((value) => value.v === "a0")),
    );
    const messageB = received.find((message) =>
      message.data.some((stream) => stream.some((value) => value.v === "b0")),
    );
    assert.ok(messageA, "message A assembled");
    assert.ok(messageB, "message B assembled");
    assert.deepEqual(messageA.data, [
      [{ errors: [], v: "a0" }],
      [{ errors: [], v: "a1" }],
    ]);
    assert.deepEqual(messageB.data, [
      [{ errors: [], v: "b0" }],
      [{ errors: [], v: "b1" }],
    ]);
    assert.equal(all.load, 0, "no activation left pending");
    assert.equal(all.inPorts.ports.in.countBuffered(), 0, "streams consumed");
  });
});
