/**
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
 * @typedef {import("./graph/entities.js").GraphPortRef} GraphPortRef
 */
/**
 * @typedef {import("./graph/entities.js").GraphNode} GraphNode
 */
/**
 * @typedef {import("./graph/entities.js").GraphEdge} GraphEdge
 */
/**
 * @typedef {import("./graph/entities.js").GraphIIP} GraphIIP
 */
/**
 * @typedef {import("./graph/entities.js").GraphExport} GraphExport
 */
/**
 * @typedef {import("./graph/entities.js").GraphGroup} GraphGroup
 */
/**
 * @typedef {import("./graph/entities.js").EntityKind} EntityKind
 */
