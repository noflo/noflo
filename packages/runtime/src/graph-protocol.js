/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module graph-protocol
 * @description The CRDT graph synchronization server side (work document #28
 *   phase 3, wire per work document #4 §5): the epoch handshake over the
 *   canonical graph serialization, bidirectional `0x14` operation flow, and
 *   baseline snapshots for stale clients.
 *
 *   The runtime holds a `GraphModel` (work document #10) as the live epoch.
 *   Its canonical string is content-addressed: the epoch id is the SHA-256
 *   hex digest of the canonical serialization, so epoch comparison needs no
 *   clocks to be meaningful. Model events map to `0x14` ops (the total
 *   projection of work document #4 §5), incoming ops apply through the
 *   model's mutators, and applied operations rebroadcast to the *other*
 *   clients so runtime-initiated and client-initiated changes converge via
 *   the op log.
 */

import {
  CMD_CRDT_SYNC_REQ,
  CMD_CRDT_UPDATE,
  encodeCrdtStaleEpoch,
  encodeCrdtUpdate,
  encodeCrdtUpToDate,
  OP_TYPE,
  ProtocolError,
} from "@noflo/fbp-protocol";
import { GraphModelError } from "@noflo/graph";

/**
 * Serve baseline snapshots for stale clients: the provider receives the
 * canonical graph bytes and returns the hash under which the transport can
 * serve them (a Reticulum Resource). Backed by the transport layer, which
 * owns resource transfer; without a provider, stale clients cannot
 * resynchronize and the attempt surfaces as an `unsupported` event.
 *
 * @typedef {(bytes: Uint8Array) => string | Promise<string>} ResourceProvider
 */

/**
 * The graph synchronization protocol handler, bound to a
 * {@link import("./runtime-server.js").RuntimeServer} via
 * {@link GraphProtocol#register}.
 */
export class GraphProtocol {
  /**
   * @param {object} options
   * @param {import("@noflo/graph").GraphModel} options.graph The live epoch.
   * @param {string} [options.clientId] Client id the runtime stamps on its
   *   own operations; defaults to `runtime`.
   * @param {ResourceProvider} [options.resourceProvider] Baseline snapshot
   *   provider for `0x12` stale-epoch replies.
   */
  constructor(options) {
    this.graph = options.graph;
    this.clientId = options.clientId ?? "runtime";
    this.resourceProvider = options.resourceProvider ?? null;
    /** @type {number} Logical clock of the runtime's own operations. */
    this.clock = 0;
    /**
     * Echo-suppression depth: while > 0, graph events are changes the
     * runtime itself just applied from an inbound op — clients already have
     * them, so they must not be re-emitted as ops.
     *
     * @type {number}
     */
    this.suppress = 0;
    /** @type {string|null} */
    this.epochHash = null;
    this.epochDirty = true;
    /** @type {Map<string, number>} Client logical clocks learned from syncs and updates. */
    this.knownClocks = new Map();
  }

  /**
   * The current epoch id: SHA-256 hex over the canonical graph
   * serialization, computed lazily and cached until the graph changes.
   *
   * @returns {Promise<string>}
   */
  async epoch() {
    if (this.epochDirty || this.epochHash === null) {
      const bytes = new TextEncoder().encode(this.graph.canonicalString());
      this.epochHash = await sha256Hex(bytes);
      this.epochDirty = false;
    }
    return this.epochHash;
  }

  /**
   * Register the `0x10` block handlers on a runtime server and subscribe to
   * the graph model's events. Requires `GRAPH_READ` (sync handshake) and
   * `GRAPH_EDIT` (inbound mutations) on the server's advertised mask for
   * the corresponding client commands to be admitted.
   *
   * @param {import("./runtime-server.js").RuntimeServer} server
   * @returns {void}
   */
  register(server) {
    this.server = server;
    server.registerHandler(CMD_CRDT_SYNC_REQ, async (decoded, context) => {
      this.#learnClocks(decoded.clientClocks);
      const current = await this.epoch();
      if (decoded.epochId === current) {
        server.send(encodeCrdtUpToDate(), context);
        return;
      }
      if (!this.resourceProvider) {
        unsupported(server, "resourceProvider", decoded, context);
        return;
      }
      const bytes = new TextEncoder().encode(this.graph.canonicalString());
      const resourceHash = await this.resourceProvider(bytes);
      server.send(encodeCrdtStaleEpoch(current, resourceHash), context);
    });

    server.registerHandler(CMD_CRDT_UPDATE, (decoded, context) => {
      this.#learnClocks({ [decoded.clientId]: decoded.logicalClock });
      const applied =
        /** @type {boolean} */
        (this.#withSuppression(() => this.applyOp(decoded)));
      if (!applied) {
        // The runtime dropped the operation; it is the convergence point,
        // so the drop propagates — other clients converged on this state.
        return;
      }
      // Converge the op log: every *other* client learns the operation.
      server.broadcast(
        encodeCrdtUpdate({
          clientId: decoded.clientId,
          logicalClock: decoded.logicalClock,
          opType: decoded.opType,
          entityId: decoded.entityId,
          payload: decoded.payload,
        }),
        context,
      );
    });

    this.#subscribeModel();
  }

  /**
   * Apply one `0x14` operation to the graph model. Tombstones are
   * idempotent: tombstoning an unknown entity is a no-op that still counts
   * as applied (it confirms a removal the receiver already made). Metadata
   * ops for unknown entities are dropped — positional/UI metadata is the
   * droppable class by definition — and report as not applied.
   *
   * @param {{ opType: number, entityId: string|null, payload: any }} decoded
   * @returns {boolean} Whether the operation was applied (and should
   *   converge to other clients) rather than dropped.
   * @throws {ProtocolError} On an unknown op_type or a payload the model
   *   rejects as structurally invalid.
   */
  applyOp(decoded) {
    const { opType, entityId, payload } = decoded;
    try {
      switch (opType) {
        case OP_TYPE.INSERT_NODE:
          this.graph.addNode({ entity_id: entityId, ...payload });
          break;
        case OP_TYPE.INSERT_EDGE:
          this.graph.addEdge({ entity_id: entityId, ...payload });
          break;
        case OP_TYPE.INSERT_IIP:
          this.graph.addIIP({ entity_id: entityId, ...payload });
          break;
        case OP_TYPE.INSERT_EXPORT:
          this.graph.addExport({ entity_id: entityId, ...payload });
          break;
        case OP_TYPE.INSERT_GROUP:
          this.graph.addGroup({ entity_id: entityId, ...payload });
          break;
        case OP_TYPE.TOMBSTONE:
          this.#tombstone(entityId);
          break;
        case OP_TYPE.UI_METADATA:
          return this.#applyMetadata(entityId, payload);
        default:
          throw new ProtocolError("unknown op_type", CMD_CRDT_UPDATE);
      }
    } catch (error) {
      if (error instanceof GraphModelError) {
        // The model rejected the operation (unknown references,
        // duplicates). Surface as a protocol-level error event via the
        // caller; the frame is malformed in context.
        throw new ProtocolError(
          `graph rejected operation: ${error.message}`,
          CMD_CRDT_UPDATE,
        );
      }
      throw error;
    }
    return true;
  }

  /**
   * @param {string|null} entityId
   * @returns {void}
   */
  #tombstone(entityId) {
    if (entityId === null || entityId === undefined) {
      throw new ProtocolError(
        "tombstone requires an entity_id",
        CMD_CRDT_UPDATE,
      );
    }
    if (this.graph.hasNode(entityId)) {
      this.graph.removeNode(entityId);
    } else if (this.graph.edge(entityId)) {
      this.graph.removeEdge(entityId);
    } else if (this.graph.iip(entityId)) {
      this.graph.removeIIP(entityId);
    } else if (this.graph.export(entityId)) {
      this.graph.removeExport(entityId);
    } else if (this.graph.group(entityId)) {
      this.graph.removeGroup(entityId);
    }
    // Unknown entity: idempotent no-op.
  }

  /**
   * @param {string|null} entityId
   * @param {Record<string, any>} payload
   * @returns {boolean} Whether the metadata was applied to a known target.
   */
  #applyMetadata(entityId, payload) {
    if (entityId === null || entityId === undefined) {
      for (const [key, value] of Object.entries(payload ?? {})) {
        this.graph.setGraphMetadata(key, value);
      }
      return true;
    }
    /** @type {Array<[any, (key: string, value: any) => void]>} */
    const targets = [
      [
        this.graph.node(entityId),
        (key, value) => this.graph.setNodeMetadata(entityId, key, value),
      ],
      [
        this.graph.edge(entityId),
        (key, value) => this.graph.setEdgeMetadata(entityId, key, value),
      ],
      [
        this.graph.iip(entityId),
        (key, value) => this.graph.setIIPMetadata(entityId, key, value),
      ],
      [
        this.graph.export(entityId),
        (key, value) => this.graph.setExportMetadata(entityId, key, value),
      ],
      [
        this.graph.group(entityId),
        (key, value) => this.graph.setGroupMetadata(entityId, key, value),
      ],
    ];
    const target = targets.find(([entity]) => entity);
    if (!target) {
      // Metadata for an unknown entity is dropped: positional/UI metadata
      // is the droppable class by definition.
      return false;
    }
    for (const [key, value] of Object.entries(payload ?? {})) {
      target[1](key, value);
    }
    return true;
  }

  /**
   * @param {Record<string, number>} clocks
   * @returns {void}
   */
  #learnClocks(clocks) {
    for (const [clientId, clock] of Object.entries(clocks ?? {})) {
      const known = this.knownClocks.get(clientId) ?? 0;
      this.knownClocks.set(clientId, Math.max(known, clock));
    }
  }

  /**
   * Run a mutation with echo suppression: graph events fired inside are
   * changes the runtime just applied from the wire.
   *
   * @template T
   * @param {() => T} mutate
   * @returns {T}
   */
  #withSuppression(mutate) {
    this.suppress += 1;
    try {
      return mutate();
    } finally {
      this.suppress -= 1;
    }
  }

  /**
   * Subscribe to the graph model's events: adds map to insert ops, removals
   * to tombstones, metadata changes to UI-metadata ops. Every event marks
   * the epoch dirty.
   *
   * @returns {void}
   */
  #subscribeModel() {
    for (const kind of ["Node", "Edge", "IIP", "Export", "Group"]) {
      this.graph.addEventListener(`add${kind}`, (/** @type {any} */ event) => {
        this.epochDirty = true;
        if (this.suppress > 0) {
          return;
        }
        this.#emitInsert(
          /** @type {"INSERT_NODE"|"INSERT_EDGE"|"INSERT_IIP"|"INSERT_EXPORT"|"INSERT_GROUP"} */ (
            `INSERT_${kind.toUpperCase()}`
          ),
          event.detail.entity,
        );
      });
      this.graph.addEventListener(
        `remove${kind}`,
        (/** @type {any} */ event) => {
          this.epochDirty = true;
          if (this.suppress > 0) {
            return;
          }
          this.#broadcastOp(
            OP_TYPE.TOMBSTONE,
            event.detail.entity.entity_id,
            null,
          );
        },
      );
      this.graph.addEventListener(
        `change${kind}`,
        (/** @type {any} */ event) => {
          this.epochDirty = true;
          if (this.suppress > 0) {
            return;
          }
          const entity = event.detail.entity;
          this.#broadcastOp(
            OP_TYPE.UI_METADATA,
            entity.entity_id,
            entity.metadata ?? {},
          );
        },
      );
    }
    this.graph.addEventListener(
      "changeProperties",
      (/** @type {any} */ event) => {
        this.epochDirty = true;
        if (this.suppress > 0) {
          return;
        }
        this.#broadcastOp(OP_TYPE.UI_METADATA, null, {
          [event.detail.key]: event.detail.value,
        });
      },
    );
    this.graph.addEventListener("renameNode", (/** @type {any} */ event) => {
      // Renames project at the changeset→protocol boundary (work document
      // #4 §5); the runtime neither applies nor emits them.
      unsupported(this.server, "renameNode", event.detail, null);
    });
  }

  /**
   * @param {"INSERT_NODE"|"INSERT_EDGE"|"INSERT_IIP"|"INSERT_EXPORT"|"INSERT_GROUP"} opTypeName
   * @param {any} entity The frozen stored entity.
   * @returns {void}
   */
  #emitInsert(opTypeName, entity) {
    const opType = OP_TYPE[opTypeName];
    this.#broadcastOp(
      opType,
      entity.entity_id,
      entityPayload(opTypeName, entity),
    );
  }

  /**
   * Encode, stamp, and broadcast one operation.
   *
   * @param {number} opType
   * @param {string|null} entityId
   * @param {any} payload
   * @returns {void}
   */
  #broadcastOp(opType, entityId, payload) {
    this.clock += 1;
    this.server.broadcast(
      encodeCrdtUpdate({
        clientId: this.clientId,
        logicalClock: this.clock,
        opType,
        entityId,
        payload,
      }),
    );
  }
}

/**
 * The wire payload of an insert op: the entity definition without its id —
 * `entity_id` carries it (work document #4 §5).
 *
 * @param {string} opTypeName
 * @param {any} entity
 * @returns {any}
 */
function entityPayload(opTypeName, entity) {
  const { entity_id: _entityId, ...definition } = entity;
  if (opTypeName === "INSERT_IIP") {
    // The model stores IIPs as { entity_id, from: { data }, to, metadata };
    // the wire carries { to, data, metadata? }.
    const { from, ...rest } = definition;
    return { ...rest, data: from?.data };
  }
  return definition;
}

/**
 * @param {import("./runtime-server.js").RuntimeServer} server
 * @param {string} capability
 * @param {any} detail
 * @param {any} context
 * @returns {void}
 */
function unsupported(server, capability, detail, context) {
  server.dispatchEvent(
    new globalThis.CustomEvent("unsupported", {
      detail: { hook: capability, decoded: detail, context },
    }),
  );
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
