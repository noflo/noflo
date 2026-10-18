import assert from "node:assert/strict";
import { describe, it } from "node:test";
import noflo from "@noflo/noflo";
import { CollectFields } from "../components/CollectFields.js";

/**
 * Instantiate the collector with the given field-name config and attach
 * sockets for the message, the addressable data connections, and the
 * error leg; return the sockets and the collected outputs.
 *
 * @param {Array<string|null>} fieldNames
 * @returns {{ msg: noflo.internalSocket.InternalSocket, data: Array<noflo.internalSocket.InternalSocket>, error: noflo.internalSocket.InternalSocket, received: Array<any> }}
 */
function makeCollector(fieldNames) {
  const c = new CollectFields();
  {
    const socket = new noflo.internalSocket.InternalSocket();
    c.inPorts.ports.fields.attach(socket);
    socket.post(new noflo.IP("data", JSON.stringify(fieldNames)));
  }
  const msg = new noflo.internalSocket.InternalSocket();
  c.inPorts.ports.msg.attach(msg);
  /** @type {Array<noflo.internalSocket.InternalSocket>} */
  const data = [];
  for (let i = 0; i < fieldNames.length; i += 1) {
    const socket = new noflo.internalSocket.InternalSocket();
    c.inPorts.ports.data.attach(socket, i);
    data.push(socket);
  }
  const error = new noflo.internalSocket.InternalSocket();
  c.inPorts.ports.error.attach(error);
  /** @type {Array<any>} */
  const received = [];
  const out = new noflo.internalSocket.InternalSocket();
  c.outPorts.ports.out.attach(out);
  out.addEventListener("ip", (event) => {
    if (event.detail.type === "data") {
      received.push(event.detail.data);
    }
  });
  return { msg, data, error, received };
}

describe("CollectFields whole-message replace", () => {
  it("replaces first, then merges the named fields on top", async () => {
    // The transform-the-message shape (work document #36's mapping
    // vocabulary): the inner output becomes the message, the accumulated
    // errors carrying into it, and the named fields merge on top — the
    // connection order must not change the result
    const c = makeCollector(["output", null]);
    c.msg.post(new noflo.IP("data", { errors: [], path: "/origin" }));
    c.data[0].post(new noflo.IP("data", "<p>rendered</p>"));
    c.data[1].post(
      new noflo.IP("data", { path: "/x/index.html", body: "<p>rendered</p>" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(c.received.length, 1);
    assert.deepEqual(c.received[0], {
      path: "/x/index.html",
      body: "<p>rendered</p>",
      output: "<p>rendered</p>",
      errors: [],
    });
  });

  it("is independent of the inner component's outport declaration order", async () => {
    // The connection index is the inner's outport declaration order,
    // which the graph author does not control: [null, 'meta'] and
    // ['meta', null] must produce the same message
    const first = makeCollector([null, "meta"]);
    first.msg.post(new noflo.IP("data", { errors: [], path: "/origin" }));
    first.data[0].post(new noflo.IP("data", { replaced: true }));
    first.data[1].post(new noflo.IP("data", "META"));
    const second = makeCollector(["meta", null]);
    second.msg.post(new noflo.IP("data", { errors: [], path: "/origin" }));
    second.data[0].post(new noflo.IP("data", "META"));
    second.data[1].post(new noflo.IP("data", { replaced: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(first.received.length, 1);
    assert.equal(second.received.length, 1);
    assert.deepEqual(first.received[0], second.received[0]);
    assert.equal(first.received[0].meta, "META");
    assert.equal(first.received[0].replaced, true);
  });

  it("the replacement owns the envelope's error state", async () => {
    // The replace supersedes the incoming envelope's errors: the inner
    // received the full envelope and owns the accumulation. A
    // relay-convention inner carries the accumulated errors forward
    // inside its replacement; the collector does not merge the two
    // channels (merging would double-count the envelope's original
    // errors for a relay-convention inner)
    const c = makeCollector([null]);
    c.msg.post(new noflo.IP("data", { errors: ["upstream"], path: "/keep" }));
    c.data[0].post(
      new noflo.IP("data", {
        errors: ["upstream", "added by the inner"],
        path: "/replaced",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(c.received.length, 1);
    assert.equal(c.received[0].path, "/replaced");
    assert.deepEqual(c.received[0].errors, ["upstream", "added by the inner"]);
  });

  it("a replacement that carries no errors supersedes the incoming ones", async () => {
    // A fresh-envelope inner chose its own error state: the collector
    // does not fold the incoming envelope's errors into it
    const c = makeCollector([null]);
    c.msg.post(new noflo.IP("data", { errors: ["upstream"], path: "/keep" }));
    c.data[0].post(new noflo.IP("data", { path: "/replaced" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(c.received.length, 1);
    assert.equal(c.received[0].path, "/replaced");
    assert.deepEqual(c.received[0].errors, []);
  });

  it("the error port completes the message before the replace fires", async () => {
    // The error leg is the message's terminal event for its scope (work
    // document #36): when the inner signals through the error port, the
    // message completes there — the replace mapping never fires for it,
    // because a failed inner will not deliver its output
    const c = makeCollector([null]);
    c.msg.post(new noflo.IP("data", { errors: ["upstream"], path: "/keep" }));
    c.error.post(new noflo.IP("data", new Error("signalled")));
    c.data[0].post(
      new noflo.IP("data", { errors: ["upstream"], path: "/replaced" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(c.received.length, 1);
    assert.equal(c.received[0].path, "/keep");
    assert.equal(c.received[0].errors.length, 2);
    assert.equal(c.received[0].errors[0], "upstream");
    assert.match(
      /** @type {Error} */ (c.received[0].errors[1]).message,
      /signalled/,
    );
  });

  it("keeps the original message when the replace output is not a plain object", async () => {
    for (const bad of ["just a string", new Date(), [1, 2, 3]]) {
      const c = makeCollector([null]);
      c.msg.post(new noflo.IP("data", { errors: [], path: "/keep" }));
      c.data[0].post(new noflo.IP("data", bad));
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(c.received.length, 1);
      assert.equal(c.received[0].path, "/keep");
      // The not-plain error surfaces on the envelope channel: the
      // replace did not happen
      assert.equal(c.received[0].errors.length, 1);
      assert.match(
        /** @type {Error} */ (c.received[0].errors[0]).message,
        /not a plain object/,
      );
    }
  });

  it("accepts Object.create(null) as a replace output", async () => {
    // Null-prototype objects spread to their keys cleanly: data preserved
    const c = makeCollector([null]);
    c.msg.post(new noflo.IP("data", { errors: [], path: "/keep" }));
    c.data[0].post(
      new noflo.IP(
        "data",
        Object.assign(Object.create(null), { replaced: true }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(c.received.length, 1);
    assert.equal(c.received[0].replaced, true);
    assert.equal(c.received[0].path, undefined);
  });
});
