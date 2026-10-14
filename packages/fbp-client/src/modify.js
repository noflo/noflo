//     @noflo/fbp-client - Command-line tool for FBP Protocol 2.0
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @file modify module
 * @description The graph modification commands (work document #34 phase
 *   4): semantic `add-*`/`remove`/`set-metadata` helpers over the `0x14`
 *   op wire format (INSERT_*, TOMBSTONE, UI_METADATA), with rejection UX
 *   as a first-class concern. The wire-level truth: modify is tombstone +
 *   insert at the wire level, never the semantic unit, so the semantic
 *   helpers here mint entity ids and shape payloads before the op
 *   travels.
 *
 *   Confirmation model: the protocol has no ack for an applied op — the
 *   runtime rebroadcasts applied ops to the *other* clients and answers
 *   refusals with an explicit `0x17 CMD_OP_REJECTED`. On the main plane
 *   an applied insert changes the runtime's epoch (the content hash of
 *   the canonical graph), so the mirror resync that follows the send is
 *   the confirmation: `0x12` stale means the op (or a concurrent one)
 *   landed and the baseline carries the new state; `0x11` up-to-date
 *   means the graph did not change — a converged no-op such as
 *   tombstoning an unknown entity. The `0x17` arrives on the link before
 *   the sync reply (the runtime answers synchronously and links deliver
 *   in order), so by the time the resync resolves the rejection is
 *   known.
 *
 *   On other planes the epoch handshake is not available (ephemeral
 *   planes carry no baseline resource), so confirmation there is the
 *   bounded rejection wait alone: a refusal arrives within `confirmMs`,
 *   silence means the op stands.
 */

import { CMD_CRDT_UPDATE, OP_TYPE, REASON } from "@noflo/fbp-protocol";

/**
 * The human names for the `0x17` rejection reason vocabulary.
 *
 * @type {Record<number, string>}
 */
export const REASON_NAMES = {
  [REASON.UNSPECIFIED]: "unspecified",
  [REASON.HARDWARE_CONSTRAINED]: "hardware-constrained",
  [REASON.PERMISSION_DENIED]: "permission-denied",
  [REASON.LINK_SATURATED]: "link-saturated",
  [REASON.CONCURRENCY_LOCK]: "concurrency-lock",
  [REASON.UNSUPPORTED]: "unsupported",
  [REASON.UNKNOWN_COMMAND]: "unknown-command",
  [REASON.MALFORMED]: "malformed",
  [REASON.PAYLOAD_UNSUPPORTED]: "payload-unsupported",
  [REASON.STUB]: "stub",
  [REASON.INVALID_STATE]: "invalid-state",
  [REASON.UNKNOWN_TARGET]: "unknown-target",
};

/**
 * The runtime refused an operation or command. Carries the decoded `0x17`
 * rejection so callers (and the CLI) can surface *why*.
 */
export class OpRejectedError extends Error {
  /**
   * @param {import("@noflo/runtime-client").OpRejection} rejection
   */
  constructor(rejection) {
    super(describeRejection(rejection));
    this.name = "OpRejectedError";
    /** @type {import("@noflo/runtime-client").OpRejection} */
    this.rejection = rejection;
  }
}

/**
 * The human-readable one-liner for a rejection: the reason name (the
 * numeric vocabulary when the runtime sent a code, the free-form reason
 * string it sends for refused `0x14` ops) plus any message text.
 *
 * @param {import("@noflo/runtime-client").OpRejection} rejection
 * @returns {string}
 */
export function describeRejection(rejection) {
  const { detail } = rejection;
  const reason =
    typeof detail?.reason === "number"
      ? (REASON_NAMES[detail.reason] ?? `reason ${detail.reason}`)
      : (detail?.reason ?? "unspecified");
  const message = typeof detail?.message === "string" ? detail.message : null;
  return message ? `rejected (${reason}): ${message}` : `rejected (${reason})`;
}

