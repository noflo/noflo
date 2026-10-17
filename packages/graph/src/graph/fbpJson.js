/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: MIT
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
/* @ts-self-types="./fbpJson.d.ts" */

import { GraphModelError, requirePortRef, requireString } from "./entities.js";
import { GraphModel } from "./GraphModel.js";

/**
 * @typedef {import("./entities.js").GraphExport} GraphExport
 * @typedef {import("./GraphModel.js").GraphModelOptions} GraphModelOptions
 */

/**
 * Fold port names to lowercase across every collection that carries them —
 * edges, IIPs (both the modern `inits` and legacy `case` fields), and
 * exports (both the public name and the internal reference). Builds a
 * fresh document; the input is never rewritten. Port values must be
 * strings: the `caseSensitive: false` normalization does not coerce, so a
 * non-string port fails here exactly as it would on the strict path.
 *
 * @param {Object<string, any>} document
 * @returns {Object<string, any>} The case-folded view of the document.
 */
function foldCase(document) {
  const foldPort = (name, field) => {
    if (name === undefined) {
      return name;
    }
    if (typeof name !== "string") {
      throw new GraphModelError(
        `${field} must be a string; the caseSensitive: false normalization does not coerce`,
      );
    }
    return name.toLowerCase();
  };
  const folded = { ...document };
  folded.edges = (document.edges ?? []).map((edge) => ({
    ...edge,
    source:
      edge.source?.port !== undefined
        ? {
            ...edge.source,
            port: foldPort(edge.source.port, "edge.source.port"),
          }
        : edge.source,
    target:
      edge.target?.port !== undefined
        ? {
            ...edge.target,
            port: foldPort(edge.target.port, "edge.target.port"),
          }
        : edge.target,
  }));
  folded.inits = (document.inits ?? document.case ?? []).map((iip) => ({
    ...iip,
    target:
      iip.target?.port !== undefined
        ? { ...iip.target, port: foldPort(iip.target.port, "iip.target.port") }
        : iip.target,
  }));
  delete folded.case;
  const foldExports = (direction, defs) => {
    const foldedDefs = {};
    const seen = new Map();
    for (const [name, def] of Object.entries(defs ?? {})) {
      const normalized = foldPort(name, `${direction} export name`);
      if (seen.has(normalized)) {
        // A case collision during normalization is ambiguous: two
        // exports differing only by case become one under the 1.x
        // semantics, and silently dropping one would change the
        // application's boundary
        throw new GraphModelError(
          `caseSensitive: false normalization collides on ${direction} '${normalized}': the document declares both '${seen.get(normalized)}' and '${name}'`,
        );
      }
      seen.set(normalized, name);
      foldedDefs[normalized] = {
        ...def,
        port: foldPort(def?.port, `${direction} port`),
      };
    }
    return foldedDefs;
  };
  folded.inports = foldExports("inport", document.inports);
  folded.outports = foldExports("outport", document.outports);
  return folded;
}

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
  const document = normalizeLegacyFbpJson(json);
  // The 2.x naming policy is case-significant (work document #15): author
  // casing is preserved end to end. Legacy documents carry
  // `caseSensitive: false` (the 1.x interchange default, where the
  // reference parser lowercased port names) — such documents import with
  // port names folded to lowercase, so mixed-case references against
  // lowercase-declared 1.x components resolve. `caseSensitive: true` or
  // absent preserves casing as authored. The fold builds a fresh view;
  // the caller's object is never rewritten.
  const source = json.caseSensitive === false ? foldCase(document) : document;
  const options = /** @type {GraphModelOptions} */ ({});
  if (json.name !== undefined) {
    options.name = requireString(json.name, "name");
  }
  const model = new GraphModel(options);

  for (const [key, value] of Object.entries(source.properties ?? {})) {
    model.setGraphMetadata(key, value);
  }
  for (const node of source.nodes ?? []) {
    model.addNode({
      entity_id: requireString(node?.id, "node.id"),
      ...(node?.component === undefined
        ? {}
        : { component: requireString(node.component, "node.component") }),
      ...(node?.metadata === undefined ? {} : { metadata: node.metadata }),
    });
  }
  for (const edge of source.edges ?? []) {
    model.addEdge({
      from: jsonPortRef(edge?.source, "edge.source"),
      to: jsonPortRef(edge?.target, "edge.target"),
      ...(edge?.metadata === undefined ? {} : { metadata: edge.metadata }),
    });
  }
  const iips = source.inits ?? source.case ?? [];
  for (const iip of iips) {
    model.addIIP({
      data: iip?.data,
      to: jsonPortRef(iip?.target, "iip.target"),
      ...(iip?.metadata === undefined ? {} : { metadata: iip.metadata }),
    });
  }
  for (const [publicName, def] of Object.entries(source.inports ?? {})) {
    model.addExport({
      direction: "inport",
      public: publicName,
      internal: jsonPortRef(
        {
          id: def?.process,
          port: def?.port,
          ...(def?.index === undefined ? {} : { index: def.index }),
        },
        `inports.${publicName}`,
      ),
      ...withDefinedMetadata(exportMetadata(def)),
    });
  }
  for (const [publicName, def] of Object.entries(source.outports ?? {})) {
    model.addExport({
      direction: "outport",
      public: publicName,
      internal: jsonPortRef(
        {
          id: def?.process,
          port: def?.port,
          ...(def?.index === undefined ? {} : { index: def.index }),
        },
        `outports.${publicName}`,
      ),
      ...withDefinedMetadata(exportMetadata(def)),
    });
  }
  for (const group of source.groups ?? []) {
    model.addGroup({
      name: requireString(group?.name, "group.name"),
      nodes: requireGroupNodes(group?.nodes),
      ...withDefinedMetadata(group?.metadata),
    });
  }
  return model;
}

