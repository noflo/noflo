import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GraphModelError } from "../src/graph/entities.js";
import { exportFbpJson, importFbpJson } from "../src/graph/fbpJson.js";

const SAMPLE = {
  properties: { env: "test" },
  inports: {
    input: { process: "Read", port: "in", schema: { type: "string" } },
  },
  outports: {
    output: { process: "Write", port: "out" },
  },
  groups: [{ name: "all", nodes: ["Read", "Write"] }],
  nodes: [
    { id: "Read", component: "fs/ReadFile", metadata: { x: 1 } },
    { id: "Write", component: "fs/WriteFile" },
  ],
  edges: [
    {
      source: { id: "Read", port: "out" },
      target: { id: "Write", port: "in" },
      metadata: { route: 5 },
    },
  ],
  inits: [{ data: "hello", target: { id: "Read", port: "source" } }],
};

describe("importFbpJson", () => {
  it("imports nodes, edges, IIPs, exports, groups, and properties", () => {
    const model = importFbpJson(SAMPLE);
    assert.equal(model.graphMetadata().env, "test");
    assert.deepEqual(
      model.nodes().map((n) => n.entity_id),
      ["Read", "Write"],
    );
    assert.equal(model.node("Read").component, "fs/ReadFile");
    assert.equal(model.node("Read").metadata.x, 1);
    assert.equal(model.edges().length, 1);
    assert.equal(model.edges()[0].from.node, "Read");
    assert.equal(model.iips().length, 1);
    assert.equal(model.iips()[0].to.port, "source");
    assert.deepEqual(
      model.exports().map((e) => [e.direction, e.public]),
      [
        ["inport", "input"],
        ["outport", "output"],
      ],
    );
    assert.equal(model.exports()[0].metadata.schema.type, "string");
    assert.deepEqual(model.groups()[0].nodes, ["Read", "Write"]);
  });

  it("accepts the legacy `case` alias for IIPs", () => {
    const model = importFbpJson({
      ...SAMPLE,
      inits: undefined,
      case: [{ data: 7, target: { id: "Write", port: "in" } }],
    });
    assert.equal(model.iips().length, 1);
    assert.equal(model.iips()[0].from.data, 7);
  });

  it("rejects nodes without an id", () => {
    assert.throws(
      () => importFbpJson({ nodes: [{ component: "x" }] }),
      GraphModelError,
    );
  });

  it("rejects non-object documents", () => {
    assert.throws(() => importFbpJson([]), GraphModelError);
    assert.throws(() => importFbpJson(null), GraphModelError);
  });
});

describe("legacy NoFlo JSON import", () => {
  it("imports the processes/connections shape", () => {
    const model = importFbpJson({
      properties: { env: "legacy" },
      processes: {
        Read: { component: "fs/ReadFile", metadata: { x: 1 } },
        Write: { component: "fs/WriteFile" },
      },
      connections: [
        {
          src: { process: "Read", port: "out" },
          tgt: { process: "Write", port: "in", index: 2 },
        },
        { data: "hello", tgt: { process: "Read", port: "source" } },
      ],
      inports: { input: { process: "Read", port: "in" } },
      outports: { output: { process: "Write", port: "out" } },
      groups: [{ name: "all", nodes: ["Read", "Write"] }],
    });
    assert.equal(model.graphMetadata().env, "legacy");
    assert.deepEqual(
      model.nodes().map((n) => n.entity_id),
      ["Read", "Write"],
    );
    assert.equal(model.node("Read").metadata.x, 1);
    assert.equal(model.edges().length, 1);
    assert.deepEqual(model.edges()[0].to, {
      node: "Write",
      port: "in",
      index: 2,
    });
    assert.equal(model.iips().length, 1);
    assert.equal(model.exports().length, 2);
    assert.equal(model.groups().length, 1);
  });

  it("rejects malformed legacy connections", () => {
    assert.throws(
      () =>
        importFbpJson({
          processes: { A: { component: "x" } },
          connections: [{ tgt: { process: "A", port: "in" } }],
        }),
      /must have both src and tgt/,
    );
  });
});