/**
 * @typedef {import("./index.js").Session} Session
 */

/**
 * The result of a modification: whether the runtime's graph changed, the
 * epoch the mirror now stands at, and the entity as the runtime stores
 * it after the resync (nil for removals and no-ops).
 *
 * @typedef {Object} ModifyResult
 * @property {boolean} applied - Whether the runtime's graph changed
 * @property {string|number} epochId - The epoch the mirror was resynced to
 * @property {any} entity - The affected entity after the resync, when resolvable
 */

/**
 * Send one semantic op to the runtime and confirm the outcome against
 * the mirror. See the module description for the confirmation model.
 *
 * Requires the session to carry a CRDT client id (the CLI derives it
 * from its persisted identity) — ops are attributed in the op stream.
 *
 * @param {Session} session
 * @param {Object} op
 * @param {number} op.opType - One of `OP_TYPE`
 * @param {string|null} op.entityId - The wire entity id (nil for graph-level metadata)
 * @param {any} op.payload - The op payload per the `OP_TYPE` wire shapes
 * @param {number|string|null} [op.planeId] - Target plane (nil = main graph; nil is
 *   the only plane with epoch-based confirmation)
 * @param {number} [op.confirmMs] - Rejection wait for non-main planes (default 5000)
 * @returns {Promise<ModifyResult>}
 */
export async function applyGraphOp(session, op) {
  const { client } = session;
  const { opType, entityId, payload, planeId = null, confirmMs = 5_000 } = op;
  if (!client.clientId) {
    throw new Error(
      "the session has no CRDT client id; pass clientId when connecting",
    );
  }
  // Arm the rejection listener before the op goes out: the runtime
  // answers a refusal before (and in link order ahead of) any sync reply
  /** @type {import("@noflo/runtime-client").OpRejection[]} */
  const rejections = [];
  /** @type {(value?: any) => void} */
  let rejectSeen = () => {};
  const rejectionSeen = new Promise((resolve) => {
    rejectSeen = resolve;
  });
  const listener = (/** @type {any} */ event) => {
    const rejection = event.detail;
    if (rejection.rejectedCmd !== CMD_CRDT_UPDATE) {
      return;
    }
    if ((rejection.planeId ?? null) !== (planeId ?? null)) {
      return;
    }
    const echoedId = rejection.detail?.entityId;
    if (echoedId != null && echoedId !== entityId) {
      return;
    }
    rejections.push(rejection);
    rejectSeen();
  };
  client.addEventListener("oprejected", listener);
  try {
    await client.sendGraphOp({ planeId, opType, entityId, payload });
    if (planeId !== null && planeId !== undefined) {
      // Ephemeral planes: no baseline resource to resync against, so
      // confirmation is the bounded rejection wait — a refusal arrives
      // in link order ahead of anything else we could await, and
      // short-circuits the window
      await Promise.race([
        new Promise((resolve) => setTimeout(resolve, confirmMs)),
        rejectionSeen,
      ]);
      if (rejections.length > 0) {
        throw new OpRejectedError(rejections[0]);
      }
      return {
        applied: true,
        epochId: client.epoch ?? "unknown",
        entity: null,
      };
    }
    const sync = await client.syncGraph();
    if (rejections.length > 0) {
      throw new OpRejectedError(rejections[0]);
    }
    return {
      applied: !sync.upToDate,
      epochId: sync.epochId,
      entity: resolveEntity(sync.graph, entityId),
    };
  } finally {
    client.removeEventListener("oprejected", listener);
  }
}

/**
 * The entity resolver for `ModifyResult.entity`: nodes, edges, IIPs,
 * exports, and groups all live in their own maps.
 *
 * @param {import("@noflo/graph").GraphModel} graph
 * @param {string|null} entityId
 * @returns {any}
 */
function resolveEntity(graph, entityId) {
  if (entityId === null || entityId === undefined) {
    return null;
  }
  return (
    graph.node(entityId) ??
    graph.edge(entityId) ??
    graph.iip(entityId) ??
    graph.export(entityId) ??
    graph.group(entityId) ??
    null
  );
}

