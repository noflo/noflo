/**
 * @file entities module
 * @description Entity shapes and validation for the NoFlo 2.x native graph
 *   model (work document #10).
 *
 *   The model has five first-class entity kinds — Node, Edge, IIP, Export,
 *   and Group — chosen to map one-to-one to the FBP Protocol 2.0 op types.
 *   Every entity carries:
 *
 *   - `entity_id` — the stable reference key within one graph. In plain mode
 *     it doubles as the user-facing node name; the FBP JSON interchange maps
 *     the JSON `id` field onto it. CRDT mode layers compact, client-scoped
 *     identifiers on top in a later slice.
 *   - `metadata` — an optional JSON-able key/value map. UI-only state
 *     (colors, layout hints, tracepoint config) lives here; in CRDT mode it
 *     converges as a separate last-writer-wins sub-state, so constrained
 *     nodes can drop it without breaking structural convergence.
 *
 *   Entities are validated on construction and frozen. The only mutation
 *   path is through the {@link import("./GraphModel.js").GraphModel} setters,
 *   which emit change events and replace the entity wholesale.
 */

/**
 * Reference to one end of a connection: a node (by `entity_id`) and one of
 * its ports. Addressable (array) ports target a specific slot through the
 * optional `index`.
 *
 * @typedef {Object} GraphPortRef
 * @property {string} node - `entity_id` of the referenced node
 * @property {string} port - Port name on that node
 * @property {number} [index] - Slot index for addressable ports
 */

/**
 * A process instance in the graph.
 *
 * @typedef {Object} GraphNode
 * @property {string} entity_id - Stable reference key; the node name
 * @property {string} [component] - Component the node instantiates; absent for placeholder nodes
 * @property {Object<string, any>} [metadata] - JSON-able key/value map
 */

/**
 * A connection between two node ports.
 *
 * @typedef {Object} GraphEdge
 * @property {string} entity_id - Stable reference key
 * @property {GraphPortRef} from - Source port
 * @property {GraphPortRef} to - Target port
 * @property {Object<string, any>} [metadata] - JSON-able key/value map
 */

/**
 * An Information Packet injected into the graph at network start.
 *
 * @typedef {Object} GraphIIP
 * @property {string} entity_id - Stable reference key
 * @property {{ data: any }} from - The initial data payload
 * @property {GraphPortRef} to - Target port receiving the data
 * @property {Object<string, any>} [metadata] - JSON-able key/value map
 */

/**
 * A public port exposing part of the graph boundary, as `INPORT`/`OUTPORT`
 * does in the .fbp DSL. Exports are first-class entities: they participate
 * in CRDT convergence and round-trip through FBP JSON.
 *
 * @typedef {Object} GraphExport
 * @property {string} entity_id - Stable reference key
 * @property {"inport"|"outport"} direction - Which boundary the export serves
 * @property {GraphPortRef} internal - The internal port being exposed
 * @property {string} public - Public name of the exported port
 * @property {Object<string, any>} [metadata] - JSON-able key/value map
 */

/**
 * A named, visual-only collection of nodes. Groups have no runtime
 * semantics — the engine ignores them — but survive CRDT convergence and
 * round-trip through FBP JSON. There are no spatial bounds: the UI derives
 * the visual rectangle from member node positions at render time.
 *
 * @typedef {Object} GraphGroup
 * @property {string} entity_id - Stable reference key
 * @property {string} name - Group name
 * @property {readonly string[]} nodes - `entity_id`s of member nodes
 * @property {Object<string, any>} [metadata] - JSON-able key/value map
 */

/**
 * @typedef {"node"|"edge"|"iip"|"export"|"group"} EntityKind
 */

/**
 * All entity kinds, in canonical (serialization) order.
 *
 * @type {EntityKind[]}
 */
export const entityKinds = ["node", "edge", "iip", "export", "group"];

/**
 * Compare two port references for identity: same node, port, and array
 * slot (where `undefined` and absence both mean "not addressable").
 *
 * @param {GraphPortRef} a
 * @param {GraphPortRef} b
 * @returns {boolean}
 */
export function sameRef(a, b) {
  return (
    a.node === b.node &&
    a.port === b.port &&
    (a.index ?? undefined) === (b.index ?? undefined)
  );
}

/**
 * Error thrown for invalid entity shapes or referential integrity
 * violations (for example an edge referencing a node that does not exist).
 * Distinguishable from programming errors (`TypeError`) so the engine seam
 * and the CRDT layer can tell user-data problems from bugs.
 */
export class GraphModelError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = "GraphModelError";
  }
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
export function requireString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new GraphModelError(`${field} must be a non-empty string`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {GraphPortRef}
 */
export function requirePortRef(value, field) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GraphModelError(`${field} must be a { node, port } reference`);
  }
  const ref = /** @type {Record<string, unknown>} */ (value);
  requireString(ref.node, `${field}.node`);
  requireString(ref.port, `${field}.port`);
  /** @type {{ node: string, port: string, index?: number }} */
  const out = {
    node: /** @type {string} */ (ref.node),
    port: /** @type {string} */ (ref.port),
  };
  if (ref.index !== undefined) {
    if (
      typeof ref.index !== "number" ||
      !Number.isInteger(ref.index) ||
      ref.index < 0
    ) {
      throw new GraphModelError(
        `${field}.index must be a non-negative integer`,
      );
    }
    out.index = ref.index;
  }
  return out;
}

/**
 * Validate an optional metadata map and return a deep-frozen clone.
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {Object<string, any>|undefined} Frozen clone, or undefined when absent
 */
export function freezeMetadata(value, field) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new GraphModelError(`${field} must be an object`);
  }
  return deepFreeze(structuredClone(value));
}

/**
 * Prepare an IIP payload for storage: deep-frozen, and detached from the
 * caller's object where possible.
 *
 * JSON-able payloads are structured-cloned first, so later mutations of the
 * caller's object cannot leak into graph state. Payloads that cannot be
 * structured-cloned (for example callbacks) are frozen and stored by
 * reference.
 *
 * @param {any} value
 * @returns {any} Frozen payload
 */
export function freezeIipData(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  let data = value;
  try {
    data = structuredClone(value);
  } catch {
    // Non-cloneable payload (e.g. a callback): freeze and store by reference.
  }
  return deepFreeze(data);
}

/**
 * @param {any} value
 * @returns {any}
 */
export function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const KIND_PREFIX = /** @type {Record<EntityKind, string>} */ ({
  node: "n",
  edge: "e",
  iip: "i",
  export: "x",
  group: "g",
});

/**
 * Generate a compact entity id for a kind. Plain mode uses per-graph
 * monotonic counters; CRDT mode will namespace these per client later.
 *
 * @param {EntityKind} kind
 * @param {number} counter
 * @returns {string}
 */
export function makeEntityId(kind, counter) {
  return `${KIND_PREFIX[kind]}${counter}`;
}

/**
 * Compare two entities by id for canonical (deterministic) ordering.
 *
 * @param {{ entity_id: string }} a
 * @param {{ entity_id: string }} b
 * @returns {number}
 */
export function compareEntityIds(a, b) {
  if (a.entity_id < b.entity_id) {
    return -1;
  }
  if (a.entity_id > b.entity_id) {
    return 1;
  }
  return 0;
}
