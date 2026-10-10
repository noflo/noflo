import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateExpectStep,
  evaluatePacket,
  extractMatches,
  findOperator,
} from "../src/assertions.js";

describe("fbp-spec expectation operators", () => {
  it("equals is deep equality", () => {
    evaluatePacket({ a: [1, 2] }, { equals: { a: [1, 2] } }, "out");
    assert.throws(
      () => evaluatePacket({ a: 1 }, { equals: { a: 2 } }, "out"),
      /deep equality/,
    );
  });
  it("above and below compare any ordered values", () => {
    evaluatePacket(5, { above: 4 }, "out");
    evaluatePacket(5, { below: 6 }, "out");
    evaluatePacket("b", { above: "a" }, "out");
    assert.throws(() => evaluatePacket(5, { above: 5 }, "out"), /above/);
    assert.throws(() => evaluatePacket("x", { above: 1 }, "out"), /above/);
  });
  it("type understands chai-style names including array and null", () => {
    // Matches the released fbp-spec's chai a() semantics. The unreleased
    // ESM rewrite switched to typeof, which is an upstream regression.
    evaluatePacket([1], { type: "array" }, "out");
    evaluatePacket(null, { type: "null" }, "out");
    evaluatePacket(new Date(), { type: "date" }, "out");
    evaluatePacket(/fbp/, { type: "regexp" }, "out");
    evaluatePacket("x", { type: "string" }, "out");
    evaluatePacket(1, { type: "number" }, "out");
    assert.throws(() => evaluatePacket(null, { type: "object" }, "out"));
  });
  it("haveKeys requires the exact key set", () => {
    evaluatePacket({ a: 1, b: 2 }, { haveKeys: ["b", "a"] }, "out");
    assert.throws(
      () =>
        evaluatePacket({ a: 1, b: 2, c: 3 }, { haveKeys: ["a", "b"] }, "out"),
      /have keys/,
    );
  });
  it("haveKeys takes keys from any value without an upfront type check", () => {
    evaluatePacket(null, { haveKeys: [] }, "out");
    assert.throws(
      () => evaluatePacket(null, { haveKeys: ["a"] }, "out"),
      /have keys/,
    );
    evaluatePacket(42, { haveKeys: [] }, "out");
    assert.throws(
      () => evaluatePacket("ab", { haveKeys: ["a"] }, "out"),
      /have keys/,
    );
  });
  it("includeKeys requires at least these keys", () => {
    evaluatePacket({ a: 1, b: 2 }, { includeKeys: ["a"] }, "out");
    assert.throws(
      () => evaluatePacket({ a: 1 }, { includeKeys: ["z"] }, "out"),
      /include key z/,
    );
  });
  it("includeKeys takes keys from any value without an upfront type check", () => {
    evaluatePacket(42, { includeKeys: [] }, "out");
    assert.throws(
      () => evaluatePacket(42, { includeKeys: ["a"] }, "out"),
      /include key a/,
    );
  });
  it("contains works on strings and arrays", () => {
    evaluatePacket("hello world", { contains: "world" }, "out");
    evaluatePacket([1, 2, 3], { contains: 2 }, "out");
    assert.throws(() => evaluatePacket("nope", { contains: "x" }, "out"));
    assert.throws(() => evaluatePacket([1, 2, 3], { contains: "2" }, "out"));
  });
  it("contains matches array members with deep equality", () => {
    evaluatePacket([{ a: 1 }, { b: 2 }], { contains: { a: 1 } }, "out");
    assert.throws(
      () => evaluatePacket([{ a: 1 }], { contains: { a: 2 } }, "out"),
      /to contain/,
    );
  });
  it("contains matches objects as a deep-equal subset", () => {
    evaluatePacket({ a: 1, b: 2 }, { contains: { a: 1 } }, "out");
    evaluatePacket({ a: [1, 2] }, { contains: { a: [1, 2] } }, "out");
    assert.throws(
      () => evaluatePacket({ a: 1 }, { contains: { c: 3 } }, "out"),
      /to contain/,
    );
    assert.throws(
      () => evaluatePacket({ a: 1 }, { contains: { a: 2 } }, "out"),
      /to contain/,
    );
  });
  it("contains fails on values it cannot check", () => {
    assert.throws(
      () => evaluatePacket(42, { contains: "a" }, "out"),
      /cannot check contains/,
    );
    assert.throws(
      () => evaluatePacket(null, { contains: "a" }, "out"),
      /cannot check contains/,
    );
  });
  it("noterror passes non-errors and throws error-like values", () => {
    evaluatePacket("ok", { noterror: null }, "out");
    evaluatePacket(undefined, { noterror: null }, "out");
    const err = new Error("boom");
    assert.throws(() => evaluatePacket(err, { noterror: null }, "out"), /boom/);
  });
  it("unknown operator errors with the available list", () => {
    assert.throws(
      () => findOperator({ frobnicate: 1 }),
      /No operator matching frobnicate/,
    );
  });
  it("path requires at least one match", () => {
    assert.deepEqual(extractMatches({ path: "$.a" }, { a: 1 }), [1]);
    assert.throws(
      () => extractMatches({ path: "$.b" }, { a: 1 }),
      /to match data/,
    );
  });
  it("path checks every match against the operator", () => {
    evaluatePacket(
      {
        users: [
          { name: "a", ok: true },
          { name: "b", ok: true },
        ],
      },
      { path: "$.users[?(@.ok==true)].name", type: "string" },
      "out",
    );
    // One non-matching member fails the whole expectation
    assert.throws(
      () =>
        evaluatePacket(
          {
            users: [
              { name: "a", ok: true },
              { name: 42, ok: true },
            ],
          },
          { path: "$.users[?(@.ok==true)].name", type: "string" },
          "out",
        ),
      /expected type 'string', got 'number'/,
    );
  });
  it("evaluateExpectStep applies all expectations of a port to one message", () => {
    evaluateExpectStep({ out: [{ above: 1 }, { below: 3 }] }, { out: 2 });
    assert.throws(
      () => evaluateExpectStep({ out: { equals: 1 } }, {}),
      /No data received on port out/,
    );
  });
});
