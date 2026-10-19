//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     SPDX-License-Identifier: MIT

// Work document #48: the noflo-jekyll document-leg delivery anomaly.
// The testbed's stress evidence (work document #35 update #22: five
// consecutive builds, three distinct output trees — intermittent silent
// message drops under staggered async arrivals) predates the control-gate
// re-fire (#47, PR #1094), the drain-based network closing (#45, PR
// #1092), and the drain pump (#47, PR #1099). This suite distills the
// document leg to its engine shape and runs it through the actual
// assembly adapter machinery the trace evidence ran through, under
// randomized arrival orders, as the standing regression suite for the
// negative result: every message arrives, every run closes down.
//
// Shape (noflo #35 updates #14–#22): a gate-model render component —
// standing bracket-framed configuration on a `scoped: false` control
// port read non-consumingly, per-message scoped data on two ports
// consumed only when both have delivered — wrapped by `wrapAssembly`
// (Fork → field extractors → CollectFields collector), driven with
// bracket-framed scoped message envelopes whose arrival order races the
// configuration and staggers with async jitter inside the activations.
//
// The default run count keeps the suite quick; the full matrix that
// produced the negative result (bounded edges, bursts, multi-registration
// control streams, deep overlapping activations, hundreds of runs) is
// available via WD48_RUNS/WD48_MESSAGES/WD48_MATRIX.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wrapAssembly } from "@noflo/assembly";
import { getComponent as CollectFields } from "@noflo/assembly-utils/components/CollectFields.js";
import { getComponent as ExtractField } from "@noflo/assembly-utils/components/ExtractField.js";
import { getComponent as Fork } from "@noflo/assembly-utils/components/Fork.js";
import IP from "../src/lib/IP.js";
import * as noflo from "../src/lib/NoFlo.js";

const setImmediateP = () => new Promise((resolve) => setImmediate(resolve));

const RUNS = Number(process.env.WD48_RUNS ?? 20);
const MESSAGES = Number(process.env.WD48_MESSAGES ?? 12);

/**
 * The inner render component: the gate model the jekyll document leg
 * settled on (work document #35 updates #14/#16/#22).
 *
 * @returns {import("../src/lib/Component.js").Component}
 */
function makeInner() {
  const c = new noflo.Component({
    inPorts: {
      data: { datatype: "all" },
      variables: { datatype: "all" },
      includes: { datatype: "all", control: true, scoped: false },
    },
    outPorts: { out: { datatype: "all" } },
  });
  c.process((input, output) => {
    // The standing config is read non-consumingly; the has-first
    // discipline declines until it has arrived, and the config arrival
    // re-fires the pending scopes (work document #47)
    if (!input.has("includes")) {
      return;
    }
    if (!input.hasData("data", "variables")) {
      return;
    }
    const includes = input.get("includes");
    const data = input.getData("data");
    const variables = input.getData("variables");
    // The activation stays open across a jittered delay, like the
    // wrapped liquid inner
    const deliver = async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, 3 * (0.5 + Math.random())),
      );
      output.sendDone({ out: { data, variables, includes } });
    };
    deliver();
  });
  return c;
}

/**
 * @returns {{ list: () => Object<string, any>, get: (name: string) => Promise<any> }}
 */
function makeRegistry() {
  const list = () => ({
    "test/Render": { getComponent: makeInner },
    "assembly-utils/Fork": { getComponent: Fork },
    "assembly-utils/ExtractField": { getComponent: ExtractField },
    "assembly-utils/CollectFields": { getComponent: CollectFields },
  });
  return { list, get: async (name) => list()[name] };
}

/**
 * @param {import("../src/lib/InternalSocket.js").InternalSocket} socket
 * @param {string} scope
 * @param {any} payload
 * @returns {void}
 */
function sendBracketed(socket, scope, payload) {
  socket.post(new IP("openBracket", scope, { scope }), false);
  socket.post(new IP("data", payload, { scope }), false);
  socket.post(new IP("closeBracket", scope, { scope }), false);
}

/**
 * One randomized run: build the wrapped adapter, race a bracket-framed
 * standing config against a staggered (or burst) message schedule,
 * assert every message renders, then drive both inputs to EOT and
 * assert the closedown cascade completes.
 *
 * @param {number} run
 * @param {number} messageCount
 * @param {boolean} burst
 * @param {boolean} doubleConfig
 * @returns {Promise<{ dropped: number, closedDown: boolean }>}
 */
