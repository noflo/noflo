//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     SPDX-License-Identifier: MIT

// Work document #48: the deterministic regression pin for the intermittent
// silent message drop the noflo-jekyll testbed reproduces end-to-end (work
// document #35 updates #18–#24; #48 update #2 localizes it to the
// DocumentBuilder's two-pass drain).
//
// The distilled shape: a gate-model component — a standing configuration
// read non-consumingly from a control port, per-message scoped posts that
// convert through the component itself, and held documents whose
// resolvability depends on every post having converted (the two-pass
// dependency). The drain is head-first, stops at the first unresolvable
// document, and the wake that re-offers the held documents when the last
// post's conversion lands is the drain pump (work document #47).
//
// The race the pipeline hits: every input reaches end of transmission
// while the last consuming activation is still open. Its completion runs
// the closedown predicate (work document #45) synchronously inside
// `deactivate` — buffered data at EOT is "stranded by definition" and
// does not block closing — and sets `closedDown` before the pump offer
// scheduled by that same completion can fire. The pump's guard declines
// on `closedDown`, the held documents never drain, and the shutdown
// silently discards them. No error, no residue: the silent drop.
//
// The test drives the exact interleaving deterministically through
// per-post resume gates, and asserts the correct contract: every held
// resolvable document must emit before the component closes down. On the
// current engine it FAILS — that failure is the reproduction; the engine
// fix (or contract clarification) flips it green.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import IP from "../src/lib/IP.js";
import * as noflo from "../src/lib/NoFlo.js";

const setImmediateP = () => new Promise((resolve) => setImmediate(resolve));

/**
 * The distilled builder: standing config on a control port; scoped posts
 * consumed on arrival (marking the shared collection); unscoped pages
 * held head-of-line until every post is marked. Each post's drain
 * completes only when the test releases its gate, so the interleaving is
 * exact.
 *
 * @param {Record<string, () => void>} release - Post path → the deferred
 *   resolution the test drives
 * @returns {import("../src/lib/Component.js").Component}
 */
function makeBuilder(release) {
  const c = new noflo.Component({
    inPorts: {
      config: { datatype: "object", control: true, scoped: false },
      msg: { datatype: "object" },
    },
    outPorts: { out: { datatype: "object" } },
  });
  /** @type {Record<string, any>|null} */
  let config = null;
  /** @type {Set<string|null>} */
  const draining = new Set();
  c.process((input, output) => {
    if (input.hasData("config")) {
      config = { ...input.getData("config") };
    }
    const scope = input.scope ?? null;
    if (draining.has(scope)) {
      output.done();
      return;
    }
    /**
     * The head-first resolvability check, mirroring the jekyll builder:
     * posts convert immediately; pages wait for every post's conversion.
     * @param {any} ip
     * @returns {boolean}
     */
    const resolvable = (ip) => {
      if (ip.type !== "data") {
        return false;
      }
      const msg = ip.data;
      if (msg.kind === "post") {
        return true;
      }
      return (
        Boolean(config?.posts?.length) &&
        config.posts.every((/** @type {Record<string, any>} */ p) => p.content)
      );
    };
    let headOk = false;
    const headCheck = (/** @type {any} */ ip) => {
      if (headOk) {
        return false;
      }
      headOk = resolvable(ip);
      return headOk;
    };
    input.has("msg", headCheck);
    if (!headOk) {
      output.done();
      return;
    }
    draining.add(scope);
    /**
     * Drain this scope's partition head-first, re-checking after each
     * send, like the jekyll builder's flush.
     * @returns {Promise<void>}
     */
    const flush = async () => {
      try {
        for (;;) {
          headOk = false;
          input.has("msg", headCheck);
          if (!headOk) {
            break;
          }
          const msg = input.getData("msg");
          if (msg.kind === "post") {
            // The activation holds until the test releases this post's
            // send — the async-send shape the real builder's awaited
            // edge admissions produce. The conversion mark lands here:
            // in the real pipeline the enrichment rides the drained
            // message, so the last post's mark lands only when its
            // drain reaches this point
            await new Promise((resolve) => {
              release[msg.path] = () => resolve();
            });
            for (const post of config.posts) {
              if (post.path === msg.path) {
                post.content = `rendered:${msg.path}`;
              }
            }
          }
          await output.send({
            out: new IP("data", { path: msg.path }, { scope: msg.path }),
          });
        }
      } finally {
        draining.delete(scope);
      }
      // An arrival that landed while the guard was up fired an
      // activation that closed without draining — re-check, as the
      // jekyll builder does
      headOk = false;
      input.has("msg", headCheck);
      if (headOk) {
        return flush();
      }
      return undefined;
    };
    return flush();
  });
  return c;
}

