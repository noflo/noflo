/**
 * @file fbpJson module
 * @description FBP JSON interchange adapter for the native graph model
 *   (work document #10).
 *
 *   FBP JSON is an ecosystem interchange surface, not the internal
 *   representation: import it into a {@link GraphModel}, or export a model
 *   to it, so fbp-graph-era tools and noflo-ui keep working over the same
 *   files. The adapter covers the standard document shape:
 *
 *   - `properties` — graph-level metadata
 *   - `nodes` — `{ id, component, metadata }`; the JSON `id` maps onto the
 *     native `entity_id`
 *   - `edges` — `{ source: { id, port }, target: { id, port }, metadata }`
 *   - `inits` (a.k.a. `case`) — IIPs `{ data, target: { id, port } }`
 *   - `inports`/`outports` — exported ports; each entry names the internal
 *     `process`/`port` being exposed and becomes a first-class Export
 *     entity (direction `inport`/`outport`)
 *   - `groups` — `{ name, nodes, metadata }`
 *
 *   Import validates referential integrity by funneling through the plain
 *   mode mutations, so malformed documents fail fast with
 *   {@link GraphModelError}.
 */

import { GraphModelError, requirePortRef, requireString } from "./entities.js";
import { GraphModel } from "./GraphModel.js";

/**
 * @typedef {import("./entities.js").GraphExport} GraphExport
 * @typedef {import("./GraphModel.js").GraphModelOptions} GraphModelOptions
 */

/**
 * Import an FBP JSON document into a new graph model.
 *
 * @param {any} json - Parsed FBP JSON document
 * @returns {GraphModel}
 */
export function importFbpJson(json) {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new GraphModelError("FBP JSON document must be an object");
  }
  const options = /** @type {GraphModelOptions} */ ({});
  if (json.name !== undefined) {
    options.name = requireString(json.name, "name");
  }
  const model = new GraphModel(options);

  for (const [key, value] of Object.entries(json.properties ?? {})) {
    model.setGraphMetadata(key, value);
  }
  for (const node of json.nodes ?? []) {
    model.addNode({
      entity_id: requireString(node?.id, "node.id"),
      component: requireString(node?.component, "node.component"),
      ...(node?.metadata === undefined ? {} : { metadata: node.metadata }),
    });
  }
  for (const edge of json.edges ?? []) {
    model.addEdge({
      from: jsonPortRef(edge?.source, "edge.source"),
      to: jsonPortRef(edge?.target, "edge.target"),
      ...(edge?.metadata === undefined ? {} : { metadata: edge.metadata }),
    });
  }
  const iips = json.inits ?? json.case ?? [];
  for (const iip of iips) {
    model.addIIP({
      data: iip?.data,
      to: jsonPortRef(iip?.target, "iip.target"),
      ...(iip?.metadata === undefined ? {} : { metadata: iip.metadata }),
    });
  }
  for (const [publicName, def] of Object.entries(json.inports ?? {})) {
    model.addExport({
      direction: "inport",
      public: publicName,
      internal: requirePortRef(
        { node: def?.process, port: def?.port },
        `inports.${publicName}`,
      ),
      ...withDefinedMetadata(exportMetadata(def)),
    });
  }
  for (const [publicName, def] of Object.entries(json.outports ?? {})) {
    model.addExport({
      direction: "outport",
      public: publicName,
      internal: requirePortRef(
        { node: def?.process, port: def?.port },
        `outports.${publicName}`,
      ),
      ...withDefinedMetadata(exportMetadata(def)),
    });
  }
  for (const group of json.groups ?? []) {
    model.addGroup({
      name: requireString(group?.name, "group.name"),
      nodes: requireGroupNodes(group?.nodes),
      ...withDefinedMetadata(group?.metadata),
    });
  }
  return model;
}

/**
 * Export a graph model as an FBP JSON document. Graph-level metadata is
 * always written; node and edge collections are always present; empty
 * port, group, and IIP collections are omitted.
 *
 * @param {GraphModel} model
 * @returns {Object<string, any>}
 */
export function exportFbpJson(model) {
  const result = /** @type {Object<string, any>} */ ({
    properties: model.graphMetadata(),
  });

  const inports = /** @type {Object<string, any>} */ ({});
  const outports = /** @type {Object<string, any>} */ ({});
  for (const exp of model.exports()) {
    const target = exp.direction === "inport" ? inports : outports;
    target[exp.public] = {
      process: exp.internal.node,
      port: exp.internal.port,
      ...(exp.metadata === undefined ? {} : { metadata: exp.metadata }),
    };
  }
  if (Object.keys(inports).length > 0) {
    result.inports = inports;
  }
  if (Object.keys(outports).length > 0) {
    result.outports = outports;
  }

  const groups = model.groups().map((group) => ({
    name: group.name,
    nodes: [...group.nodes],
    ...(group.metadata === undefined ? {} : { metadata: group.metadata }),
  }));
  if (groups.length > 0) {
    result.groups = groups;
  }

  result.nodes = model.nodes().map((node) => ({
    id: node.entity_id,
    component: node.component,
    ...(node.metadata === undefined ? {} : { metadata: node.metadata }),
  }));
  result.edges = model.edges().map((edge) => ({
    source: { id: edge.from.node, port: edge.from.port },
    target: { id: edge.to.node, port: edge.to.port },
    ...(edge.metadata === undefined ? {} : { metadata: edge.metadata }),
  }));

  const iips = model.iips().map((iip) => ({
    data: iip.from.data,
    target: { id: iip.to.node, port: iip.to.port },
    ...(iip.metadata === undefined ? {} : { metadata: iip.metadata }),
  }));
  if (iips.length > 0) {
    result.inits = iips;
  }
  return result;
}

/**
 * Fold an FBP JSON export-port entry into export metadata: the explicit
 * `metadata` map plus the optional schema/type/values fields.
 *
 * @param {any} def
 * @returns {Object<string, any>|undefined}
 */
function exportMetadata(def) {
  const metadata = { ...(def?.metadata ?? {}) };
  for (const field of ["schema", "type", "required", "values"]) {
    if (def?.[field] !== undefined) {
      metadata[field] = def[field];
    }
  }
  return Object.keys(metadata).length === 0 ? undefined : metadata;
}

/**
 * Convert an FBP JSON port reference (`{ id, port }`) into a native
 * `{ node, port }` reference, validating on the way.
 *
 * @param {any} ref
 * @param {string} field
 * @returns {import("./entities.js").GraphPortRef}
 */
function jsonPortRef(ref, field) {
  return requirePortRef({ node: ref?.id, port: ref?.port }, field);
}

/**
 * @param {Object<string, any>|undefined} metadata
 * @returns {{ metadata?: Object<string, any> }}
 */
function withDefinedMetadata(metadata) {
  return metadata === undefined ? {} : { metadata };
}

/**
 * @param {unknown} nodes
 * @returns {string[]}
 */
function requireGroupNodes(nodes) {
  if (!Array.isArray(nodes)) {
    throw new GraphModelError("group.nodes must be an array of node ids");
  }
  return nodes.map((id) => requireString(id, "group.nodes[]"));
}
