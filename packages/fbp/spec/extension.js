import assert from "node:assert/strict";
import { test } from "node:test";

import { parse } from "../src/index.js";

/**
 * The documented 2.x grammar extension: metadata values may carry `.` and
 * `-` (float and negative coordinates). The reference `fbp` parser rejects
 * these inputs, so they cannot live in the shared parity corpus — the
 * divergence is deliberate and backward compatible: every input the
 * reference accepts parses identically here (covered by parity.js).
 */
test("extension: float metadata coordinates parse to floats", () => {
  const graph = parse("A(x/y:x=10.5,y=-22.5) -> B(b)");
  assert.deepEqual(graph.processes.A.metadata, { x: 10.5, y: -22.5 });
});

test("extension: negative metadata values parse", () => {
  const graph = parse("A(x/y:x=-5) -> B(b)");
  assert.deepEqual(graph.processes.A.metadata, { x: -5 });
});

test("extension: string metadata values with dots and dashes", () => {
  const graph = parse("A(x/y:note=hello-world,ver=1.2) -> B(b)");
  assert.deepEqual(graph.processes.A.metadata, {
    note: "hello-world",
    ver: "1.2",
  });
});

test("extension: integer coordinates still parse as numbers", () => {
  const graph = parse("A(x/y:x=10,y=20) -> B(b)");
  assert.deepEqual(graph.processes.A.metadata, { x: 10, y: 20 });
});

test("reference behavior kept: metadata grammar unchanged otherwise", () => {
  // A value with characters outside the extended grammar still rejects
  assert.throws(() => parse("A(x/y:note=hello world) -> B(b)"));
});