describe("work document #48: the closedown-vs-pump delivery race", () => {
  it("drains every held resolvable document before closing down", async () => {
    /** @type {Record<string, () => void>} */
    const release = {};
    const builder = makeBuilder(release);
    const configSocket = new noflo.internalSocket.InternalSocket({});
    const msgSocket = new noflo.internalSocket.InternalSocket({});
    const outSocket = new noflo.internalSocket.InternalSocket({});
    builder.inPorts.config.attach(configSocket);
    builder.inPorts.msg.attach(msgSocket);
    builder.outPorts.out.attach(outSocket);
    /** @type {string[]} */
    const emitted = [];
    outSocket.addEventListener("ip", (event) => {
      if (event.detail.type === "data") {
        emitted.push(event.detail.data.path);
      }
    });
    /** @type {string[]} */
    const closedownHeld = [];
    let closedownFired = false;
    builder.addEventListener("closedown", () => {
      closedownFired = true;
      // Held documents may sit in the regular buffer (unscoped) or the
      // scoped partitions — read both
      const port = builder.inPorts.ports.msg;
      for (const ip of port.buffer ?? []) {
        if (ip.type === "data") {
          closedownHeld.push(ip.data?.path ?? "?");
        }
      }
      for (const [, buf] of Object.entries(port.scopedBuffer ?? {})) {
        for (const ip of buf ?? []) {
          if (ip.type === "data") {
            closedownHeld.push(ip.data?.path ?? "?");
          }
        }
      }
    });

    // The standing config with three unconverted posts
    configSocket.post(
      new IP("data", {
        posts: [{ path: "p1" }, { path: "p2" }, { path: "p3" }],
      }),
      false,
    );
    await setImmediateP();

    // Three posts (scoped) and three pages (unscoped, head-of-line until
    // every post converted)
    for (const path of ["p1", "p2", "p3"]) {
      msgSocket.post(
        new IP("data", { kind: "post", path }, { scope: path }),
        false,
      );
    }
    for (const path of ["r1", "r2", "r3"]) {
      msgSocket.post(new IP("data", { kind: "page", path }), false);
    }
    // Let every arrival's activation settle: the three post drains hold
    // on their gates (each post marked at consumption), the page
    // activations declined
    await setImmediateP();
    await setImmediateP();
    assert.deepEqual(emitted, []);

    // Release p1 and p2 with full settling: each drain emits, completes,
    // and its pump offer runs against the still-held pages (declining —
    // p3 unmarked)
    release.p1();
    await setImmediateP();
    await setImmediateP();
    await setImmediateP();
    assert.ok(emitted.includes("p1"));
    release.p2();
    await setImmediateP();
    await setImmediateP();
    await setImmediateP();
    assert.ok(emitted.includes("p2"));

    // The race: all inputs reach EOT while p3's drain is still gated.
    // Its release completes the drain — the closedown predicate runs
    // synchronously in deactivate (every input at EOT, load zero) and
    // sets closedDown before the pump offer this completion schedules
    // can fire. The three held pages — resolvable the moment p3 was
    // marked — must still drain.
    msgSocket.disconnect();
    configSocket.disconnect();
    release.p3();
    const deadline = Date.now() + 2000;
    while (
      emitted.filter((p) => p.startsWith("r")).length < 3 &&
      Date.now() < deadline
    ) {
      await setImmediateP();
    }
    assert.deepEqual(
      emitted.filter((p) => p.startsWith("r")).sort(),
      ["r1", "r2", "r3"],
      `the held resolvable pages were silently dropped at closedown — emitted: ${JSON.stringify(emitted)}, closedownFired: ${closedownFired}, held at closedown: ${JSON.stringify(closedownHeld)}`,
    );
    assert.ok(
      builder.isClosedDown(),
      "the component should close down after everything drained",
    );
  });

  it("drains a pending non-control IIP buffered before the gate armed", async () => {
    // The same closedown-vs-pump race through a different buffer shape:
    // the held work sits in the port's IIP buffer, which the pump's
    // ready-scope scan reaches just like the regular buffers — the
    // closedown deferral must reach it too, or the IIP is stranded at
    // end of transmission exactly like the head-of-line pages above
    let armed = false;
    const c = new noflo.Component({
      inPorts: {
        in: { datatype: "all" },
        trig: { datatype: "all" },
      },
      outPorts: { out: { datatype: "all" } },
    });
    c.process((input, output) => {
      if (input.hasData("in")) {
        const a = input.getData("in");
        const deliver = async () => {
          // The gate arms asynchronously: an arrival landing in this
          // window declines and waits for the pump's re-offer
          await setImmediateP();
          armed = true;
          await output.send({ out: `a:${a}` });
          output.done();
        };
        deliver();
        return;
      }
      if (input.hasData("trig")) {
        if (!armed) {
          // The gate is not armed yet: decline without consuming — the
          // packet waits in the IIP buffer for the pump's re-offer
          output.done();
          return;
        }
        const b = input.getData("trig");
        const deliver = async () => {
          await output.send({ out: `b:${b}` });
          output.done();
        };
        deliver();
        return;
      }
      output.done();
    });
    const inSocket = new noflo.internalSocket.InternalSocket({});
    const trigSocket = new noflo.internalSocket.InternalSocket({});
    const outSocket = new noflo.internalSocket.InternalSocket({});
    c.inPorts.in.attach(inSocket);
    c.inPorts.trig.attach(trigSocket);
    c.outPorts.out.attach(outSocket);
    /** @type {string[]} */
    const received = [];
    let closedownFired = false;
    outSocket.addEventListener("ip", (event) => {
      if (event.detail.type === "data") {
        received.push(event.detail.data);
      }
    });
    c.addEventListener("closedown", () => {
      closedownFired = true;
    });

    // a arrives first; its activation consumes it and parks on the
    // arming delay
    inSocket.post(new IP("data", "work"), false);
    // b arrives as a non-control IIP while the gate is still unarmed:
    // its activation declines, the packet holds in the IIP buffer
    const trigger = new IP("data", "trigger");
    trigger.initial = true;
    trigSocket.post(trigger, false);
    // Every input reaches EOT while a's activation is still parked —
    // the closedown-vs-pump race window
    inSocket.disconnect();
    trigSocket.disconnect();

    const deadline = Date.now() + 2000;
    while (received.length < 2 && Date.now() < deadline) {
      await setImmediateP();
    }
    assert.deepEqual(
      received.sort(),
      ["a:work", "b:trigger"],
      `the buffered IIP was silently dropped at closedown — received: ${JSON.stringify(received)}, closedownFired: ${closedownFired}`,
    );
    assert.ok(
      c.isClosedDown(),
      "the component should close down after everything drained",
    );
  });

  it("surfaces the residue census at closedown when the gate never arms", async () => {
    // Shape 1's engine essence (work document #48 update #8): a gate that
    // never arms strands the buffered documents in the component's own
    // buffers; the closedown discard is silent unless the residue is
    // surfaced. The stranded event is the no-silent-loss surface
    const c = new noflo.Component({
      inPorts: {
        config: { datatype: "object", control: true, scoped: false },
        msg: { datatype: "object" },
      },
      outPorts: { out: { datatype: "object" } },
    });
    // No config ever arrives: every page declines and stays buffered
    c.process((input, output) => {
      if (!input.hasData("config")) {
        output.done();
        return;
      }
      output.sendDone({ out: input.getData("msg") });
    });
    const msgSocket = new noflo.internalSocket.InternalSocket({});
    const configSocket = new noflo.internalSocket.InternalSocket({});
    c.inPorts.msg.attach(msgSocket);
    c.inPorts.config.attach(configSocket);
    /** @type {Array<any>} */
    const strandedEvents = [];
    c.addEventListener("stranded", (event) => {
      strandedEvents.push(event.detail);
    });
    for (const path of ["r1", "r2", "r3"]) {
      msgSocket.post(new IP("data", { path }, { scope: path }), false);
    }
    msgSocket.disconnect();
    configSocket.disconnect();
    const deadline = Date.now() + 2000;
    while (!c.isClosedDown() && Date.now() < deadline) {
      await setImmediateP();
    }
    assert.ok(c.isClosedDown(), "the component should close down");
    const closedownEvent = strandedEvents.find((e) => e.reason === "closedown");
    assert.ok(
      closedownEvent,
      `the closedown residue census must surface the held documents — stranded events: ${JSON.stringify(strandedEvents)}`,
    );
    const total = closedownEvent.residue.reduce((n, r) => n + r.data, 0);
    assert.equal(total, 3, "the census names all three held documents");
  });

  it("surfaces a control-stream replacement clobber", async () => {
    // The bang-vs-corpus hazard from the noflo-jekyll verification: a
    // control port keeps the latest stream, so a late stream replaces an
    // earlier one whose data was never consumed — the replaced data
    // strands at the replacement moment and must surface there, not as
    // silence
    const c = new noflo.Component({
      inPorts: {
        includes: { datatype: "all", control: true, scoped: false },
      },
      outPorts: { out: { datatype: "all" } },
    });
    c.process((_input, output) => {
      output.done();
    });
    const includesSocket = new noflo.internalSocket.InternalSocket({});
    c.inPorts.includes.attach(includesSocket);
    /** @type {Array<any>} */
    const strandedEvents = [];
    c.inPorts.includes.addEventListener("stranded", (event) => {
      strandedEvents.push(event.detail);
    });
    // The corpus arrives first (one unbracketed data IP: its own stream)
    includesSocket.post(new IP("data", "footer.html"), false);
    await setImmediateP();
    // A later stream replaces it while its data was never consumed
    includesSocket.post(new IP("data", "replacement"), false);
    await setImmediateP();
    await setImmediateP();
    const clobber = strandedEvents.find((e) => e.reason === "stream-replaced");
    assert.ok(
      clobber,
      `the replacement must surface the discarded stream content — stranded events: ${JSON.stringify(strandedEvents)}`,
    );
    assert.equal(clobber.data, 1);
  });

  it("surfaces the dropped error when the fail leg is unattached and optional", async () => {
    // Shape 2's engine essence: a build error sent to an unattached
    // optional fail leg vanishes by contract — the no-silent-loss
    // invariant requires the drop itself to be surfaced. The component-
    // side fix for the pipeline is `required: true`, which escalates
    // instead of dropping
    const c = new noflo.Component({
      inPorts: { msg: { datatype: "object" } },
      outPorts: {
        out: { datatype: "object" },
        fail: { datatype: "object" },
      },
    });
    c.process((input, output) => {
      if (!input.hasData("msg")) {
        output.done();
        return;
      }
      const msg = input.getData("msg");
      const deliver = async () => {
        try {
          if (msg.fail) {
            throw new Error(`build failed for ${msg.path}`);
          }
          await output.send({ out: msg });
          output.done();
        } catch (err) {
          output.send({ fail: { errors: [err], path: msg.path } });
          output.done();
        }
      };
      deliver();
    });
    const msgSocket = new noflo.internalSocket.InternalSocket({});
    c.inPorts.msg.attach(msgSocket);
    /** @type {Array<any>} */
    const strandedEvents = [];
    c.outPorts.ports.fail.addEventListener("stranded", (event) => {
      strandedEvents.push(event.detail);
    });
    msgSocket.post(new IP("data", { path: "ok", fail: false }), false);
    msgSocket.post(new IP("data", { path: "bad", fail: true }), false);
    msgSocket.disconnect();
    const deadline = Date.now() + 2000;
    while (!c.isClosedDown() && Date.now() < deadline) {
      await setImmediateP();
    }
    const dropped = strandedEvents.find((e) => e.reason === "unattached-send");
    assert.ok(
      dropped,
      `the dropped error must surface on the stranded event — stranded events: ${JSON.stringify(strandedEvents)}`,
    );
    assert.ok(c.isClosedDown());
  });

  it("re-fires pending scopes when a forwarding inport's arrival completes their gate", async () => {
    // The one-firing rule must apply to forwarding inports' arrivals too
    // (work document #48): a corpus arrival on a framing-terminated
    // control port fires the direct path — one activation for the
    // arriving IP's own scope — and before the fix SKIPPED the
    // ready-scope walk, so pending work in other scopes whose gate the
    // corpus completes never re-fired. This is the liquid Template's
    // includes race: the corpus arrives after the pages buffered, the
    // corpus's own scope sees no template/variables, the pages strand
    const c = new noflo.Component({
      inPorts: {
        // The corpus port: standing control stream with declared framing
        // termination — a forwarding inport, exactly like the liquid
        // Template's includes port
        includes: { datatype: "all", control: true, scoped: false },
        msg: { datatype: "object" },
      },
      outPorts: { out: { datatype: "object" } },
    });
    c.forwardBrackets = { includes: [] };
    c.process((input, output) => {
      // The gate, mirroring the liquid Template: the corpus must have
      // arrived (hasStream) before the message may consume
      if (
        input.attached("includes").length > 0 &&
        !input.hasStream("includes")
      ) {
        output.done();
        return;
      }
      if (!input.hasData("msg")) {
        output.done();
        return;
      }
      output.sendDone({ out: input.getData("msg") });
    });
    const includesSocket = new noflo.internalSocket.InternalSocket({});
    const msgSocket = new noflo.internalSocket.InternalSocket({});
    const outSocket = new noflo.internalSocket.InternalSocket({});
    c.inPorts.includes.attach(includesSocket);
    c.inPorts.msg.attach(msgSocket);
    c.outPorts.out.attach(outSocket);
    /** @type {string[]} */
    const emitted = [];
    outSocket.addEventListener("ip", (event) => {
      if (event.detail.type === "data") emitted.push(event.detail.data);
    });

    // The message arrives FIRST, in a scope of its own: the corpus gate
    // declines it (hasStream false — nothing buffered yet), it stays
    // buffered
    msgSocket.post(
      new IP("data", { path: "page-1" }, { scope: "page-1" }),
      false,
    );
    await setImmediateP();
    assert.deepEqual(emitted, []);

    // The corpus arrives on the forwarding control port: its arrival
    // completes the held message's gate and must re-fire the pending
    // scope
    includesSocket.post(new IP("data", "footer"), false);
    const deadline = Date.now() + 2000;
    while (emitted.length < 1 && Date.now() < deadline) {
      await setImmediateP();
    }
    assert.deepEqual(
      emitted.map((e) => e.path),
      ["page-1"],
      "the held message was never re-fired by the corpus arrival — the forwarding inport's direct path skipped the ready-scope walk",
    );
  });

  it("re-fires the unscoped partition when a late corpus packet completes the head's gate", async () => {
    // The builder shape from the noflo-jekyll verification (work document
    // #48 update #12): unscoped documents buffered head-of-line whose
    // layout chain completes only with the corpus's LAST template — the
    // corpus arrives packet-by-packet after the documents buffered, and
    // the completing packet's arrival must re-fire the unscoped
    // partition. Every observed strand in the testbed is unscoped root
    // pages; scoped posts always drain — this pin answers whether the
    // one-firing rule's walk covers the null-scope partition
    const c = new noflo.Component({
      inPorts: {
        templates: { datatype: "object", control: true, scoped: false },
        msg: { datatype: "object" },
      },
      outPorts: { out: { datatype: "object" } },
    });
    /** @type {Record<string, any>} */
    const store = {};
    c.process((input, output) => {
      if (input.hasData("templates")) {
        for (const ip of input.getStream("templates")) {
          if (ip.type === "data") {
            store[ip.data.name] = ip.data;
          }
        }
      }
      if (!input.hasData("msg")) {
        output.done();
        return;
      }
      // Head-first resolvability: the head document's layout chain must
      // be complete in the store
      const resolvable = (/** @type {any} */ ip) =>
        ip.type === "data" &&
        store[ip.data.layout] !== undefined &&
        store[ip.data.layout2] !== undefined;
      if (!input.has("msg", resolvable)) {
        output.done();
        return;
      }
      // Drain the unscoped partition head-first, re-checking after each
      // send
      for (;;) {
        if (!input.has("msg", resolvable)) {
          break;
        }
        output.sendDone({ out: input.getData("msg") });
      }
      output.done();
    });
    const templatesSocket = new noflo.internalSocket.InternalSocket({});
    const msgSocket = new noflo.internalSocket.InternalSocket({});
    const outSocket = new noflo.internalSocket.InternalSocket({});
    c.inPorts.templates.attach(templatesSocket);
    c.inPorts.msg.attach(msgSocket);
    c.outPorts.out.attach(outSocket);
    /** @type {string[]} */
    const emitted = [];
    outSocket.addEventListener("ip", (event) => {
      if (event.detail.type === "data") emitted.push(event.detail.data.path);
    });

    // The documents arrive first: the head needs templates "a" and "b",
    // neither buffered yet — every activation declines, the documents
    // stay buffered in the unscoped partition
    for (const path of ["d1", "d2", "d3"]) {
      msgSocket.post(
        new IP("data", { path, layout: "a", layout2: "b" }),
        false,
      );
      await setImmediateP();
    }
    assert.deepEqual(emitted, []);

    // The corpus arrives packet-by-packet: the completing template ("b")
    // is the LAST data packet of the framed stream, exactly like the
    // testbed's index layout arriving last
    templatesSocket.post(new IP("openBracket", "corpus"), false);
    templatesSocket.post(new IP("data", { name: "a", body: "a-body" }), false);
    templatesSocket.post(
      new IP("data", { name: "footer", body: "footer-body" }),
      false,
    );
    templatesSocket.post(new IP("data", { name: "b", body: "b-body" }), false);
    templatesSocket.post(new IP("closeBracket", "corpus"), false);
    // End of transmission: the corpus stream completed, the sender
    // closed — the closedown predicate evaluates with the documents
    // still held, and the drain-pump offer must fire before the
    // closedown lands
    templatesSocket.disconnect();
    msgSocket.disconnect();
    const deadline = Date.now() + 2000;
    while ((emitted.length < 3 || !c.isClosedDown()) && Date.now() < deadline) {
      await setImmediateP();
    }
    // The exact sequence, order and multiplicity included: exactly one
    // emission per held document. A cross-port firing context — the
    // corpus's control-port packets offered as the msg port's firing
    // context — engages auto-ordering for the whole component and the
    // ordered output machinery re-sends the activation's accumulated
    // result on every flush; the pin's exact-sequence assert catches
    // both the strand and the duplication (work document #48 update
    // #13)
    assert.deepEqual(
      emitted,
      ["d1", "d2", "d3"],
      `the unscoped partition was not drained exactly once when the corpus completed the head's gate (emitted: ${JSON.stringify(emitted)}, closed: ${c.isClosedDown()})`,
    );
    assert.ok(c.isClosedDown());
  });
});