/**
 * `add-node`: instantiate a component on the graph (`0x14` INSERT_NODE).
 * Mints a unique entity id when none is given.
 *
 * @param {Session} session
 * @param {Object} spec
 * @param {string} spec.component - Library-namespaced component name
 * @param {string} [spec.id] - Entity id (default: a fresh unique id)
 * @param {Record<string, any>} [spec.metadata]
 * @param {number|string|null} [spec.planeId]
 * @returns {Promise<ModifyResult>}
 */
export async function addNode(session, spec) {
  const { component, id, metadata, planeId } = /** @type {any} */ (spec);
  if (typeof component !== "string" || component.length === 0) {
    throw new Error("add-node requires a component name");
  }
  const entityId = id ?? crypto.randomUUID();
  const payload = metadata ? { component, metadata } : { component };
  return applyGraphOp(session, {
    opType: OP_TYPE.INSERT_NODE,
    entityId,
    payload,
    planeId,
  });
}

/**
 * Validate one `node:port` reference (with optional numeric index) into
 * the wire shape.
 *
 * @param {{ node: string, port: string, index?: number }} ref
 * @param {string} label - The field name for error messages
 * @returns {{ node: string, port: string, index?: number }}
 */
function portRef(ref, label) {
  if (!ref || typeof ref.node !== "string" || typeof ref.port !== "string") {
    throw new Error(`${label} needs a node and a port`);
  }
  return typeof ref.index === "number" ? { ...ref } : { ...ref };
}

/**
 * `add-edge`: connect two node ports (`0x14` INSERT_EDGE).
 *
 * @param {Session} session
 * @param {Object} spec
 * @param {{ node: string, port: string, index?: number }} spec.from
 * @param {{ node: string, port: string, index?: number }} spec.to
 * @param {string} [spec.id] - Entity id (default: a fresh unique id)
 * @param {Record<string, any>} [spec.metadata]
 * @param {number|string|null} [spec.planeId]
 * @returns {Promise<ModifyResult>}
 */
export async function addEdge(session, spec) {
  const { from, to, id, metadata, planeId } = /** @type {any} */ (spec);
  const entityId = id ?? crypto.randomUUID();
  const payload = {
    from: portRef(from, "from"),
    to: portRef(to, "to"),
    ...(metadata ? { metadata } : {}),
  };
  return applyGraphOp(session, {
    opType: OP_TYPE.INSERT_EDGE,
    entityId,
    payload,
    planeId,
  });
}

/**
 * `add-iip`: attach initial information to a node's inport (`0x14`
 * INSERT_IIP).
 *
 * @param {Session} session
 * @param {Object} spec
 * @param {{ node: string, port: string, index?: number }} spec.to
 * @param {any} spec.data - JSON-serializable initial data
 * @param {string} [spec.id] - Entity id (default: a fresh unique id)
 * @param {Record<string, any>} [spec.metadata]
 * @param {number|string|null} [spec.planeId]
 * @returns {Promise<ModifyResult>}
 */
export async function addIip(session, spec) {
  const { to, data, id, metadata, planeId } = /** @type {any} */ (spec);
  if (data === undefined) {
    throw new Error("add-iip requires data");
  }
  const entityId = id ?? crypto.randomUUID();
  const payload = {
    to: portRef(to, "to"),
    data,
    ...(metadata ? { metadata } : {}),
  };
  return applyGraphOp(session, {
    opType: OP_TYPE.INSERT_IIP,
    entityId,
    payload,
    planeId,
  });
}

