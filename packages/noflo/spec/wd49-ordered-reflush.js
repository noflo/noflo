//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     SPDX-License-Identifier: MIT

// Work document #49: ordered-output re-activation re-sends accumulated
// output. In ordered mode every activation pushes its context's result
// object into outputQ, and a process function that completes its
// activation mid-drain (sendDone per item) re-activates the same context
// on its next read — or on its closing done() — pushing the same result
// whose port arrays still held every already-sent IP. Each ordered flush
// then re-sent the accumulated history: three logical sends emitted nine
// packets in the prefix-growing pattern (d1), (d1,d2), (d1,d2,d3),
// (d1,d2,d3) — the duplication the noflo-jekyll verification probes
// caught as d1×4/d2×3/d3×2 during the #48 investigation (its spurious
// entry path — a cross-port context IP engaging auto-ordering — was
// fixed in #1103; this pin holds the genuine ordered-mode defect).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import IP from "../src/lib/IP.js";
import * as noflo from "../src/lib/NoFlo.js";

const setImmediateP = () => new Promise((resolve) => setImmediate(resolve));

describe("work document #49: ordered-output re-activation", () => {
  it("emits each drained item exactly once when the drain loop re-activates", async () => {
    // A genuinely auto-ordered component — a real framed stream engages
    // auto-ordering on its own inport — whose process function drains
    // every buffered item with sendDone in a loop. Each sendDone
    // completes the activation (flushing the result), and the loop's
    // continuation re-activates the same context, re-pushing its result
    const c = new noflo.Component({
      inPorts: { in: { datatype: "all" } },
      outPorts: { out: { datatype: "all" } },
    });
    c.process((input, output) => {
      if (!input.hasData("in")) {
        output.done();
        return;
      }
      while (input.hasData("in")) {
        output.sendDone({ out: input.getData("in") });
      }
      output.done();
    });
    const inSocket = new noflo.internalSocket.InternalSocket({});
    const outSocket = new noflo.internalSocket.InternalSocket({});
    c.inPorts.in.attach(inSocket);
    c.outPorts.out.attach(outSocket);
    /** @type {any[]} */
    const emitted = [];
    outSocket.addEventListener("ip", (event) => {
      if (event.detail.type === "data") {
        emitted.push(event.detail.data);
      }
    });

    // The framed stream engages auto-ordering: the component queues
    // output until the input order resolves, so the drain's sends ride
    // the outputQ machinery this pin exercises
    inSocket.post(new IP("openBracket", "batch"), false);
    for (const item of ["a", "b", "c"]) {
      inSocket.post(new IP("data", item), false);
      await setImmediateP();
    }
    inSocket.post(new IP("closeBracket", "batch"), false);
    const deadline = Date.now() + 2000;
    while (emitted.length < 3 && Date.now() < deadline) {
      await setImmediateP();
    }
    // Let every scheduled flush land before judging
    for (let i = 0; i < 10; i += 1) {
      await setImmediateP();
    }
    assert.ok(
      c.autoOrdering,
      "the framed stream should have engaged auto-ordering — the pin must exercise the ordered machinery",
    );
    assert.deepEqual(
      emitted,
      ["a", "b", "c"],
      `each drained item must emit exactly once, in order — emitted: ${JSON.stringify(emitted)}`,
    );
  });
});
