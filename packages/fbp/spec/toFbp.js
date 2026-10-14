import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse, toFBP } from "../src/index.js";

/** Canonical fixture: the full DSL surface. */
function canonical() {
  return {
    name: "main",
    nodes: [
      { entity_id: "Read", component: "ReadFile" },
      { entity_id: "Write", component: "WriteFile" },
      { entity_id: "Other", component: "OtherComp" },
      { entity_id: "Idle", component: "IdleComp" },
    ],
    edges: [
      {
        entity_id: "e1",
        from: { node: "Read", port: "out" },
        to: { node: "Write", port: "in", index: 0 },
      },
      {
        entity_id: "e2",
        from: { node: "Read", port: "out" },
        to: { node: "Other", port: "in", index: 1 },
      },
    ],
    iips: [
      {
        entity_id: "i1",
        from: { data: "hello.txt" },
        to: { node: "Read", port: "in" },
      },
      {
        entity_id: "i2",
        from: { data: 42 },
        to: { node: "Write", port: "in" },
      },
    ],
    exports: [
      {
        entity_id: "x1",
        direction: "inport",
        internal: { node: "Read", port: "in" },
        public: "read",
      },
      {
        entity_id: "x2",
        direction: "outport",
        internal: { node: "Write", port: "out" },
        public: "written",
      },
    ],
    groups: [],
  };
}

describe("toFBP", () => {
  it("round-trips nodes, edges, IIPs, and exports through parse", () => {
    const source = toFBP(canonical());
    const parsed = parse(source);

    // Components
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(parsed.processes).map(([k, v]) => [k, v.component]),
      ),
      {
        Read: "ReadFile",
        Write: "WriteFile",
        Other: "OtherComp",
        Idle: "IdleComp",
      },
    );

    // Edges with port indexes
    const edges = parsed.connections.filter((c) => c.src);
    assert.equal(edges.length, 2);
    assert.deepEqual(
      edges.map((e) => [e.src.process, e.tgt.process, e.tgt.index]),
      [
        ["Read", "Write", 0],
        ["Read", "Other", 1],
      ],
    );

    // IIPs
    const iips = parsed.connections.filter((c) => c.data !== undefined);
    assert.deepEqual(
      iips.map((e) => [e.data, e.tgt.process]),
      [
        ["hello.txt", "Read"],
        [42, "Write"],
      ],
    );

    // Exports
    assert.deepEqual(parsed.inports.read, { process: "Read", port: "in" });
    assert.deepEqual(parsed.outports.written, {
      process: "Write",
      port: "out",
    });
  });

  it("escapes single quotes in string IIPs", () => {
    const source = toFBP({
      nodes: [{ entity_id: "N", component: "Comp" }],
      edges: [],
      iips: [
        {
          entity_id: "i1",
          from: { data: "it's here" },
          to: { node: "N", port: "in" },
        },
      ],
      exports: [],
    });
    assert.match(source, /'it\\'s here'/);
    const parsed = parse(source);
    assert.equal(parsed.connections[0].data, "it's here");
  });

  it("renders x/y metadata and drops non-expressible values", () => {
    const source = toFBP({
      nodes: [
        {
          entity_id: "N",
          component: "Comp",
          metadata: { x: 10, y: 22, note: "hello", nested: { a: 1 } },
        },
      ],
      edges: [],
      iips: [],
      exports: [],
    });
    assert.equal(source.trim(), "N(Comp:note=hello,x=10,y=22)");
    const parsed = parse(source);
    assert.deepEqual(parsed.processes.N.metadata, {
      x: 10,
      y: 22,
      note: "hello",
    });
  });

  it("round-trips float coordinates through the extended grammar", () => {
    const source = toFBP({
      nodes: [
        {
          entity_id: "N",
          component: "Comp",
          metadata: { x: 10.5, y: -22.5 },
        },
      ],
      edges: [],
      iips: [],
      exports: [],
    });
    assert.equal(source.trim(), "N(Comp:x=10.5,y=-22.5)");
    const parsed = parse(source);
    assert.deepEqual(parsed.processes.N.metadata, { x: 10.5, y: -22.5 });
  });

  it("renders deterministically", () => {
    const a = toFBP(canonical());
    const b = toFBP(canonical());
    assert.equal(a, b);
  });

  it("emits an empty string for an empty graph", () => {
    assert.equal(toFBP({ nodes: [], edges: [], iips: [], exports: [] }), "");
  });

  it("rejects non-JSON-able IIP data", () => {
    assert.throws(
      () =>
        toFBP({
          nodes: [{ entity_id: "N", component: "Comp" }],
          edges: [],
          iips: [
            {
              entity_id: "i1",
              from: { data: undefined },
              to: { node: "N", port: "in" },
            },
          ],
          exports: [],
        }),
      /JSON-able/,
    );
  });
});
