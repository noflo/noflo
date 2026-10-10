/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: MIT
 * @module @noflo/graph
 * @description `@noflo/graph` — the native graph model for NoFlo 2.x
 *   (work document #10): nodes, edges, IIPs, exports, and groups over one
 *   entity model with plain and CRDT operation modes, plus FBP JSON as an
 *   interchange adapter.
 */

/* @ts-self-types="./index.d.ts" */

export { stableStringify } from "./graph/canonical.js";
export {
  entityKinds,
  GraphModelError,
  sameRef,
} from "./graph/entities.js";
export { exportFbpJson, importFbpJson } from "./graph/fbpJson.js";
export { GraphModel } from "./graph/GraphModel.js";

/**
 * Reference to one end of a connection: a node (by `entity_id`) and one of
 * its ports. Addressable (array) ports target a specific slot through the
 * optional `index`.
 * @typedef {import("./graph/entities.js").GraphPortRef} GraphPortRef
 */

/**
 * A process instance in the graph.
 * @typedef {import("./graph/entities.js").GraphNode} GraphNode
 */

/**
 * A connection between two node ports.
 * @typedef {import("./graph/entities.js").GraphEdge} GraphEdge
 */

/**
 * An Information Packet injected into the graph at network start.
 * @typedef {import("./graph/entities.js").GraphIIP} GraphIIP
 */

/**
 * A public port exposing part of the graph boundary, as `INPORT`/`OUTPORT`
 * does in the .fbp DSL.
 * @typedef {import("./graph/entities.js").GraphExport} GraphExport
 */

/**
 * A named, visual-only collection of nodes.
 * @typedef {import("./graph/entities.js").GraphGroup} GraphGroup
 */

/**
 * The five first-class entity kinds, in canonical (serialization) order.
 * @typedef {import("./graph/entities.js").EntityKind} EntityKind
 */