async function runOnce(run, messageCount, burst, doubleConfig) {
  const wrapped = wrapAssembly(makeRegistry(), {
    libraries: [{ library: "test" }],
  });
  assert.deepEqual(wrapped.skips, [], "the inner must wrap cleanly");
  const loader = new noflo.ComponentLoader({ registry: wrapped });
  const instance = /** @type {any} */ (
    await loader.load("test/RenderAssembly")
  );
  await instance.prepared;

  const msgSocket = new noflo.internalSocket.InternalSocket({});
  const configSocket = new noflo.internalSocket.InternalSocket({});
  const outSocket = new noflo.internalSocket.InternalSocket({});
  instance.inPorts.msg.attach(msgSocket);
  instance.inPorts.includes.attach(configSocket);
  instance.outPorts.out.attach(outSocket);

  const received = [];
  outSocket.addEventListener("ip", (event) => {
    if (event.detail.type === "data") {
      received.push(event.detail.data?.data ?? null);
    }
  });

  const sends = [
    {
      at: burst ? 0 : Math.random() * 25,
      go: () => {
        configSocket.post(new IP("openBracket", "corpus"), false);
        configSocket.post(new IP("data", `corpus-${run}`), false);
        configSocket.post(new IP("closeBracket", "corpus"), false);
      },
    },
  ];
  for (let i = 0; i < messageCount; i += 1) {
    sends.push({
      at: burst ? 0 : Math.random() * 25,
      go: () =>
        sendBracketed(msgSocket, `msg-${run}-${i}`, {
          data: `page-${run}-${i}`,
          variables: `vars-${run}-${i}`,
        }),
    });
  }
  if (doubleConfig) {
    sends.push({
      at: 15,
      go: () => {
        configSocket.post(new IP("openBracket", "corpus2"), false);
        configSocket.post(new IP("data", `corpus2-${run}`), false);
        configSocket.post(new IP("closeBracket", "corpus2"), false);
      },
    });
  }
  sends.sort((a, b) => a.at - b.at);

  const start = Date.now();
  let last = 0;
  await new Promise((resolveSchedule) => {
    const step = () => {
      const now = Date.now() - start;
      while (last < sends.length && sends[last].at <= now) {
        sends[last].go();
        last += 1;
      }
      if (last < sends.length) {
        setTimeout(step, Math.max(1, sends[last].at - now));
      } else {
        resolveSchedule();
      }
    };
    step();
  });

  const deadline = Date.now() + 5000;
  while (received.length < messageCount && Date.now() < deadline) {
    await setImmediateP();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(
    received.length,
    messageCount,
    `run ${run}: ${messageCount - received.length} messages dropped silently`,
  );
  assert.deepEqual(
    received.slice().sort(),
    Array.from({ length: messageCount }, (_, i) => `page-${run}-${i}`).sort(),
    `run ${run}: the delivered set must be complete`,
  );

  // Terminal EOT on both inputs: the closedown cascade must complete
  // (work document #45)
  msgSocket.disconnect();
  configSocket.disconnect();
  const closeDeadline = Date.now() + 3000;
  while (!instance.isClosedDown() && Date.now() < closeDeadline) {
    await setImmediateP();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(
    instance.isClosedDown(),
    `run ${run}: the wrapped adapter did not close down after EOT`,
  );
  return { dropped: messageCount - received.length, closedDown: true };
}

describe("work document #48 anomaly stress", () => {
  it("delivers every scoped message under randomized staggered arrivals", {
    timeout: RUNS * 500 + 20000,
  }, async () => {
    for (let run = 1; run <= RUNS; run += 1) {
      await runOnce(run, MESSAGES, false, false);
    }
  });

  it("delivers every scoped message under an all-at-once burst", {
    timeout: RUNS * 500 + 20000,
  }, async () => {
    for (let run = 1; run <= RUNS; run += 1) {
      await runOnce(run, MESSAGES, true, false);
    }
  });

  it("delivers every scoped message with a re-registered standing config mid-burst", {
    timeout: RUNS * 500 + 20000,
  }, async () => {
    for (let run = 1; run <= RUNS; run += 1) {
      await runOnce(run, MESSAGES, false, true);
    }
  });
});