describe("exportFbpJson", () => {
  it("exports the standard document shape", () => {
    const model = importFbpJson(SAMPLE);
    const json = exportFbpJson(model);
    assert.deepEqual(json.properties, { env: "test" });
    assert.deepEqual(
      json.nodes.map((n) => n.id),
      ["Read", "Write"],
    );
    assert.deepEqual(json.edges[0].source, { id: "Read", port: "out" });
    assert.deepEqual(json.edges[0].target, { id: "Write", port: "in" });
    assert.deepEqual(json.inits[0].target, { id: "Read", port: "source" });
    assert.deepEqual(Object.keys(json.inports), ["input"]);
    assert.equal(json.inports.input.process, "Read");
    assert.deepEqual(json.groups, [{ name: "all", nodes: ["Read", "Write"] }]);
  });

  it("omits empty collections except properties, nodes, and edges", () => {
    const model = importFbpJson({ properties: {}, nodes: [], edges: [] });
    const json = exportFbpJson(model);
    assert.deepEqual(Object.keys(json), ["properties", "nodes", "edges"]);
  });
});

describe("FBP JSON round-trip", () => {
  it("round-trips array port indices", () => {
    const model = importFbpJson(SAMPLE);
    model.addEdge({
      from: { node: "Read", port: "out", index: 2 },
      to: { node: "Write", port: "in", index: 1 },
    });
    const json = exportFbpJson(model);
    assert.deepEqual(json.edges.at(-1).source, {
      id: "Read",
      port: "out",
      index: 2,
    });
    assert.deepEqual(json.edges.at(-1).target, {
      id: "Write",
      port: "in",
      index: 1,
    });
    const rebuilt = importFbpJson(json);
    assert.deepEqual(rebuilt.edges().at(-1).from, {
      node: "Read",
      port: "out",
      index: 2,
    });
    assert.deepEqual(rebuilt.edges().at(-1).to, {
      node: "Write",
      port: "in",
      index: 1,
    });
  });

  it("export → import → export is stable", () => {
    const model = importFbpJson(SAMPLE);
    const first = exportFbpJson(model);
    const second = exportFbpJson(importFbpJson(first));
    assert.deepEqual(second, first);
  });

  it("import → export → import yields the same canonical model", () => {
    const model = importFbpJson(SAMPLE);
    const rebuilt = importFbpJson(exportFbpJson(model));
    assert.equal(rebuilt.canonicalString(), model.canonicalString());
  });
});