/**
 * `add-export`: expose an internal port on the graph's boundary (`0x14`
 * INSERT_EXPORT).
 *
 * @param {Session} session
 * @param {Object} spec
 * @param {"inport"|"outport"} spec.direction
 * @param {string} spec.public - The boundary name
 * @param {{ node: string, port: string, index?: number }} spec.internal
 * @param {string} [spec.id] - Entity id (default: a fresh unique id)
 * @param {Record<string, any>} [spec.metadata]
 * @param {number|string|null} [spec.planeId]
 * @returns {Promise<ModifyResult>}
 */
export async function addExport(session, spec) {
  const {
    direction,
    public: publicName,
    internal,
    id,
    metadata,
    planeId,
  } = /** @type {any} */ (spec);
  if (direction !== "inport" && direction !== "outport") {
    throw new Error('add-export direction must be "inport" or "outport"');
  }
  if (typeof publicName !== "string" || publicName.length === 0) {
    throw new Error("add-export requires a public name");
  }
  const entityId = id ?? crypto.randomUUID();
  const payload = {
    direction,
    public: publicName,
    internal: portRef(internal, "internal"),
    ...(metadata ? { metadata } : {}),
  };
  return applyGraphOp(session, {
    opType: OP_TYPE.INSERT_EXPORT,
    entityId,
    payload,
    planeId,
  });
}

/**
 * `add-group`: group nodes under a named, collapbable unit (`0x14`
 * INSERT_GROUP).
 *
 * @param {Session} session
 * @param {Object} spec
 * @param {string} spec.name
 * @param {string[]} spec.nodes - The member node ids
 * @param {string} [spec.id] - Entity id (default: a fresh unique id)
 * @param {Record<string, any>} [spec.metadata]
 * @param {number|string|null} [spec.planeId]
 * @returns {Promise<ModifyResult>}
 */
export async function addGroup(session, spec) {
  const { name, nodes, id, metadata, planeId } = /** @type {any} */ (spec);
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("add-group requires a name");
  }
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error("add-group requires at least one member node");
  }
  const entityId = id ?? crypto.randomUUID();
  const payload = {
    name,
    nodes: [...nodes],
    ...(metadata ? { metadata } : {}),
  };
  return applyGraphOp(session, {
    opType: OP_TYPE.INSERT_GROUP,
    entityId,
    payload,
    planeId,
  });
}

/**
 * `remove <entityId>`: tombstone any graph entity (`0x14` TOMBSTONE).
 * The runtime resolves the entity kind from its registry; tombstoning an
 * unknown entity is a converged no-op on both sides.
 *
 * @param {Session} session
 * @param {string} entityId
 * @param {Object} [options]
 * @param {number|string|null} [options.planeId]
 * @returns {Promise<ModifyResult>}
 */
export function removeEntity(session, entityId, options = {}) {
  const { planeId } = /** @type {any} */ (options);
  if (typeof entityId !== "string" || entityId.length === 0) {
    throw new Error("remove requires an entity id");
  }
  return applyGraphOp(session, {
    opType: OP_TYPE.TOMBSTONE,
    entityId,
    payload: null,
    planeId,
  });
}

/**
 * `set-metadata`: change metadata on an entity, or on the graph itself
 * when the entity id is nil (`0x14` UI_METADATA). The payload is the
 * metadata map; keys not mentioned are kept. Metadata for an unknown
 * entity is the protocol's droppable class — the runtime drops it
 * silently and the resync reports `applied: false`.
 *
 * @param {Session} session
 * @param {string|null} entityId - nil addresses graph-level metadata
 * @param {Record<string, any>} metadata
 * @param {Object} [options]
 * @param {number|string|null} [options.planeId]
 * @returns {Promise<ModifyResult>}
 */
export function setMetadata(session, entityId, metadata, options = {}) {
  const { planeId } = /** @type {any} */ (options);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("set-metadata requires a metadata object");
  }
  if (entityId !== null && typeof entityId !== "string") {
    throw new Error("set-metadata entity id must be a string or nil");
  }
  return applyGraphOp(session, {
    opType: OP_TYPE.UI_METADATA,
    entityId,
    payload: { ...metadata },
    planeId,
  });
}
