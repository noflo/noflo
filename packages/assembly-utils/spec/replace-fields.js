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
  return { component: c, msg, data, error, received };
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

  it("spreads the mapped output's keys into the message", async () => {
    // The front-matter shape (work document #35 update #23's
    // out-mapping semantics): the parsed fields merge into the message's
    // top level instead of nesting under a named field or replacing it
    const c = makeCollector(["*"]);
    c.msg.post(
      new noflo.IP("data", {
        errors: [],
        path: "/site/_posts/hello.md",
        body: "<p>hi</p>",
      }),
    );
    c.data[0].post(new noflo.IP("data", { title: "Hello", layout: "post" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(c.received.length, 1);
    assert.deepEqual(c.received[0], {
      errors: [],
      path: "/site/_posts/hello.md",
      body: "<p>hi</p>",
      title: "Hello",
      layout: "post",
    });
  });

  it("a spread key overwrites a same-named message field", async () => {
    const c = makeCollector(["*"]);
    c.msg.post(
      new noflo.IP("data", { errors: [], path: "/keep", title: "old" }),
    );
    c.data[0].post(new noflo.IP("data", { title: "new", extra: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(c.received.length, 1);
    assert.equal(c.received[0].title, "new");
    assert.equal(c.received[0].path, "/keep");
    assert.equal(c.received[0].extra, 1);
  });

  it("spreads after the named fields and the replace", async () => {
    // The precedence chain: replace first, named fields merge, the
    // spread merges last — a spread key wins over a same-named named
    // field, mirroring the front-matter-over-message semantic
    const c = makeCollector(["meta", null, "*"]);
    c.msg.post(new noflo.IP("data", { errors: [], path: "/origin" }));
    c.data[0].post(new noflo.IP("data", "META"));
    c.data[1].post(new noflo.IP("data", { replaced: true, meta: "old" }));
    c.data[2].post(new noflo.IP("data", { meta: "new", spread: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(c.received.length, 1);
    assert.equal(c.received[0].replaced, true);
    assert.equal(c.received[0].meta, "new");
    assert.equal(c.received[0].spread, true);
  });

  it("spread-vs-named precedence is connection-order independent", async () => {
    // The processing order is fixed by mapping kind — replace, named,
    // spread — so a same-key collision resolves identically whichever
    // connection carries which mapping (the review's probe found the
    // single merge loop making it connection-order dependent)
    const spreadFirst = makeCollector(["*", "meta"]);
    spreadFirst.msg.post(new noflo.IP("data", { errors: [], path: "/origin" }));
    spreadFirst.data[0].post(new noflo.IP("data", { meta: "from-spread" }));
    spreadFirst.data[1].post(new noflo.IP("data", "from-named"));
    const namedFirst = makeCollector(["meta", "*"]);
    namedFirst.msg.post(new noflo.IP("data", { errors: [], path: "/origin" }));
    namedFirst.data[0].post(new noflo.IP("data", "from-named"));
    namedFirst.data[1].post(new noflo.IP("data", { meta: "from-spread" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(spreadFirst.received.length, 1);
    assert.equal(namedFirst.received.length, 1);
    assert.equal(spreadFirst.received[0].meta, "from-spread");
    assert.equal(namedFirst.received[0].meta, "from-spread");
    assert.equal(spreadFirst.received[0].meta, namedFirst.received[0].meta);
  });

  it("an own __proto__ key in the spread output cannot pollute the message", async () => {
    // The spread merges parsed untrusted content, and JSON.parse
    // produces exactly the attack shape — an own `__proto__` key. The
    // merge must define own properties (object spread), not assign via
    // [[Set]] (Object.assign), which would route the key through the
    // prototype setter and hand the emitted message an attacker-chosen
    // prototype (the round-2 review's probe)
    const payload = JSON.parse('{"title":"T","__proto__":{"isAdmin":true}}');
    assert.deepEqual(Object.keys(payload), ["title", "__proto__"]);
    const c = makeCollector(["*"]);
    c.msg.post(new noflo.IP("data", { errors: [], path: "/origin" }));
    c.data[0].post(new noflo.IP("data", payload));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(c.received.length, 1);
    const emitted = c.received[0];
    assert.equal(
      Object.getPrototypeOf(emitted),
      Object.prototype,
      "the emitted message's prototype is unchanged",
    );
    assert.equal(emitted.isAdmin, undefined);
    assert.equal(emitted.title, "T");
    assert.equal(emitted.path, "/origin");
  });

  it("the spread never owns errors: the accumulation channels keep them", async () => {
    // The review found the spread's errors key silently discarded in the
    // spread-only shape and clobbering the whole accumulation in the
    // replace+spread shape — the spread is now excluded from the merge,
    // so both config shapes behave identically: the accumulation channels
    // (the envelope's own errors, superseded only by a replace) own the
    // field
    const spreadOnly = makeCollector(["*"]);
    spreadOnly.msg.post(
      new noflo.IP("data", {
        errors: [new Error("the envelope's own error")],
        path: "/origin",
      }),
    );
    spreadOnly.data[0].post(
      new noflo.IP("data", {
        title: "T",
        errors: [new Error("the spread's errors key")],
      }),
    );
    const replaceAndSpread = makeCollector([null, "*"]);
    replaceAndSpread.msg.post(
      new noflo.IP("data", { errors: [], path: "/origin" }),
    );
    replaceAndSpread.data[0].post(
      new noflo.IP("data", {
        replaced: true,
        errors: [new Error("the replacement's own")],
      }),
    );
    replaceAndSpread.data[1].post(
      new noflo.IP("data", {
        title: "T",
        errors: [new Error("the spread's errors key")],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(spreadOnly.received.length, 1);
    assert.equal(spreadOnly.received[0].title, "T");
    assert.equal(spreadOnly.received[0].errors.length, 1);
    assert.equal(
      spreadOnly.received[0].errors[0].message,
      "the envelope's own error",
    );
    assert.equal(replaceAndSpread.received.length, 1);
    assert.equal(replaceAndSpread.received[0].replaced, true);
    assert.equal(replaceAndSpread.received[0].title, "T");
    const messages = replaceAndSpread.received[0].errors.map(
      (/** @type {Error} */ e) => e.message,
    );
    assert.ok(messages.includes("the replacement's own"));
    assert.ok(!messages.includes("the spread's errors key"));
  });

  it("an error-port signal appends to the replace's accumulation", async () => {
    // The error leg is the message's terminal event: an error IP while
    // fields are still pending completes the message with what delivered
    // — the replace's accumulation and the out-of-band signal appended,
    // the not-yet-delivered spread field's data completing later without
    // a collector waiting (the pre-existing terminal-event semantics,
    // now consistent with the spread's errors exclusion)
    const c = makeCollector([null, "*"]);
    c.msg.post(new noflo.IP("data", { errors: [], path: "/origin" }));
    c.data[0].post(
      new noflo.IP("data", {
        replaced: true,
        errors: [new Error("the replacement's own")],
      }),
    );
    c.error.post(new noflo.IP("data", new Error("from the error port")));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(c.received.length, 1);
    assert.equal(c.received[0].replaced, true);
    const messages = c.received[0].errors.map(
      (/** @type {Error} */ e) => e.message,
    );
    assert.ok(messages.includes("the replacement's own"));
    assert.ok(messages.includes("from the error port"));
  });

  it("errors on a non-object spread output", async () => {
    const c = makeCollector(["*"]);
    c.msg.post(new noflo.IP("data", { errors: [], path: "/keep" }));
    c.data[0].post(new noflo.IP("data", "not an object"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(c.received.length, 1);
    assert.equal(c.received[0].path, "/keep");
    assert.equal(c.received[0].errors.length, 1);
    assert.match(
      String(c.received[0].errors[0].message),
      /spread-mapped inner output is not a plain object/,
    );
  });

  it("rejects a doubled spread config", async () => {
    const c = makeCollector(["*", "*"]);
    /** @type {Error[]} */
    const errors = [];
    // The doubled config rejects the write: the returned promise rejects
    // for awaiting callers, and the socket's error listener absorbs the
    // side-channel escalation (loud throw without one)
    for (const socket of [c.msg, ...c.data, c.error]) {
      socket.addEventListener("error", (/** @type {CustomEvent} */ event) => {
        errors.push(/** @type {Error} */ (event.detail?.error ?? event.detail));
      });
    }
    await c.msg.post(new noflo.IP("data", { errors: [] })).catch(() => {});
    await c.data[0].post(new noflo.IP("data", { a: 1 })).catch(() => {});
    await c.data[1].post(new noflo.IP("data", { b: 2 })).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(c.received, []);
    assert.equal(errors.length, 1);
    assert.match(
      String(errors[0].message),
      /at most one \* \(the spread mapping\)/,
    );
  });
});
