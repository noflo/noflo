//     (c) 2021-2026 Henri Bergius

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stableStringify } from "../src/graph/canonical.js";
import { GraphModelError } from "../src/graph/entities.js";
import { GraphModel } from "../src/graph/GraphModel.js";

/** Collect events of the given types from a model. */
function recorded(model, types) {
  /** @type {{ type: string, detail: any }[]} */
  const events = [];
  for (const type of types) {
    model.addEventListener(type, (event) => {
      events.push({ type, detail: event.detail });
    });
  }
  return events;
}

describe("GraphModel nodes", () => {
  it("adds a node with an explicit id and fires addNode", () => {
    const model = new GraphModel({ name: "test" });
    const events = recorded(model, ["addNode"]);
    const node = model.addNode({ entity_id: "Read", component: "fs/ReadFile" });
    assert.equal(node.entity_id, "Read");
    assert.equal(node.component, "fs/ReadFile");
    assert.deepEqual(
      events.map((e) => e.type),
      ["addNode"],
    );
    assert.equal(events[0].detail.entity, node);
    assert.equal(model.node("Read"), node);
    assert.equal(model.name, "test");
  });

  it("generates compact ids when entity_id is omitted", () => {
    const model = new GraphModel();
    const first = model.addNode({ component: "core/Repeat" });
    const second = model.addNode({ component: "core/Repeat" });
    assert.equal(first.entity_id, "n1");
    assert.equal(second.entity_id, "n2");
  });

  it("rejects duplicate node ids", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    assert.throws(
      () => model.addNode({ entity_id: "A", component: "y" }),
      GraphModelError,
    );
  });

  it("rejects an empty component", () => {
    const model = new GraphModel();
    assert.throws(
      () => model.addNode({ entity_id: "A", component: "" }),
      GraphModelError,
    );
  });

  it("allows component-less placeholder nodes", () => {
    const model = new GraphModel();
    const node = model.addNode({ entity_id: "A" });
    assert.equal(node.component, undefined);
    assert.equal(model.node("A").component, undefined);
  });

  it("removes a node and fires removeNode", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    const events = recorded(model, ["removeNode"]);
    const removed = model.removeNode("A");
    assert.equal(removed.entity_id, "A");
    assert.equal(model.hasNode("A"), false);
    assert.equal(events.length, 1);
  });

  it("rejects removing an unknown node", () => {
    const model = new GraphModel();
    assert.throws(() => model.removeNode("nope"), GraphModelError);
  });

  it("renames a node and rewrites all references", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    model.addNode({ entity_id: "B", component: "y" });
    const edge = model.addEdge({
      from: { node: "A", port: "out" },
      to: { node: "B", port: "in" },
    });
    const iip = model.addIIP({ data: 1, to: { node: "A", port: "in" } });
    const exp = model.addExport({
      direction: "outport",
      public: "result",
      internal: { node: "B", port: "out" },
    });
    const group = model.addGroup({ name: "g", nodes: ["A", "B"] });
    const events = recorded(model, [
      "renameNode",
      "changeEdge",
      "changeIIP",
      "changeExport",
      "changeGroup",
    ]);

    model.renameNode("A", "Alpha");

    // Entities are immutable: mutations replace them, so re-fetch.
    const renamedEdge = model.edge(edge.entity_id);
    const renamedIip = model.iip(iip.entity_id);
    const renamedGroup = model.group(group.entity_id);
    assert.equal(renamedEdge.from.node, "Alpha");
    assert.equal(renamedIip.to.node, "Alpha");
    assert.equal(model.export(exp.entity_id).internal.node, "B"); // untouched
    assert.deepEqual(renamedGroup.nodes, ["Alpha", "B"]);
    assert.equal(model.node("Alpha").component, "x");
    assert.equal(model.hasNode("A"), false);
    assert.deepEqual(
      events.map((e) => e.type),
      ["changeEdge", "changeIIP", "changeGroup", "renameNode"],
    );
  });

  it("rejects renaming onto an existing node", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    model.addNode({ entity_id: "B", component: "y" });
    assert.throws(() => model.renameNode("A", "B"), GraphModelError);
  });
});

