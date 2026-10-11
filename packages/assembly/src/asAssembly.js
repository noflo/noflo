//     @noflo/assembly - Message relay conventions for NoFlo
//     (c) 2021-2026 Henri Bergius
//     (c) 2017-2021 Vladimir Sibirov
//     SPDX-License-Identifier: MIT

/**
 * @file asAssembly module
 * @description Wrap a regular Process API component as an assembly
 *   participant (work document #36). The wrapper's implementation is a
 *   real adapter subgraph — mapping extractors → inner component → result
 *   collector — built from the mapping configuration, so the graph the
 *   loader runs and the graph `getSource` reports are the same object.
 */

import { GraphModel } from "@noflo/graph";

/**
 * @typedef {import("./index.js").AssemblyMessage} AssemblyMessage
 */
/**
 * Port summary harvested from the inner component instance.
 *
 * @typedef {Object} PortSummary
 * @property {string} name
 * @property {boolean} addressable
 * @property {boolean} control
 * @property {boolean} required
 * @property {string} [datatype]
 */
/**
 * Mapping overrides: inner port name → message field name, or `null` for
 * whole-message mapping (the port receives the entire assembly message).
 *
 * @typedef {Object} AsAssemblyMapping
 * @property {Object<string, string|null>} [in] - Inner inport → msg field
 * @property {Object<string, string|null>} [out] - Inner outport → msg field
 */
/**
 * @typedef {Object} AsAssemblyOptions
 * @property {string} target - Registry-resolvable component name of the inner component; the generated graph references the inner component by this name
 * @property {AsAssemblyMapping} [mapping] - Explicit port ↔ field mapping; unmapped non-control ports default to their own names
 * @property {Object<string, string>} [brackets] - Bracket scope → field key for streamed inner outports (defaults to the outport name, collected as an array)
 */

/**
 * Harvest the port summary of an inner component instance.
 *
 * @param {import("@noflo/noflo").Component} inner
 * @returns {{ inports: PortSummary[], outports: PortSummary[], hasError: boolean }}
 */
function summarizePorts(inner) {
  /** @type {PortSummary[]} */
  const inports = [];
  /** @type {PortSummary[]} */
  const outports = [];
  for (const [name, port] of Object.entries(inner.inPorts.ports)) {
    inports.push({
      name,
      addressable: port.isAddressable(),
      control: Boolean(port.options?.control),
      required: Boolean(port.options?.required),
    });
  }
  for (const [name, port] of Object.entries(inner.outPorts.ports)) {
    /** @type {PortSummary} */
    const summary = {
      name,
      addressable: port.isAddressable(),
      control: false,
      required: false,
    };
    outports.push(summary);
  }
  const hasError = outports.some((p) => p.name === "error");
  return {
    inports: inports.filter((p) => p.name !== "error"),
    outports: outports.filter((p) => p.name !== "error"),
    hasError,
  };
}

/**
 * Resolve the effective inport mapping: inner port name → msg field name,
 * or `null` for whole-message mapping. Unmapped non-control ports default
 * to their own names.
 *
 * @param {PortSummary[]} inports
 * @param {AsAssemblyMapping} [mapping]
 * @returns {Object<string, string|null>}
 */
function resolveInMapping(inports, mapping = {}) {
  /** @type {Object<string, string|null>} */
  const resolved = {};
  for (const port of inports) {
    if (port.control) {
      continue;
    }
    const override = mapping.in?.[port.name];
    resolved[port.name] = override === undefined ? port.name : override;
  }
  return resolved;
}

/**
 * Resolve the effective outport mapping: inner port name → msg field name.
 * The `error` outport is handled separately (error accumulation) and is
 * not part of the data mapping.
 *
 * @param {PortSummary[]} outports
 * @param {AsAssemblyMapping} [mapping]
 * @returns {Object<string, string>}
 */
function resolveOutMapping(outports, mapping = {}) {
  /** @type {Object<string, string>} */
  const resolved = {};
  for (const port of outports) {
    const override = mapping.out?.[port.name];
    resolved[port.name] = override === undefined ? port.name : override;
  }
  return resolved;
}

