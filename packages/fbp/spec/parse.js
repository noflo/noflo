//     (c) 2021-2026 Henri Bergius

/**
 * Conformance tests for the .fbp parser: known-good graphs, language
 * features, validation behavior, and error reporting.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

// biome-ignore lint/suspicious/noShadowRestrictedNames: mirrors the reference `fbp` parser API
import { parse, SyntaxError } from "../src/index.js";

test("parses a simple IIP graph", () => {
  const graph = parse("'Hello' -> IN Display(Output)", {
    caseSensitive: false,
  });
  assert.deepStrictEqual(graph, {
    inports: {},
    outports: {},
    groups: [],
    processes: {
      Display: { component: "Output" },
    },
    connections: [{ data: "Hello", tgt: { process: "Display", port: "in" } }],
    caseSensitive: false,
  });
});

test("parses a chain into ordered edges", () => {
  const graph = parse(
    "Read(ReadFile) DATA -> IN Split(SplitStr) -> Display(Output)",
    { caseSensitive: false },
  );
  assert.deepStrictEqual(graph.connections, [
    {
      src: { process: "Read", port: "data" },
      tgt: { process: "Split", port: "in" },
    },
    {
      src: { process: "Split", port: "out" },
      tgt: { process: "Display", port: "in" },
    },
  ]);
});

test("gives anonymous nodes unique names", () => {
  const graph = parse("A(a) -> (core/Repeat) -> C(c)");
  const names = Object.keys(graph.processes);
  assert.equal(names.length, 3);
  const anonymous = names.filter((name) => name.startsWith("_core_Repeat"));
  assert.equal(anonymous.length, 1);
  assert.equal(graph.processes[anonymous[0]].component, "core/Repeat");
});

test("numbers anonymous nodes per component", () => {
  const graph = parse("A(a) -> (x/y) -> B(b)\n(x/y) -> C(c)");
  const anonymous = Object.keys(graph.processes).filter((name) =>
    name.startsWith("_x_y"),
  );
  assert.deepEqual(anonymous.sort(), ["_x_y_1", "_x_y_2"]);
});

test("uses default port names", () => {
  const graph = parse("A(a) -> B(b)", { caseSensitive: false });
  assert.deepStrictEqual(graph.connections, [
    { src: { process: "A", port: "out" }, tgt: { process: "B", port: "in" } },
  ]);
});

test("honors DEFAULT_INPORT and DEFAULT_OUTPORT", () => {
  const graph = parse(
    "DEFAULT_INPORT=Data\nDEFAULT_OUTPORT=Res\n'x' -> B(b)\nB(b) -> C(c)",
    { caseSensitive: true },
  );
  assert.deepStrictEqual(graph.connections, [
    { data: "x", tgt: { process: "B", port: "Data" } },
    { src: { process: "B", port: "Res" }, tgt: { process: "C", port: "Data" } },
  ]);
});

test("lowercases default port overrides unless case-sensitive", () => {
  const graph = parse("DEFAULT_INPORT=Data\nA(a) -> B(b)", {
    caseSensitive: false,
  });
  assert.equal(graph.connections[0].tgt.port, "data");
});

test("exports ports", () => {
  const graph = parse(
    "INPORT=Read.IN:input\nOUTPORT=Display.OUT:output\nRead(ReadFile) OUT -> IN Display(Output)",
    { caseSensitive: true },
  );
  assert.deepStrictEqual(graph.inports, {
    input: { process: "Read", port: "IN" },
  });
  assert.deepStrictEqual(graph.outports, {
    output: { process: "Display", port: "OUT" },
  });
});

test("collects annotations as properties", () => {
  const graph = parse("# @runtime noflo\n# @icon file\nA(a) -> B(b)");
  assert.deepStrictEqual(graph.properties, {
    environment: { type: "noflo" },
    icon: "file",
  });
});

test("annotation values keep trailing whitespace", () => {
  const graph = parse("A(a) -> B(b)\n# @icon file  \n");
  assert.equal(graph.properties.icon, "file  ");
});

test("parses port indexes", () => {
  const graph = parse("A(a) OUT[0] -> IN[1] B(b)", { caseSensitive: false });
  assert.deepStrictEqual(graph.connections, [
    {
      src: { process: "A", port: "out", index: 0 },
      tgt: { process: "B", port: "in", index: 1 },
    },
  ]);
});

test("parses JSON IIPs into values", () => {
  const graph = parse('{ "a": 1, "b": [true, null] } -> IN Display(Output)', {
    caseSensitive: false,
  });
  assert.deepStrictEqual(graph.connections, [
    {
      data: { a: 1, b: [true, null] },
      tgt: { process: "Display", port: "in" },
    },
  ]);
});

test("unescapes only quotes in quoted IIPs", () => {
  const graph = parse("'a\\'b\\\\c' -> IN Display(Output)");
  assert.equal(graph.connections[0].data, "a'b\\\\c");
});

test("coerces x and y metadata to numbers", () => {
  const graph = parse("A(x/y:x=10,y=20) -> B(b)");
  assert.deepStrictEqual(graph.processes.A, {
    component: "x/y",
    metadata: { x: 10, y: 20 },
  });
});

test("stores bare metadata under the routes key", () => {
  const graph = parse("A(x/y:debug) -> B(b)");
  assert.deepStrictEqual(graph.processes.A.metadata, { routes: "debug" });
});

test("last component declaration wins", () => {
  const graph = parse("A(a) -> A(b)");
  assert.equal(graph.processes.A.component, "b");
});

test("empty redeclaration keeps the earlier component", () => {
  const graph = parse("A(a) -> B(b)\nA() -> B(b)");
  assert.equal(graph.processes.A.component, "a");
});

test("defaults to case-sensitive ports", () => {
  const graph = parse("A(a) OUT -> IN B(b)");
  assert.equal(graph.caseSensitive, true);
  assert.equal(graph.connections[0].src.port, "OUT");
  assert.equal(graph.connections[0].tgt.port, "IN");
});

test("reflects an explicit caseSensitive value in the output", () => {
  assert.equal(
    parse("A(a) -> B(b)", { caseSensitive: false }).caseSensitive,
    false,
  );
  assert.equal(
    parse("A(a) -> B(b)", { caseSensitive: true }).caseSensitive,
    true,
  );
});

test("skips validateContents when disabled", () => {
  const graph = parse("A() -> B(b)", { validateContents: false });
  assert.deepStrictEqual(graph.processes.A, {});
});

test("reports missing components", () => {
  assert.throws(
    () => parse("A() -> B(b)"),
    /Node "A" does not have a component defined/,
  );
});

test("reports inports pointing at undefined nodes", () => {
  assert.throws(
    () => parse("INPORT=A.IN:in\nA -> B(b)"),
    /Inport "in" is connected to an undefined target node "A"/,
  );
});

test("reports outports pointing at undefined nodes", () => {
  assert.throws(
    () => parse("OUTPORT=A.OUT:out\nA -> B(b)", { caseSensitive: false }),
    /Outport "out" is connected to an undefined source node "A"/,
  );
});

test("reports IIPs pointing at undefined nodes", () => {
  assert.throws(
    () => parse("'x' -> IN B", { caseSensitive: false }),
    /IIP containing "x" is connected to an undefined target node "B"/,
  );
});

test("reports edges pointing at undefined nodes", () => {
  assert.throws(
    () => parse("A(a) -> B", { caseSensitive: false }),
    /Edge from "A" port "out" is connected to an undefined target node "B"/,
  );
});

test("throws SyntaxError with location on trailing garbage", () => {
  try {
    parse("A(a) -> B(b)\n~~~");
    assert.fail("should have thrown");
  } catch (error) {
    assert.ok(error instanceof SyntaxError);
    assert.ok(error.location.start.line >= 1);
    assert.ok(error.location.start.column >= 1);
    assert.equal(typeof error.location.start.offset, "number");
  }
});

test("rejects input that is not fully consumed", () => {
  assert.throws(() => parse("A(a) -> B(b)\nGARBAGE ~~~"), SyntaxError);
});

test("treats true, false, and null as node names at source position", () => {
  // Reference-parser compatibility quirk: only JSON values that cannot start
  // a node name reach the IIP alternative.
  const graph = parse("true -> IN B(b)", {
    caseSensitive: false,
    validateContents: false,
  });
  assert.deepStrictEqual(graph.connections[0].src, {
    process: "true",
    port: "out",
  });
});

test("parses the empty program", () => {
  const graph = parse("");
  assert.deepStrictEqual(graph, {
    inports: {},
    outports: {},
    groups: [],
    processes: {},
    connections: [],
    caseSensitive: true,
  });
});