describe("GraphModel edges", () => {
  it("adds an edge between existing nodes and fires addEdge", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    model.addNode({ entity_id: "B", component: "y" });
    const events = recorded(model, ["addEdge"]);
    const edge = model.addEdge({
      from: { node: "A", port: "out" },
      to: { node: "B", port: "in" },
    });
    assert.equal(edge.entity_id, "e1");
    assert.equal(events.length, 1);
    assert.deepEqual(model.edgesFrom("A"), [edge]);
    assert.deepEqual(model.edgesTo("B"), [edge]);
  });

  it("rejects edges referencing unknown nodes", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    assert.throws(
      () =>
        model.addEdge({
          from: { node: "A", port: "out" },
          to: { node: "Ghost", port: "in" },
        }),
      /unknown node "Ghost"/,
    );
  });

  it("rejects duplicate edges between the same ports", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    model.addNode({ entity_id: "B", component: "y" });
    model.addEdge({
      from: { node: "A", port: "out" },
      to: { node: "B", port: "in" },
    });
    assert.throws(
      () =>
        model.addEdge({
          from: { node: "A", port: "out" },
          to: { node: "B", port: "in" },
        }),
      /already connects/,
    );
  });

  it("keeps duplicate detection working across a node rename", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    model.addNode({ entity_id: "B", component: "y" });
    model.addEdge({
      from: { node: "A", port: "out" },
      to: { node: "B", port: "in" },
    });
    model.renameNode("A", "A2");
    assert.throws(
      () =>
        model.addEdge({
          from: { node: "A2", port: "out" },
          to: { node: "B", port: "in" },
        }),
      /already connects/,
    );
    // The stale pre-rename key must not block a legitimately new edge
    model.removeEdge(model.edges()[0].entity_id);
    model.addNode({ entity_id: "C", component: "z" });
    model.addEdge({
      from: { node: "C", port: "out" },
      to: { node: "B", port: "in" },
    });
    assert.equal(model.edges().length, 1);
  });

  it("treats different array slots as distinct edges", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    model.addNode({ entity_id: "B", component: "y" });
    const first = model.addEdge({
      from: { node: "A", port: "out", index: 0 },
      to: { node: "B", port: "in" },
    });
    const second = model.addEdge({
      from: { node: "A", port: "out", index: 1 },
      to: { node: "B", port: "in" },
    });
    assert.notEqual(first.entity_id, second.entity_id);
    // Same slot twice is still a duplicate
    assert.throws(
      () =>
        model.addEdge({
          from: { node: "A", port: "out", index: 1 },
          to: { node: "B", port: "in" },
        }),
      /already connects/,
    );
  });

  it("rejects invalid array slot indices", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    model.addNode({ entity_id: "B", component: "y" });
    assert.throws(
      () =>
        model.addEdge({
          from: { node: "A", port: "out", index: -1 },
          to: { node: "B", port: "in" },
        }),
      /index must be a non-negative integer/,
    );
    assert.throws(
      () =>
        model.addEdge({
          from: { node: "A", port: "out", index: 1.5 },
          to: { node: "B", port: "in" },
        }),
      GraphModelError,
    );
  });

  it("removeNode cascades to incident edges, IIPs, and exports, and prunes groups", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    model.addNode({ entity_id: "B", component: "y" });
    model.addEdge({
      from: { node: "A", port: "out" },
      to: { node: "B", port: "in" },
    });
    model.addIIP({ data: 1, to: { node: "A", port: "in" } });
    model.addExport({
      direction: "inport",
      public: "input",
      internal: { node: "A", port: "in" },
    });
    const group = model.addGroup({ name: "g", nodes: ["A", "B"] });
    const events = recorded(model, [
      "removeEdge",
      "removeIIP",
      "removeExport",
      "changeGroup",
      "removeNode",
    ]);

    model.removeNode("A");

    assert.equal(model.edges().length, 0);
    assert.equal(model.iips().length, 0);
    assert.equal(model.exports().length, 0);
    assert.deepEqual(model.group(group.entity_id).nodes, ["B"]);
    assert.deepEqual(
      events.map((e) => e.type),
      ["removeEdge", "removeIIP", "removeExport", "changeGroup", "removeNode"],
    );
  });
});

describe("GraphModel IIPs", () => {
  it("adds an IIP targeting an existing node port", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    const iip = model.addIIP({
      data: { hello: "world" },
      to: { node: "A", port: "in" },
    });
    assert.equal(iip.entity_id, "i1");
    assert.deepEqual(iip.from.data, { hello: "world" });
  });

  it("rejects IIPs targeting unknown nodes", () => {
    const model = new GraphModel();
    assert.throws(
      () => model.addIIP({ data: 1, to: { node: "Ghost", port: "in" } }),
      GraphModelError,
    );
  });

  it("freezes stored data so callers cannot mutate graph state", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    const iip = model.addIIP({
      data: { nested: [1, 2] },
      to: { node: "A", port: "in" },
    });
    assert.throws(() => {
      /** @type {any} */ (iip.from.data).nested.push(3);
    });
    assert.deepEqual(iip.from.data, { nested: [1, 2] });
  });

  it("stores JSON-able payloads detached from the caller's object", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    const payload = { nested: [1, 2] };
    model.addIIP({ data: payload, to: { node: "A", port: "in" } });
    // Cloning must not freeze or otherwise mutate the caller's object
    assert.equal(Object.isFrozen(payload), false);
    payload.nested.push(3);
    assert.deepEqual(model.iips()[0].from.data, { nested: [1, 2] });
  });

  it("stores callbacks by reference so engines can pass them as IIPs", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    /** @type {() => void} */
    let called = () => {};
    const iip = model.addIIP({
      data: () => called(),
      to: { node: "A", port: "in" },
    });
    let fired = false;
    called = () => {
      fired = true;
    };
    /** @type {() => void} */ (iip.from.data)();
    assert.equal(fired, true);
  });
});