/**
 * Wrap a regular Process API component as an assembly participant.
 *
 * The result is an adapter subgraph: the assembly message fans out to
 * field extractors (one per mapped inner inport), the inner component
 * runs on the extracted values, and the result collector merges every
 * inner outport back into the originating message — `msg.errors`
 * accumulating inner errors, data fields overwriting by name. One
 * message in, one message out; the adapter graph holds no cross-message
 * state.
 *
 * The inner component is referenced by its registry name: the caller
 * registers the inner definition (or it comes from a migrated library)
 * and the generated graph resolves it through the same registry the
 * application loaded the wrapper with.
 *
 * Unwrappable shapes (addressable ports) reject loudly — use
 * `wrapAssembly` for the skip-and-report decoration flow over whole
 * libraries.
 *
 * @param {import("@noflo/noflo").Component} inner - Instantiated inner component; its port metadata drives the mapping
 * @param {AsAssemblyOptions} options - The registry name of the inner component plus optional mapping overrides
 * @returns {GraphModel} The adapter graph, ready to be registered as a component definition (the loader wraps graph models as subgraphs)
 */
export function asAssembly(inner, options) {
  if (!options?.target) {
    throw new Error(
      "asAssembly requires options.target: the registry-resolvable name of the inner component",
    );
  }
  const { inports, outports, hasError } = summarizePorts(inner);
  for (const port of [...inports, ...outports]) {
    if (port.addressable) {
      throw new Error(
        `asAssembly: inner component has an addressable port '${port.name}' — addressable ports are not supported by assembly wrapping (work document #36, v1)`,
      );
    }
  }

  const inMapping = resolveInMapping(inports, options.mapping);
  const outMapping = resolveOutMapping(outports, options.mapping);

  const graph = new GraphModel();
  graph.addNode({ entity_id: "inner", component: options.target });
  // The assembly message fans out to every consumer through a Fork
  graph.addNode({ entity_id: "fanout", component: "assembly-utils/Fork" });

  // Message inport: exported and fed to the fanout
  graph.addExport({
    direction: "inport",
    public: "msg",
    internal: { node: "fanout", port: "in" },
  });

  /** Running merge input index */
  let mergeIndex = 0;

  // Control inports stay exposed on the wrapped signature: they are
  // configuration, not per-message data, so applications feed them
  // through graph defaults or IIPs as they would any subgraph
  for (const port of inports) {
    if (port.control) {
      graph.addExport({
        direction: "inport",
        public: port.name,
        internal: { node: "inner", port: port.name },
      });
    }
  }

  // Field extractors per mapped inner inport
  for (const [innerPort, field] of Object.entries(inMapping)) {
    if (field === null) {
      // Whole-message mapping: the port receives the message itself
      graph.addEdge({
        from: { node: "fanout", port: "out", index: mergeIndex },
        to: { node: "inner", port: innerPort },
      });
      mergeIndex += 1;
      continue;
    }
    const extractNode = `extract_${innerPort}`;
    graph.addNode({
      entity_id: extractNode,
      component: "assembly-utils/ExtractField",
    });
    graph.addIIP({ data: field, to: { node: extractNode, port: "field" } });
    graph.addEdge({
      from: { node: "fanout", port: "out", index: mergeIndex },
      to: { node: extractNode, port: "msg" },
    });
    graph.addEdge({
      from: { node: extractNode, port: "out" },
      to: { node: "inner", port: innerPort },
    });
    mergeIndex += 1;
  }

  // The result collector merges the original message with the mapped
  // inner outputs; the fanout feeds it the originating message
  graph.addNode({ entity_id: "collector", component: "assembly-utils/Merge" });
  graph.addEdge({
    from: { node: "fanout", port: "out", index: mergeIndex },
    to: { node: "collector", port: "in", index: 0 },
  });
  mergeIndex += 1;

  // Field wrappers per mapped inner outport
  for (const [innerPort, field] of Object.entries(outMapping)) {
    const wrapNode = `tofield_${innerPort}`;
    graph.addNode({ entity_id: wrapNode, component: "assembly-utils/ToField" });
    graph.addIIP({ data: field, to: { node: wrapNode, port: "field" } });
    graph.addEdge({
      from: { node: "inner", port: innerPort },
      to: { node: wrapNode, port: "in" },
    });
    graph.addEdge({
      from: { node: wrapNode, port: "out" },
      to: { node: "collector", port: "in", index: mergeIndex },
    });
    mergeIndex += 1;
  }

  // Inner errors accumulate into the message via the envelope wrapper
  if (hasError) {
    graph.addNode({
    entity_id: "toassembly",
    component: "assembly-utils/ToAssembly",
  });
    graph.addEdge({
      from: { node: "inner", port: "error" },
      to: { node: "toassembly", port: "error" },
    });
    graph.addEdge({
      from: { node: "toassembly", port: "out" },
      to: { node: "collector", port: "in", index: mergeIndex },
    });
    mergeIndex += 1;
  }

  graph.addExport({
    direction: "outport",
    public: "out",
    internal: { node: "collector", port: "out" },
  });

  return graph;
}
