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
});
