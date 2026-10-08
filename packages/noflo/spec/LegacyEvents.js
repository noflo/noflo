//     (c) 2021-2026 Henri Bergius

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Component } from "../src/lib/Component.js";
import { LegacyEventMixin } from "../src/lib/LegacyEvents.js";

describe("LegacyEvents EventTarget support layer", () => {
  it("dispatches DetailEvents to addEventListener listeners", () => {
    const c = new Component();
    let payload = null;
    c.addEventListener("icon", (event) => {
      payload = event.detail;
    });
    c.dispatchLifecycleEvent("icon", "trophy");
    assert.equal(payload, "trophy");
  });

  it("dispatchLifecycleEvent invokes listeners synchronously in registration order", () => {
    const c = new Component();
    const order = [];
    c.addEventListener("activate", () => order.push("first"));
    c.addEventListener("activate", () => order.push("second"));
    c.dispatchLifecycleEvent("activate");
    assert.deepEqual(order, ["first", "second"]);
  });

  it("listener exceptions propagate to the dispatch caller", () => {
    const c = new Component();
    c.addEventListener("process-error", () => {
      throw new Error("escalated");
    });
    assert.throws(
      () => c.dispatchLifecycleEvent("process-error", new Error("escalated")),
      /escalated/,
    );
  });

  it("supports once options, removing the listener after dispatch", () => {
    const c = new Component();
    let calls = 0;
    c.addEventListener(
      "activate",
      () => {
        calls += 1;
      },
      { once: true },
    );
    c.dispatchLifecycleEvent("activate");
    c.dispatchLifecycleEvent("activate");
    assert.equal(calls, 1);
    assert.equal(c.listeners("activate").length, 0);
  });

  it("listeners() reports registrations for the error-escalation contract", () => {
    const c = new Component();
    assert.equal(c.listeners("process-error").length, 0);
    const listener = () => {};
    c.addEventListener("process-error", listener);
    assert.equal(c.listeners("process-error").length, 1);
    c.removeEventListener("process-error", listener);
    assert.equal(c.listeners("process-error").length, 0);
  });

  it("de-duplicates identical listener registrations", () => {
    const c = new Component();
    const listener = () => {};
    c.addEventListener("icon", listener);
    c.addEventListener("icon", listener);
    assert.equal(c.listeners("icon").length, 1);
  });

  it("removeAllListeners clears one type or all types", () => {
    const c = new Component();
    c.addEventListener("icon", () => {});
    c.addEventListener("activate", () => {});
    c.removeAllListeners("icon");
    assert.equal(c.listeners("icon").length, 0);
    assert.equal(c.listeners("activate").length, 1);
    c.removeAllListeners();
    assert.equal(c.listeners("activate").length, 0);
  });

  it("mixes onto arbitrary EventTarget bases", () => {
    class Base extends EventTarget {}
    const Evented = LegacyEventMixin(Base);
    const e = new Evented();
    let payload = null;
    e.addEventListener("custom", (event) => {
      payload = event.detail;
    });
    e.dispatchLifecycleEvent("custom", 1);
    assert.equal(payload, 1);
  });

  it("works on NoFlo components end to end", () => {
    const c = new Component();
    let payload = null;
    c.addEventListener("activate", (event) => {
      payload = event.detail;
    });
    c.dispatchLifecycleEvent("activate", 3);
    assert.equal(payload, 3);
  });
});
