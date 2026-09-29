import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Component } from "../src/lib/Component.js";
import { LegacyEventMixin } from "../src/lib/LegacyEvents.js";

describe("LegacyEvents EventTarget compatibility layer", () => {
  it("on() and addEventListener() work interchangeably on the same instance", () => {
    const c = new Component();
    const received = { legacy: null, native: null };
    c.on("icon", (icon) => {
      received.legacy = icon;
    });
    c.addEventListener("icon", (event) => {
      received.native = event.detail;
    });
    c.dispatchLifecycleEvent("icon", "trophy");
    assert.equal(received.legacy, "trophy");
    assert.equal(received.native, "trophy");
  });

  it("legacy handlers receive the event detail as a single argument", () => {
    const c = new Component();
    let payload = null;
    c.on("activate", (load) => {
      payload = load;
    });
    c.dispatchLifecycleEvent("activate", 3);
    assert.equal(payload, 3);
  });

  it("once() handlers fire exactly once", () => {
    const c = new Component();
    let calls = 0;
    c.once("start", () => {
      calls += 1;
    });
    c.dispatchLifecycleEvent("start");
    c.dispatchLifecycleEvent("start");
    assert.equal(calls, 1);
  });

  it("off()/removeListener() remove the legacy registration only", () => {
    const c = new Component();
    let legacyCalls = 0;
    let nativeCalls = 0;
    const handler = () => {
      legacyCalls += 1;
    };
    c.on("end", handler);
    c.addEventListener("end", () => {
      nativeCalls += 1;
    });
    c.removeListener("end", handler);
    c.dispatchLifecycleEvent("end");
    assert.equal(legacyCalls, 0);
    assert.equal(nativeCalls, 1);
  });

  it("removeEventListener() also removes listeners added via on()", () => {
    const c = new Component();
    let calls = 0;
    const handler = () => {
      calls += 1;
    };
    c.on("end", handler);
    // Remove via the native API using the internal wrapper
    const wrapper = c.listeners("end")[0];
    assert.ok(wrapper);
    c.removeEventListener("end", wrapper);
    c.dispatchLifecycleEvent("end");
    assert.equal(calls, 0);
  });

  it("listeners() counts registrations from both APIs", () => {
    const c = new Component();
    assert.equal(c.listeners("icon").length, 0);
    c.on("icon", () => {});
    assert.equal(c.listeners("icon").length, 1);
    c.addEventListener("icon", () => {});
    assert.equal(c.listeners("icon").length, 2);
  });

  it("deprecation warnings fire once per method and event type", async () => {
    const c = new Component();
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => {
      warnings.push(String(message));
    };
    try {
      c.on("custom", () => {});
      c.on("custom", () => {});
      c.once("custom", () => {});
      c.emit("custom", 1);
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(
      warnings.filter((w) => /'on' \(EventEmitter API\) for 'custom'/.test(w))
        .length,
      1,
    );
    assert.equal(
      warnings.filter((w) => /'once' \(EventEmitter API\) for 'custom'/.test(w))
        .length,
      1,
    );
    assert.equal(
      warnings.filter((w) => /'emit' \(EventEmitter API\) for 'custom'/.test(w))
        .length,
      1,
    );
    assert.equal(warnings.length, 3);
  });

  it("dispatchLifecycleEvent() does not warn", () => {
    const c = new Component();
    const originalWarn = console.warn;
    /** @type {string[]} */ const warnings = [];
    console.warn = (message) => {
      warnings.push(String(message));
    };
    try {
      c.dispatchLifecycleEvent("other", 1);
      c.dispatchLifecycleEvent("other", 2);
    } finally {
      console.warn = originalWarn;
    }
    assert.deepEqual(warnings, []);
  });

  it("the mixin can be applied to other EventTarget-derived classes", () => {
    class Custom extends LegacyEventMixin(class extends EventTarget {}) {}
    const instance = new Custom();
    let value = null;
    instance.on("thing", (v) => {
      value = v;
    });
    instance.dispatchLifecycleEvent("thing", 42);
    assert.equal(value, 42);
    assert.ok(instance instanceof EventTarget);
  });

  it("components dispatch icon events usable via both APIs", () => {
    const c = new Component();
    let viaLegacy = null;
    let viaNative = null;
    c.on("icon", (icon) => {
      viaLegacy = icon;
    });
    c.addEventListener("icon", (event) => {
      viaNative = /** @type {any} */ (event).detail;
    });
    c.setIcon("smile");
    assert.equal(viaLegacy, "smile");
    assert.equal(viaNative, "smile");
  });

  it("listener exceptions propagate synchronously to the dispatcher", () => {
    const c = new Component();
    c.addEventListener("boom", () => {
      throw new Error("listener exploded");
    });
    assert.throws(
      () => c.dispatchLifecycleEvent("boom", 1),
      /listener exploded/,
    );
  });

  it("on()/once() reject non-function handlers like EventEmitter", () => {
    const c = new Component();
    assert.throws(() => c.on("data", "not-a-function"), /must be a function/);
    assert.throws(() => c.once("data", "not-a-function"), /must be a function/);
  });

  it("addEventListener honors the once option", () => {
    const c = new Component();
    let calls = 0;
    c.addEventListener(
      "end",
      () => {
        calls += 1;
      },
      { once: true },
    );
    c.dispatchLifecycleEvent("end");
    c.dispatchLifecycleEvent("end");
    assert.equal(calls, 1);
    assert.equal(c.listeners("end").length, 0);
  });

  it("legacy handlers are called with the emitter as this", () => {
    const c = new Component();
    let context = null;
    c.on("activate", function onActivate() {
      context = this;
    });
    c.dispatchLifecycleEvent("activate", 1);
    assert.strictEqual(context, c);
  });

  it("removeAllListeners clears one type or everything", () => {
    const c = new Component();
    let calls = 0;
    c.on("end", () => {
      calls += 1;
    });
    c.addEventListener("icon", () => {
      calls += 1;
    });
    c.removeAllListeners("end");
    c.dispatchLifecycleEvent("end");
    assert.equal(calls, 0);
    assert.equal(c.listeners("end").length, 0);
    assert.equal(c.listeners("icon").length, 1);
    c.removeAllListeners();
    assert.equal(c.listeners("icon").length, 0);
  });

  it("emit('error') with no listener throws, like EventEmitter", () => {
    const c = new Component();
    assert.throws(() => c.emit("error", new Error("unhandled")), /unhandled/);
    const seen = [];
    c.on("error", (e) => {
      seen.push(e);
    });
    c.emit("error", new Error("handled"));
    assert.equal(seen.length, 1);
  });

  it("legacy introspection methods work", () => {
    const c = new Component();
    c.on("start", () => {});
    c.addEventListener("icon", () => {});
    assert.equal(c.listenerCount("start"), 1);
    assert.deepEqual(c.eventNames().sort(), ["icon", "start"]);
    assert.equal(c.setMaxListeners(10), c);
    assert.equal(c.rawListeners("start").length, 1);
  });

  it("prependListener runs before regular listeners", () => {
    const c = new Component();
    const order = [];
    c.on("end", () => {
      order.push("regular");
    });
    c.prependListener("end", () => {
      order.push("prepended");
    });
    c.dispatchLifecycleEvent("end");
    assert.deepEqual(order, ["prepended", "regular"]);
  });
});