/**
 * Normalize a legacy NoFlo JSON document (`processes`/`connections` shape,
 * as written by 1.x-era tooling) into modern FBP JSON. Modern documents
 * pass through unchanged.
 *
 * @param {Object<string, any>} json
 * @returns {Object<string, any>}
 */
function normalizeLegacyFbpJson(json) {
  if (json.processes === undefined && json.connections === undefined) {
    return json;
  }
  const document = /** @type {Object<string, any>} */ ({});
  if (json.properties !== undefined) {
    document.properties = json.properties;
  }
  if (json.processes !== undefined) {
    document.nodes = Object.entries(json.processes).map(([id, def]) => ({
      id,
      component: def?.component,
      ...(def?.metadata === undefined ? {} : { metadata: def.metadata }),
    }));
  }
  if (json.connections !== undefined) {
    const edges = /** @type {Object<string, any>[]} */ ([]);
    const inits = /** @type {Object<string, any>[]} */ ([]);
    for (const connection of json.connections) {
      if (connection?.data !== undefined) {
        inits.push({
          data: connection.data,
          target: jsonRefIn(connection.tgt),
          ...(connection.metadata === undefined
            ? {}
            : { metadata: connection.metadata }),
        });
      } else if (connection?.src && connection?.tgt) {
        edges.push({
          source: jsonRefIn(connection.src),
          target: jsonRefIn(connection.tgt),
          ...(connection.metadata === undefined
            ? {}
            : { metadata: connection.metadata }),
        });
      } else {
        throw new GraphModelError(
          "Legacy JSON connection must have both src and tgt, or data and tgt",
        );
      }
    }
    document.edges = edges;
    if (inits.length > 0) {
      document.inits = inits;
    }
  }
  if (json.inits !== undefined) {
    document.inits = json.inits;
  } else if (json.case !== undefined) {
    document.case = json.case;
  }
  if (json.inports !== undefined) {
    document.inports = json.inports;
  }
  if (json.outports !== undefined) {
    document.outports = json.outports;
  }
  if (json.groups !== undefined) {
    document.groups = json.groups;
  }
  return document;
}

/**
 * Convert a legacy JSON port reference (`{ process, port, index? }`) into
 * the modern `{ id, port, index? }` shape.
 *
 * @param {any} ref
 * @returns {Object<string, any>|undefined}
 */
function jsonRefIn(ref) {
  if (ref === undefined) {
    return undefined;
  }
  return {
    id: ref.process,
    port: ref.port,
    ...(ref.index === undefined ? {} : { index: ref.index }),
  };
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
    source: jsonRefOut(edge.from),
    target: jsonRefOut(edge.to),
    ...(edge.metadata === undefined ? {} : { metadata: edge.metadata }),
  }));

  const iips = model.iips().map((iip) => ({
    data: iip.from.data,
    target: jsonRefOut(iip.to),
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
 * Convert a native port reference into an FBP JSON `{ id, port, index? }`.
 *
 * @param {{ node: string, port: string, index?: number }} ref
 * @returns {Object<string, any>}
 */
function jsonRefOut(ref) {
  return {
    id: ref.node,
    port: ref.port,
    ...(ref.index === undefined ? {} : { index: ref.index }),
  };
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
  return requirePortRef(
    {
      node: ref?.id,
      port: ref?.port,
      ...(ref?.index === undefined ? {} : { index: ref.index }),
    },
    field,
  );
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