describe("GraphModel exports and groups", () => {
  it("adds an export with direction validation", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    const exp = model.addExport({
      direction: "inport",
      public: "input",
      internal: { node: "A", port: "in" },
    });
    assert.equal(exp.entity_id, "x1");
    assert.throws(
      () =>
        model.addExport({
          direction: "sideways",
          public: "other",
          internal: { node: "A", port: "in" },
        }),
      /inport" or "outport"/,
    );
  });

  it("rejects duplicate public names within a direction", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    model.addExport({
      direction: "inport",
      public: "input",
      internal: { node: "A", port: "in" },
    });
    assert.throws(
      () =>
        model.addExport({
          direction: "inport",
          public: "input",
          internal: { node: "A", port: "other" },
        }),
      /already exported/,
    );
  });

  it("allows the same public name across directions", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    model.addExport({
      direction: "inport",
      public: "value",
      internal: { node: "A", port: "in" },
    });
    model.addExport({
      direction: "outport",
      public: "value",
      internal: { node: "A", port: "out" },
    });
    assert.equal(model.exports().length, 2);
  });

  it("adds a group over existing nodes and validates members", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    const group = model.addGroup({ name: "workers", nodes: ["A"] });
    assert.equal(group.entity_id, "g1");
    assert.throws(
      () => model.addGroup({ name: "bad", nodes: ["Ghost"] }),
      /unknown node "Ghost"/,
    );
  });
});

describe("GraphModel metadata", () => {
  it("sets and removes entity metadata with change events", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    const events = recorded(model, ["changeNode"]);
    model.setNodeMetadata("A", "route", "red");
    assert.equal(model.node("A").metadata.route, "red");
    model.setNodeMetadata("A", "route", undefined);
    assert.equal(model.node("A").metadata, undefined);
    assert.deepEqual(
      events.map((e) => e.type),
      ["changeNode", "changeNode"],
    );
  });

  it("sets and removes graph-level metadata with changeProperties events", () => {
    const model = new GraphModel();
    const events = recorded(model, ["changeProperties"]);
    model.setGraphMetadata("env", "prod");
    assert.equal(model.graphMetadata().env, "prod");
    model.removeGraphMetadata("env");
    assert.deepEqual(model.graphMetadata(), {});
    assert.equal(events.length, 2);
  });

  it("does not leave a stale metadata map after removing the last key", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    model.setNodeMetadata("A", "route", "red");
    model.setNodeMetadata("A", "route", undefined);
    assert.equal("metadata" in model.node("A"), false);
    assert.equal(model.node("A").component, "x");
  });
});

describe("GraphModel canonical serialization", () => {
  it("serializes identically regardless of insertion order", () => {
    const buildA = () => {
      const model = new GraphModel({ name: "g" });
      model.addNode({ entity_id: "B", component: "y" });
      model.addNode({ entity_id: "A", component: "x" });
      model.addEdge({
        entity_id: "e1",
        from: { node: "A", port: "out" },
        to: { node: "B", port: "in" },
      });
      model.addGroup({ entity_id: "g1", name: "all", nodes: ["A", "B"] });
      return model;
    };
    const buildB = () => {
      const model = new GraphModel({ name: "g" });
      model.addNode({ entity_id: "A", component: "x" });
      model.addNode({ entity_id: "B", component: "y" });
      model.addGroup({ entity_id: "g1", name: "all", nodes: ["A", "B"] });
      model.addEdge({
        entity_id: "e1",
        from: { node: "A", port: "out" },
        to: { node: "B", port: "in" },
      });
      return model;
    };
    assert.equal(buildA().canonicalString(), buildB().canonicalString());
  });

  it("round-trips through fromCanonical", () => {
    const model = new GraphModel({ name: "g" });
    model.addNode({
      entity_id: "A",
      component: "x",
      metadata: { route: "red" },
    });
    model.addNode({ entity_id: "B", component: "y" });
    model.addEdge({
      from: { node: "A", port: "out" },
      to: { node: "B", port: "in" },
    });
    model.addIIP({ data: 42, to: { node: "A", port: "in" } });
    model.addExport({
      direction: "outport",
      public: "out",
      internal: { node: "B", port: "out" },
    });
    model.addGroup({ name: "all", nodes: ["A", "B"] });
    model.setGraphMetadata("env", "test");

    const rebuilt = GraphModel.fromCanonical(model.serialize());
    assert.equal(rebuilt.canonicalString(), model.canonicalString());
    assert.equal(rebuilt.node("A").metadata.route, "red");
  });

  it("clone produces an equal, independent model", () => {
    const model = new GraphModel();
    model.addNode({ entity_id: "A", component: "x" });
    const clone = model.clone();
    clone.addNode({ entity_id: "B", component: "y" });
    assert.equal(model.hasNode("B"), false);
    assert.equal(clone.hasNode("B"), true);
  });

  it("stableStringify sorts object keys at every level", () => {
    assert.equal(
      stableStringify({ b: 1, a: { d: 2, c: 3 } }),
      '{"a":{"c":3,"d":2},"b":1}',
    );
  });
});