// The caseSensitive normalization (work document #15): legacy documents
// fold port names to lowercase across edges, IIPs, and exports — into a
// fresh document, never rewriting the caller's object. Port values must
// be strings: the normalization does not coerce. Case collisions on
// exports throw rather than silently dropping one.
describe("caseSensitive normalization", () => {
  const legacyDoc = () => ({
    caseSensitive: false,
    processes: { n: { component: "x" } },
    connections: [
      {
        src: { process: "n", port: "OutString" },
        tgt: { process: "n", port: "InString" },
      },
      { data: "legacy", tgt: { process: "n", port: "InString" } },
    ],
    inports: { InString: { process: "n", port: "InString" } },
    outports: { OutString: { process: "n", port: "OutString" } },
  });

  it("folds edge, IIP, and export port names to lowercase", () => {
    const graph = importFbpJson(legacyDoc());
    const edge = graph.edges()[0];
    assert.equal(edge.from.port, "outstring");
    assert.equal(edge.to.port, "instring");
    assert.equal(graph.iips()[0].to.port, "instring");
    const inExport = graph.exports().find((e) => e.direction === "inport");
    assert.equal(inExport.public, "instring");
    assert.equal(inExport.internal.port, "instring");
    const outExport = graph.exports().find((e) => e.direction === "outport");
    assert.equal(outExport.public, "outstring");
    assert.equal(outExport.internal.port, "outstring");
  });

  it("does not mutate the caller's document", () => {
    const doc = legacyDoc();
    doc.inits = [{ data: "v", target: { id: "n", port: "InString" } }];
    importFbpJson(doc);
    // The caller's collections are untouched
    assert.equal(doc.connections[0].src.port, "OutString");
    assert.equal(doc.connections[0].tgt.port, "InString");
    assert.equal(doc.connections[1].tgt.port, "InString");
    assert.equal(doc.inits[0].target.port, "InString");
    assert.deepEqual(Object.keys(doc.inports), ["InString"]);
    assert.deepEqual(Object.keys(doc.outports), ["OutString"]);
  });

  it("does not mutate the caller's modern-shape document either", () => {
    // The modern path is where the round-2 mutation actually bit:
    // normalizeLegacyFbpJson returns the input object itself for
    // canonical documents, so the fold must build its fresh view from
    // that identity — and the caller's object must survive
    const doc = {
      caseSensitive: false,
      nodes: [{ id: "n", component: "x" }],
      edges: [
        {
          source: { id: "n", port: "OutString" },
          target: { id: "n", port: "InString" },
        },
      ],
      inits: [{ data: "v", target: { id: "n", port: "InString" } }],
      inports: { InString: { process: "n", port: "InString" } },
      outports: { OutString: { process: "n", port: "OutString" } },
    };
    importFbpJson(doc);
    assert.equal(doc.edges[0].source.port, "OutString");
    assert.equal(doc.edges[0].target.port, "InString");
    assert.equal(doc.inits[0].target.port, "InString");
    assert.deepEqual(Object.keys(doc.inports), ["InString"]);
    assert.deepEqual(Object.keys(doc.outports), ["OutString"]);
  });

  it("carries top-level inits and case through normalization", () => {
    // A modern document with a top-level inits field: the field must
    // survive normalizeLegacyFbpJson, or its IIPs vanish
    const graph = importFbpJson({
      caseSensitive: false,
      nodes: [{ id: "n", component: "x" }],
      inits: [{ data: "v", target: { id: "n", port: "InString" } }],
    });
    assert.equal(graph.iips()[0].to.port, "instring");
    const legacyCase = importFbpJson({
      caseSensitive: false,
      nodes: [{ id: "n", component: "x" }],
      case: [{ data: "v", target: { id: "n", port: "InString" } }],
    });
    assert.equal(legacyCase.iips()[0].to.port, "instring");
  });

  it("preserves casing when caseSensitive is not false", () => {
    const explicit = importFbpJson({ ...legacyDoc(), caseSensitive: true });
    assert.equal(explicit.edges()[0].from.port, "OutString");
    assert.equal(explicit.edges()[0].to.port, "InString");
    // Absent flag: the same preservation default (legacyDoc carries the
    // flag; strip it to exercise the absent case)
    const { caseSensitive: stripped, ...withoutFlag } = legacyDoc();
    void stripped;
    const byDefault = importFbpJson(withoutFlag);
    assert.equal(byDefault.edges()[0].from.port, "OutString");
    assert.equal(byDefault.edges()[0].to.port, "InString");
  });

  it("throws on an export-name case collision", () => {
    assert.throws(
      () =>
        importFbpJson({
          caseSensitive: false,
          processes: { n: { component: "x" } },
          outports: {
            out: { process: "n", port: "a" },
            OUT: { process: "n", port: "b" },
          },
        }),
      /normalization collides on outport 'out'/,
    );
  });

  it("does not coerce non-string port values", () => {
    assert.throws(
      () =>
        importFbpJson({
          caseSensitive: false,
          processes: { n: { component: "x" } },
          connections: [
            {
              src: { process: "n", port: 123 },
              tgt: { process: "n", port: "in" },
            },
          ],
        }),
      /must be a string/,
    );
  });
});
