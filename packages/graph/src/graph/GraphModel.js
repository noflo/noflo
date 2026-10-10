/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: MIT
 * @file GraphModel module
 * @description The plain-mode native graph model for NoFlo 2.x (work
 *   document #10), replacing `fbp-graph` as the engine's core data model.
 *
 *   The model owns nodes, edges, IIPs, exports, and groups — the subset the
 *   engine actually needs — without the fbp-graph journal/undo legacy. It
 *   operates in two modes over the same entity model:
 *
 *   - **Plain mode** (this file): engine-internal graphs with strict
 *     referential integrity. Mutations validate immediately and throw a
 *     {@link GraphModelError} on dangling references.
 *   - **CRDT mode** (later slice): protocol 2.0 runtimes over an op log,
 *     where tombstones and epochs replace strict validation. Plain mode's
 *     canonical serialization (`serialize`/`fromCanonical`/`stableStringify`)
 *     is the shared foundation for epoch snapshots.
 *
 *   Events use the native `EventTarget` API, consistent with NoFlo 2.x core
 *   classes. Every mutation emits a corresponding event with the affected
 *   (frozen) entity in `event.detail.entity`. This is also the seam for the
 *   subgraph event model: nested graphs observe their parent by forwarding
 *   or composing these events.
 *
 *   Entities are stored frozen. External code must never mutate them;
 *   metadata changes go through the setters, which replace the entity and
 *   emit a change event.
 */
/* @ts-self-types="./GraphModel.d.ts" */

import { stableStringify } from "./canonical.js";
import {
  compareEntityIds,
  deepFreeze,
  freezeIipData,
  freezeMetadata,
  GraphModelError,
  makeEntityId,
  requirePortRef,
  requireString,
} from "./entities.js";

/**
 * A process instance in the graph.
 * @typedef {import("./entities.js").GraphNode} GraphNode
 */
/**
 * A connection between two node ports.
 * @typedef {import("./entities.js").GraphEdge} GraphEdge
 */
/**
 * An initial Information Packet targeting a node port.
 * @typedef {import("./entities.js").GraphIIP} GraphIIP
 */
/**
 * A public port exposing part of the graph boundary.
 * @typedef {import("./entities.js").GraphExport} GraphExport
 */
/**
 * A named, visual-only collection of nodes.
 * @typedef {import("./entities.js").GraphGroup} GraphGroup
 */
/**
 * The five first-class entity kinds, in canonical order.
 * @typedef {import("./entities.js").EntityKind} EntityKind
 */
/**
 * Reference to one end of a connection: a node and one of its ports.
 * @typedef {import("./entities.js").GraphPortRef} GraphPortRef
 */

/**
 * Options for constructing a graph model.
 *
 * @typedef {Object} GraphModelOptions
 * @property {string} [name] - Optional graph name
 */

/**
 * @typedef {Object} CanonicalGraph
 * @property {string} [name]
 * @property {Object<string, any>} metadata - Graph-level metadata
 * @property {GraphNode[]} nodes - Sorted by `entity_id`
 * @property {GraphEdge[]} edges - Sorted by `entity_id`
 * @property {GraphIIP[]} iips - Sorted by `entity_id`
 * @property {GraphExport[]} exports - Sorted by `entity_id`
 * @property {GraphGroup[]} groups - Sorted by `entity_id`
 */

/**
 * Canonical identity key for a connection: both ends' node, port, and
 * array slot.
 *
 * @param {GraphPortRef} from
 * @param {GraphPortRef} to
 * @returns {string}
 */
function edgeKey(from, to) {
  return `${from.node}\u0000${from.port}\u0000${from.index ?? ""}\u0001${to.node}\u0000${to.port}\u0000${to.index ?? ""}`;
}

/**
 * The native graph model. See the {@link module:GraphModel module doc} for
 * the mode split and event contract.
 */
export class GraphModel extends EventTarget {
  /** @type {string|undefined} */
  #name;

  /** @type {Map<string, GraphNode>} */
  #nodes = new Map();

  /** @type {Map<string, GraphEdge>} */
  #edges = new Map();

  /** Lookup index for duplicate-edge detection: ref-key → entity_id */
  #edgeIndex = new Map();

  /** @type {Map<string, GraphIIP>} */
  #iips = new Map();

  /** @type {Map<string, GraphExport>} */
  #exports = new Map();

  /** @type {Map<string, GraphGroup>} */
  #groups = new Map();

  /** @type {Object<string, any>} */
  #metadata = {};

  /** @type {number} */
  #counter = 0;

  /**
   * @param {GraphModelOptions} [options]
   */
  constructor(options = {}) {
    super();
    if (options.name !== undefined) {
      this.#name = requireString(options.name, "name");
    }
  }

  // ## Identity

  /**
   * @returns {string|undefined}
   */
  get name() {
    return this.#name;
  }

  /**
   * @param {string} value
   */
  set name(value) {
    this.#name = requireString(value, "name");
  }

  // ## Graph-level metadata

  /**
   * Return a mutable deep clone of the graph-level metadata.
   *
   * @returns {Object<string, any>}
   */
  graphMetadata() {
    return structuredClone(this.#metadata);
  }

  /**
   * Set a graph-level metadata key.
   *
   * @param {string} key
   * @param {any} value
   * @returns {void}
   */
  setGraphMetadata(key, value) {
    requireString(key, "key");
    this.#metadata[key] = value;
    this.#emit("changeProperties", { key, value });
  }

  /**
   * Remove a graph-level metadata key.
   *
   * @param {string} key
   * @returns {void}
   */
  removeGraphMetadata(key) {
    requireString(key, "key");
    delete this.#metadata[key];
    this.#emit("changeProperties", { key, value: undefined });
  }

  // ## Nodes

  /**
   * Add a node. When `entity_id` is omitted a compact generated id is
   * assigned (`n1`, `n2`, …). Node ids are unique within the graph. The
   * `component` may be omitted for placeholder nodes — the engine
   * registers them without instantiating a process.
   *
   * @param {{ entity_id?: string, component?: string, metadata?: Object<string, any> }} definition
   * @returns {GraphNode} The frozen stored entity
   */
  addNode(definition) {
    const entityId =
      definition.entity_id === undefined
        ? this.#nextId("node")
        : requireString(definition.entity_id, "entity_id");
    if (this.#nodes.has(entityId)) {
      throw new GraphModelError(`Node "${entityId}" already exists`);
    }
    const component =
      definition.component === undefined
        ? undefined
        : requireString(definition.component, "component");
    const metadata = freezeMetadata(definition.metadata, "metadata");
    /** @type {GraphNode} */
    const node = Object.freeze({
      entity_id: entityId,
      ...(component === undefined ? {} : { component }),
      ...(metadata === undefined ? {} : { metadata }),
    });
    this.#nodes.set(entityId, node);
    this.#emit("addNode", { entity: node });
    return node;
  }

  /**
   * @param {string} entityId
   * @returns {GraphNode|undefined}
   */
  node(entityId) {
    return this.#nodes.get(entityId);
  }

  /**
   * @param {string} entityId
   * @returns {boolean}
   */
  hasNode(entityId) {
    return this.#nodes.has(entityId);
  }

  /**
   * All nodes, in insertion order.
   *
   * @returns {GraphNode[]}
   */
  nodes() {
    return [...this.#nodes.values()];
  }

  /**
   * Rename a node, rewriting every reference: edges, IIPs, exports, and
   * group memberships keep pointing at the same node under its new id.
   * Emits `renameNode` after the change events of rewritten references.
   *
   * @param {string} previous
   * @param {string} next
   * @returns {GraphNode} The renamed entity
   */
  renameNode(previous, next) {
    requireString(previous, "previous");
    requireString(next, "next");
    const node = this.#requireEntity(this.#nodes, "node", previous);
    if (previous === next) {
      return node;
    }
    if (this.#nodes.has(next)) {
      throw new GraphModelError(`Node "${next}" already exists`);
    }
    this.#nodes.delete(previous);
    /** @type {GraphNode} */
    const renamed = Object.freeze({
      entity_id: next,
      component: node.component,
      ...(node.metadata === undefined ? {} : { metadata: node.metadata }),
    });
    this.#nodes.set(next, renamed);

    for (const edge of [...this.#edges.values()]) {
      if (edge.from.node === previous || edge.to.node === previous) {
        const from =
          edge.from.node === previous
            ? { node: next, port: edge.from.port }
            : edge.from;
        const to =
          edge.to.node === previous
            ? { node: next, port: edge.to.port }
            : edge.to;
        this.#edgeIndex.delete(edgeKey(edge.from, edge.to));
        this.#edges.set(
          edge.entity_id,
          this.#freezeEdge(edge.entity_id, from, to, edge.metadata),
        );
        this.#edgeIndex.set(edgeKey(from, to), edge.entity_id);
        this.#emit("changeEdge", {
          entity: this.#edges.get(edge.entity_id),
        });
      }
    }
    for (const iip of [...this.#iips.values()]) {
      if (iip.to.node === previous) {
        this.#iips.set(
          iip.entity_id,
          this.#freezeIip(
            iip.entity_id,
            iip.from,
            { node: next, port: iip.to.port },
            iip.metadata,
          ),
        );
        this.#emit("changeIIP", {
          entity: this.#iips.get(iip.entity_id),
        });
      }
    }
    for (const exp of [...this.#exports.values()]) {
      if (exp.internal.node === previous) {
        this.#exports.set(
          exp.entity_id,
          this.#freezeExport(
            exp.entity_id,
            exp.direction,
            exp.public,
            { node: next, port: exp.internal.port },
            exp.metadata,
          ),
        );
        this.#emit("changeExport", {
          entity: this.#exports.get(exp.entity_id),
        });
      }
    }
    for (const group of [...this.#groups.values()]) {
      if (group.nodes.includes(previous)) {
        this.#groups.set(
          group.entity_id,
          Object.freeze({
            ...group,
            nodes: Object.freeze(
              group.nodes.map((id) => (id === previous ? next : id)),
            ),
          }),
        );
        this.#emit("changeGroup", {
          entity: this.#groups.get(group.entity_id),
        });
      }
    }
    this.#emit("renameNode", { entity: renamed, previous });
    return renamed;
  }

  /**
   * Remove a node and everything attached to it: incident edges, IIPs
   * targeting it, exports exposing it, and its group memberships. Each
   * removal emits its own event; `removeNode` is emitted last.
   *
   * @param {string} entityId
   * @returns {GraphNode} The removed entity
   */
  removeNode(entityId) {
    const node = this.#requireEntity(this.#nodes, "node", entityId);
    for (const edge of [...this.#edges.values()]) {
      if (edge.from.node === entityId || edge.to.node === entityId) {
        this.#edgeIndex.delete(edgeKey(edge.from, edge.to));
        this.#edges.delete(edge.entity_id);
        this.#emit("removeEdge", { entity: edge });
      }
    }
    for (const iip of [...this.#iips.values()]) {
      if (iip.to.node === entityId) {
        this.#removeEntity(this.#iips, "iip", iip.entity_id, "removeIIP");
      }
    }
    for (const exp of [...this.#exports.values()]) {
      if (exp.internal.node === entityId) {
        this.#removeEntity(
          this.#exports,
          "export",
          exp.entity_id,
          "removeExport",
        );
      }
    }
    for (const group of [...this.#groups.values()]) {
      if (group.nodes.includes(entityId)) {
        this.#groups.set(
          group.entity_id,
          Object.freeze({
            ...group,
            nodes: Object.freeze(group.nodes.filter((id) => id !== entityId)),
          }),
        );
        this.#emit("changeGroup", {
          entity: this.#groups.get(group.entity_id),
        });
      }
    }
    this.#nodes.delete(entityId);
    this.#emit("removeNode", { entity: node });
    return node;
  }

  /**
   * Set one metadata key on a node.
   *
   * @param {string} entityId
   * @param {string} key
   * @param {any} value - Pass `undefined` to remove the key
   * @returns {GraphNode} The updated entity
   */
  setNodeMetadata(entityId, key, value) {
    return this.#setMetadata(
      this.#nodes,
      "node",
      entityId,
      key,
      value,
      "changeNode",
    );
  }

  // ## Edges

  /**
   * Add an edge between two existing node ports. Duplicate edges (same
   * source and target pair) are rejected.
   *
   * @param {{ from: GraphPortRef, to: GraphPortRef, metadata?: Object<string, any>, entity_id?: string }} definition
   * @returns {GraphEdge} The frozen stored entity
   */
  addEdge(definition) {
    const entityId =
      definition.entity_id === undefined
        ? this.#nextId("edge")
        : requireString(definition.entity_id, "entity_id");
    if (this.#edges.has(entityId)) {
      throw new GraphModelError(`Edge "${entityId}" already exists`);
    }
    const from = requirePortRef(definition.from, "from");
    const to = requirePortRef(definition.to, "to");
    this.#requireNodeRef(from.node, "from.node");
    this.#requireNodeRef(to.node, "to.node");
    const duplicateId = this.#edgeIndex.get(edgeKey(from, to));
    if (duplicateId !== undefined) {
      throw new GraphModelError(
        `Edge "${duplicateId}" already connects ${from.node}:${from.port} to ${to.node}:${to.port}`,
      );
    }
    const edge = this.#freezeEdge(entityId, from, to, definition.metadata);
    this.#edges.set(entityId, edge);
    this.#edgeIndex.set(edgeKey(from, to), entityId);
    this.#emit("addEdge", { entity: edge });
    return edge;
  }

  /**
   * @param {string} entityId
   * @returns {GraphEdge|undefined}
   */
  edge(entityId) {
    return this.#edges.get(entityId);
  }

  /**
   * All edges, in insertion order.
   *
   * @returns {GraphEdge[]}
   */
  edges() {
    return [...this.#edges.values()];
  }

  /**
   * All edges with the given node as their source.
   *
   * @param {string} nodeId
   * @returns {GraphEdge[]}
   */
  edgesFrom(nodeId) {
    return this.edges().filter((edge) => edge.from.node === nodeId);
  }

  /**
   * All edges with the given node as their target.
   *
   * @param {string} nodeId
   * @returns {GraphEdge[]}
   */
  edgesTo(nodeId) {
    return this.edges().filter((edge) => edge.to.node === nodeId);
  }

  /**
   * @param {string} entityId
   * @returns {GraphEdge} The removed entity
   */
  removeEdge(entityId) {
    const edge = this.#requireEntity(this.#edges, "edge", entityId);
    this.#edgeIndex.delete(edgeKey(edge.from, edge.to));
    this.#edges.delete(entityId);
    this.#emit("removeEdge", { entity: edge });
    return edge;
  }

  /**
   * Set one metadata key on an edge.
   *
   * @param {string} entityId
   * @param {string} key
   * @param {any} value
   * @returns {GraphEdge}
   */
  setEdgeMetadata(entityId, key, value) {
    return this.#setMetadata(
      this.#edges,
      "edge",
      entityId,
      key,
      value,
      "changeEdge",
    );
  }

  // ## IIPs

  /**
   * Add an initial Information Packet targeting an existing node port.
   *
   * @param {{ data: any, to: GraphPortRef, metadata?: Object<string, any>, entity_id?: string }} definition
   * @returns {GraphIIP} The frozen stored entity
   */
  addIIP(definition) {
    const entityId =
      definition.entity_id === undefined
        ? this.#nextId("iip")
        : requireString(definition.entity_id, "entity_id");
    if (this.#iips.has(entityId)) {
      throw new GraphModelError(`IIP "${entityId}" already exists`);
    }
    const to = requirePortRef(definition.to, "to");
    this.#requireNodeRef(to.node, "to.node");
    const from = Object.freeze({ data: freezeIipData(definition.data) });
    const iip = this.#freezeIip(entityId, from, to, definition.metadata);
    this.#iips.set(entityId, iip);
    this.#emit("addIIP", { entity: iip });
    return iip;
  }

  /**
   * @param {string} entityId
   * @returns {GraphIIP|undefined}
   */
  iip(entityId) {
    return this.#iips.get(entityId);
  }

  /**
   * All IIPs, in insertion order.
   *
   * @returns {GraphIIP[]}
   */
  iips() {
    return [...this.#iips.values()];
  }

  /**
   * @param {string} entityId
   * @returns {GraphIIP} The removed entity
   */
  removeIIP(entityId) {
    return this.#removeEntity(this.#iips, "iip", entityId, "removeIIP");
  }

  /**
   * Set one metadata key on an IIP.
   *
   * @param {string} entityId
   * @param {string} key
   * @param {any} value
   * @returns {GraphIIP}
   */
  setIIPMetadata(entityId, key, value) {
    return this.#setMetadata(
      this.#iips,
      "iip",
      entityId,
      key,
      value,
      "changeIIP",
    );
  }

  // ## Exports

  /**
   * Add an export exposing an internal port on the graph boundary. Public
   * names are unique within their direction.
   *
   * @param {{ direction: "inport"|"outport", public: string, internal: GraphPortRef, metadata?: Object<string, any>, entity_id?: string }} definition
   * @returns {GraphExport} The frozen stored entity
   */
  addExport(definition) {
    const entityId =
      definition.entity_id === undefined
        ? this.#nextId("export")
        : requireString(definition.entity_id, "entity_id");
    if (this.#exports.has(entityId)) {
      throw new GraphModelError(`Export "${entityId}" already exists`);
    }
    if (
      definition.direction !== "inport" &&
      definition.direction !== "outport"
    ) {
      throw new GraphModelError('direction must be "inport" or "outport"');
    }
    const publicName = requireString(definition.public, "public");
    const internal = requirePortRef(definition.internal, "internal");
    this.#requireNodeRef(internal.node, "internal.node");
    const clash = [...this.#exports.values()].find(
      (exp) =>
        exp.direction === definition.direction && exp.public === publicName,
    );
    if (clash) {
      throw new GraphModelError(
        `${definition.direction} "${publicName}" is already exported by "${clash.entity_id}"`,
      );
    }
    const exp = this.#freezeExport(
      entityId,
      definition.direction,
      publicName,
      internal,
      definition.metadata,
    );
    this.#exports.set(entityId, exp);
    this.#emit("addExport", { entity: exp });
    return exp;
  }

  /**
   * @param {string} entityId
   * @returns {GraphExport|undefined}
   */
  export(entityId) {
    return this.#exports.get(entityId);
  }

  /**
   * All exports, in insertion order.
   *
   * @returns {GraphExport[]}
   */
  exports() {
    return [...this.#exports.values()];
  }

  /**
   * @param {string} entityId
   * @returns {GraphExport} The removed entity
   */
  removeExport(entityId) {
    return this.#removeEntity(
      this.#exports,
      "export",
      entityId,
      "removeExport",
    );
  }

  /**
   * Set one metadata key on an export.
   *
   * @param {string} entityId
   * @param {string} key
   * @param {any} value
   * @returns {GraphExport}
   */
  setExportMetadata(entityId, key, value) {
    return this.#setMetadata(
      this.#exports,
      "export",
      entityId,
      key,
      value,
      "changeExport",
    );
  }

  // ## Groups

  /**
   * Add a visual-only group over existing nodes.
   *
   * @param {{ name: string, nodes: readonly string[], metadata?: Object<string, any>, entity_id?: string }} definition
   * @returns {GraphGroup} The frozen stored entity
   */
  addGroup(definition) {
    const entityId =
      definition.entity_id === undefined
        ? this.#nextId("group")
        : requireString(definition.entity_id, "entity_id");
    if (this.#groups.has(entityId)) {
      throw new GraphModelError(`Group "${entityId}" already exists`);
    }
    const name = requireString(definition.name, "name");
    if (!Array.isArray(definition.nodes)) {
      throw new GraphModelError("nodes must be an array of node ids");
    }
    for (const nodeId of definition.nodes) {
      this.#requireNodeRef(nodeId, "group member");
    }
    const group = Object.freeze({
      entity_id: entityId,
      name,
      nodes: Object.freeze([...definition.nodes]),
      ...(definition.metadata === undefined
        ? {}
        : { metadata: freezeMetadata(definition.metadata, "metadata") }),
    });
    this.#groups.set(entityId, group);
    this.#emit("addGroup", { entity: group });
    return group;
  }

  /**
   * @param {string} entityId
   * @returns {GraphGroup|undefined}
   */
  group(entityId) {
    return this.#groups.get(entityId);
  }

  /**
   * All groups, in insertion order.
   *
   * @returns {GraphGroup[]}
   */
  groups() {
    return [...this.#groups.values()];
  }

  /**
   * @param {string} entityId
   * @returns {GraphGroup} The removed entity
   */
  removeGroup(entityId) {
    return this.#removeEntity(this.#groups, "group", entityId, "removeGroup");
  }

  /**
   * Set one metadata key on a group.
   *
   * @param {string} entityId
   * @param {string} key
   * @param {any} value
   * @returns {GraphGroup}
   */
  setGroupMetadata(entityId, key, value) {
    return this.#setMetadata(
      this.#groups,
      "group",
      entityId,
      key,
      value,
      "changeGroup",
    );
  }

  // ## Canonical serialization

  /**
   * Canonical, deterministic representation: entity collections sorted by
   * `entity_id`, graph metadata as-is. Two models holding the same graph
   * serialize identically regardless of the order entities were added in.
   *
   * @returns {CanonicalGraph}
   */
  serialize() {
    return {
      ...(this.#name === undefined ? {} : { name: this.#name }),
      metadata: structuredClone(this.#metadata),
      nodes: this.nodes().sort(compareEntityIds),
      edges: this.edges().sort(compareEntityIds),
      iips: this.iips().sort(compareEntityIds),
      exports: this.exports().sort(compareEntityIds),
      groups: this.groups().sort(compareEntityIds),
    };
  }

  /**
   * Rebuild a model from a canonical representation produced by
   * {@link GraphModel#serialize}.
   *
   * @param {CanonicalGraph} canonical
   * @returns {GraphModel}
   */
  static fromCanonical(canonical) {
    const model = new GraphModel(
      canonical.name === undefined ? {} : { name: canonical.name },
    );
    for (const [key, value] of Object.entries(canonical.metadata ?? {})) {
      model.setGraphMetadata(key, value);
    }
    for (const node of canonical.nodes ?? []) {
      model.addNode(node);
    }
    for (const edge of canonical.edges ?? []) {
      model.addEdge(edge);
    }
    for (const iip of canonical.iips ?? []) {
      model.addIIP({
        entity_id: iip.entity_id,
        data: iip.from.data,
        to: iip.to,
        ...(iip.metadata === undefined ? {} : { metadata: iip.metadata }),
      });
    }
    for (const exp of canonical.exports ?? []) {
      model.addExport(exp);
    }
    for (const group of canonical.groups ?? []) {
      model.addGroup(group);
    }
    return model;
  }

  /**
   * Canonical JSON string for content addressing (epoch snapshots).
   *
   * @returns {string}
   */
  canonicalString() {
    return stableStringify(this.serialize());
  }

  /**
   * Deep clone of the whole model.
   *
   * @returns {GraphModel}
   */
  clone() {
    return GraphModel.fromCanonical(structuredClone(this.serialize()));
  }

  // ## Internals

  /**
   * @param {string} type
   * @param {any} detail
   * @returns {void}
   */
  #emit(type, detail) {
    this.dispatchEvent(new globalThis.CustomEvent(type, { detail }));
  }

  /**
   * @param {EntityKind} kind
   * @returns {string}
   */
  #nextId(kind) {
    let id;
    do {
      this.#counter += 1;
      id = makeEntityId(kind, this.#counter);
    } while (
      this.#nodes.has(id) ||
      this.#edges.has(id) ||
      this.#iips.has(id) ||
      this.#exports.has(id) ||
      this.#groups.has(id)
    );
    return id;
  }

  /**
   * @param {Map<string, any>} map
   * @param {EntityKind} kind
   * @param {string} entityId
   * @returns {any}
   */
  #requireEntity(map, kind, entityId) {
    const entity = map.get(entityId);
    if (entity === undefined) {
      throw new GraphModelError(`No such ${kind}: "${entityId}"`);
    }
    return entity;
  }

  /**
   * @param {string} nodeId
   * @param {string} field
   * @returns {void}
   */
  #requireNodeRef(nodeId, field) {
    if (!this.#nodes.has(nodeId)) {
      throw new GraphModelError(`${field} references unknown node "${nodeId}"`);
    }
  }

  /**
   * @param {string} entityId
   * @param {GraphPortRef} from
   * @param {GraphPortRef} to
   * @param {Object<string, any>|undefined} metadata
   * @returns {GraphEdge}
   */
  #freezeEdge(entityId, from, to, metadata) {
    const frozenMetadata = freezeMetadata(metadata, "metadata");
    return frozenMetadata === undefined
      ? Object.freeze({
          entity_id: entityId,
          from: Object.freeze(from),
          to: Object.freeze(to),
        })
      : Object.freeze({
          entity_id: entityId,
          from: Object.freeze(from),
          to: Object.freeze(to),
          metadata: frozenMetadata,
        });
  }

  /**
   * @param {string} entityId
   * @param {{ data: any }} from
   * @param {GraphPortRef} to
   * @param {Object<string, any>|undefined} metadata
   * @returns {GraphIIP}
   */
  #freezeIip(entityId, from, to, metadata) {
    const frozenMetadata = freezeMetadata(metadata, "metadata");
    return frozenMetadata === undefined
      ? Object.freeze({
          entity_id: entityId,
          from: Object.freeze(from),
          to: Object.freeze(to),
        })
      : Object.freeze({
          entity_id: entityId,
          from: Object.freeze(from),
          to: Object.freeze(to),
          metadata: frozenMetadata,
        });
  }

  /**
   * @param {string} entityId
   * @param {"inport"|"outport"} direction
   * @param {string} publicName
   * @param {GraphPortRef} internal
   * @param {Object<string, any>|undefined} metadata
   * @returns {GraphExport}
   */
  #freezeExport(entityId, direction, publicName, internal, metadata) {
    const frozenMetadata = freezeMetadata(metadata, "metadata");
    return frozenMetadata === undefined
      ? Object.freeze({
          entity_id: entityId,
          direction,
          public: publicName,
          internal: Object.freeze(internal),
        })
      : Object.freeze({
          entity_id: entityId,
          direction,
          public: publicName,
          internal: Object.freeze(internal),
          metadata: frozenMetadata,
        });
  }

  /**
   * Remove an entity from a collection and emit its removal event.
   *
   * @template T
   * @param {Map<string, T>} map
   * @param {EntityKind} kind
   * @param {string} entityId
   * @param {string} eventType
   * @returns {T} The removed entity
   */
  #removeEntity(map, kind, entityId, eventType) {
    const entity = this.#requireEntity(map, kind, entityId);
    map.delete(entityId);
    this.#emit(eventType, { entity });
    return entity;
  }

  /**
   * Replace an entity with a copy carrying an updated metadata map, and
   * emit its change event.
   *
   * @template T
   * @param {Map<string, T>} map
   * @param {EntityKind} kind
   * @param {string} entityId
   * @param {string} key
   * @param {any} value
   * @param {string} eventType
   * @returns {T} The updated entity
   */
  #setMetadata(map, kind, entityId, key, value, eventType) {
    const entity = this.#requireEntity(map, kind, entityId);
    requireString(key, "key");
    const metadata = {
      .../** @type {{ metadata?: Object<string, any> }} */ (
        entity.metadata ?? {}
      ),
    };
    if (value === undefined) {
      delete metadata[key];
    } else {
      metadata[key] = value;
    }
    const { metadata: previousMetadata, ...rest } =
      /** @type {{ metadata?: Object<string, any> }} */ (entity);
    const updated = /** @type {T} */ (
      Object.freeze({
        ...rest,
        ...(Object.keys(metadata).length === 0
          ? {}
          : { metadata: deepFreeze(metadata) }),
      })
    );
    map.set(entityId, updated);
    this.#emit(eventType, { entity: updated, key, value });
    return updated;
  }
}
