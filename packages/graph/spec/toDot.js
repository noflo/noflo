import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toDOT } from "../src/index.js";

/** Canonical fixture: the full surface. */
function canonical() {
  return {
    name: "main",
    nodes: [
      { entity_id: "Split", component: "example/SplitAssemblies" },
      { entity_id: "Order", component: "example/Order" },
    ],
    edges: [
      {
        entity_id: "e1",
        from: { node: "Order", port: "out" },
        to: { node: "Split", port: "in" },
      },
    ],
    iips: [
      {
        entity_id: "i1",
        from: { data: "hello.txt" },
        to: { node: "Order", port: "in" },
      },
    ],
    exports: [
      {
        entity_id: "x1",
        direction: "inport",
        internal: { node: "Order", port: "in" },
        public: "IN",
      },
      {
        entity_id: "x2",
        direction: "outport",
        internal: { node: "Split", port: "b" },
        public: "OUT",
      },
    ],
    groups: [{ entity_id: "g1", name: "production", nodes: ["Order"] }],
  };
}

describe("toDOT", () => {
  it("renders nodes with component labels and edges with port labels", () => {
    const dot = toDOT(canonical());
    assert.match(dot, /digraph \{/);
    assert.match(dot, /"Order" \[label="Order\\n\(example\/Order\)"/);
    assert.match(dot, /"Order" -> "Split" \[label="out -> in"\];/);
  });

  it("renders exports as dashed cds-shaped boundary nodes", () => {
    const dot = toDOT(canonical());
    assert.match(dot, /"in:IN" \[label="IN: in", shape=cds\]/);
    assert.match(dot, /"in:IN" -> "Order" \[style=dashed/);
    assert.match(dot, /"Split" -> "out:OUT" \[style=dashed/);
  });

  it("renders IIPs as note-shaped nodes carrying the data", () => {
    const dot = toDOT(canonical());
    assert.match(dot, /shape=note/);
    // The JSON-serialized data appears with DOT-escaped quotes
    assert.match(dot, /label="\\"hello\.txt\\""/);
  });

  it("renders groups as clusters", () => {
    const dot = toDOT(canonical());
    assert.match(dot, /subgraph cluster_\d+ \{/);
    assert.match(dot, /label="production"/);
    assert.match(dot, / {4}"Order";/);
  });

  it("escapes quotes and backslashes in labels", () => {
    const dot = toDOT({
      nodes: [{ entity_id: 'N", x=1', component: "Comp\\Weird" }],
      edges: [],
      iips: [],
      exports: [],
      groups: [],
    });
    assert.match(dot, /"N\\", x=1"/);
    assert.match(dot, /Comp\\\\Weird/);
  });

  it("is deterministic", () => {
    assert.equal(toDOT(canonical()), toDOT(canonical()));
  });

  it("emits an empty digraph for an empty graph", () => {
    const dot = toDOT({
      nodes: [],
      edges: [],
      iips: [],
      exports: [],
      groups: [],
    });
    assert.equal(dot, "digraph {\n  rankdir=LR;\n}\n");
  });
});
