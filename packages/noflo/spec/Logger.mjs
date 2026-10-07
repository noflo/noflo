import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createDebug } from "../src/lib/logger.js";

describe("native debug logger", () => {
  let originalDebug = null;
  let output = [];

  beforeEach(() => {
    output = [];
    originalDebug = console.error;
    // Node path logs to stderr via console.error
    console.error = (...args) => {
      output.push(args);
    };
  });

  afterEach(() => {
    console.error = originalDebug;
    delete process.env.DEBUG;
  });

  it("is a no-op without a pattern", () => {
    const log = createDebug("noflo:test");
    log("hello");
    assert.deepEqual(output, []);
  });

  it("logs to console with the namespace prefix when enabled", () => {
    process.env.DEBUG = "noflo:test";
    const log = createDebug("noflo:test");
    log("hello", { answer: 42 });
    assert.equal(output.length, 1);
    assert.match(output[0][0], /noflo:test/);
    assert.equal(output[0][1], "hello");
    assert.deepEqual(output[0][2], { answer: 42 });
  });

  it("does not log unrelated namespaces", () => {
    process.env.DEBUG = "noflo:other";
    const log = createDebug("noflo:test");
    log("hello");
    assert.deepEqual(output, []);
  });

  it("supports trailing wildcards", () => {
    process.env.DEBUG = "noflo:*";
    const log = createDebug("noflo:component:send");
    log("hello");
    assert.equal(output.length, 1);
  });

  it("supports bare wildcard", () => {
    process.env.DEBUG = "*";
    const log = createDebug("anything:at:all");
    log("hello");
    assert.equal(output.length, 1);
  });

  it("supports negation overriding an earlier wildcard", () => {
    process.env.DEBUG = "noflo:*,-noflo:component:send";
    const log = createDebug("noflo:component:send");
    log("hello");
    assert.deepEqual(output, []);
    const other = createDebug("noflo:component:brackets");
    other("hello");
    assert.equal(output.length, 1);
  });

  it("lets a later pattern override an earlier negation", () => {
    process.env.DEBUG = "-noflo:*,noflo:component";
    const log = createDebug("noflo:component");
    log("hello");
    assert.equal(output.length, 1);
    output = [];
    const hidden = createDebug("noflo:network");
    hidden("hello");
    assert.deepEqual(output, []);
  });

  it("does not treat pattern metacharacters as regex", () => {
    process.env.DEBUG = "noflo:(test)";
    const log = createDebug("noflo:(test)");
    log("hello");
    assert.equal(output.length, 1);
    output = [];
    const other = createDebug("noflo:test");
    other("hello");
    assert.deepEqual(output, []);
  });

  it("exposes the enabled flag", () => {
    process.env.DEBUG = "noflo:yes";
    assert.equal(createDebug("noflo:yes").enabled, true);
    assert.equal(createDebug("noflo:no").enabled, false);
  });

  it("picks up pattern changes at runtime", () => {
    const log = createDebug("noflo:runtime");
    log("no output yet");
    assert.deepEqual(output, []);
    process.env.DEBUG = "noflo:runtime";
    log("now enabled");
    assert.equal(output.length, 1);
  });

  it("reads the pattern from localStorage when available", () => {
    const originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = {
      /** @param {string} key */
      getItem: (key) => (key === "debug" ? "from-storage" : null),
    };
    try {
      delete process.env.DEBUG;
      const log = createDebug("from-storage");
      log("hello");
      assert.equal(output.length, 1);
    } finally {
      globalThis.localStorage = originalLocalStorage;
    }
  });
});
