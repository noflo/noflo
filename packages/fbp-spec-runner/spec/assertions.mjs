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
  it("above and below compare numbers", () => {
    evaluatePacket(5, { above: 4 }, "out");
    evaluatePacket(5, { below: 6 }, "out");
    assert.throws(() => evaluatePacket(5, { above: 5 }, "out"), /above/);
    assert.throws(() => evaluatePacket("x", { above: 1 }, "out"), /above/);
  });
  it("type understands chai-style names including array and null", () => {
    evaluatePacket([1], { type: "array" }, "out");
    evaluatePacket(null, { type: "null" }, "out");
    evaluatePacket("x", { type: "string" }, "out");
    evaluatePacket(1, { type: "number" }, "out");
    assert.throws(() => evaluatePacket(null, { type: "object" }, "out"));
  });
  it("haveKeys requires the exact key set", () => {
    evaluatePacket({ a: 1, b: 2 }, { haveKeys: ["b", "a"] }, "out");
    assert.throws(
      () =>
        evaluatePacket({ a: 1, b: 2, c: 3 }, { haveKeys: ["a", "b"] }, "out"),
      /exactly keys/,
    );
  });
  it("includeKeys requires at least these keys", () => {
    evaluatePacket({ a: 1, b: 2 }, { includeKeys: ["a"] }, "out");
    assert.throws(
      () => evaluatePacket({ a: 1 }, { includeKeys: ["z"] }, "out"),
      /include/,
    );
  });
  it("contains works on strings and arrays", () => {
    evaluatePacket("hello world", { contains: "world" }, "out");
    evaluatePacket([1, 2, 3], { contains: 2 }, "out");
    assert.throws(() => evaluatePacket("nope", { contains: "x" }, "out"));
    assert.throws(() => evaluatePacket({ a: 1 }, { contains: "a" }, "out"));
  });
  it("noterror passes non-errors and throws error-like values", () => {
    evaluatePacket("ok", { noterror: null }, "out");
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
