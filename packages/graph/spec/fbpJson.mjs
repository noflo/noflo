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
