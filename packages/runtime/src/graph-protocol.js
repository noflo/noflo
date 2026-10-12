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
/* @ts-self-types="./graph-protocol.d.ts" */

import {
  CMD_CRDT_SYNC_REQ,
  CMD_CRDT_UPDATE,
  CMD_PLANE_DROP,
  CMD_PLANE_LIST,
  encodeCrdtStaleEpoch,
  encodeCrdtUpdate,
  encodeCrdtUpToDate,
  encodeOpRejected,
  encodePlaneDrop,
  encodePlaneListRes,
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
   * @param {number} [options.maxKnownClocks] Budget for the client logical
   *   clock map. Clocks arrive from the wire with attacker-chosen client
   *   ids, so the map is capped: once full, the oldest-learned client is
   *   evicted. Defaults to 1024.
   */
  constructor(options) {
    this.graph = options.graph;
    this.clientId = options.clientId ?? "runtime";
    this.resourceProvider = options.resourceProvider ?? null;
    this.maxKnownClocks = options.maxKnownClocks ?? 1024;
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
      if (decoded.planeId !== null) {
        // Materialize the ephemeral plane on first sync (work document #4
        // update #28: the plane registry). The `sg/` prefix is reserved
        // for subgraph planes: a client minting one is rejected (update
        // #42) — silence never carries semantics.
        let plane;
        try {
          plane = this.#plane(decoded.planeId);
        } catch (error) {
          server.send(
            encodeOpRejected({
              rejectedCmd: CMD_CRDT_SYNC_REQ,
              planeId: decoded.planeId,
              detail: {
                reason: error instanceof Error ? error.message : String(error),
              },
            }),
            context,
          );
          return;
        }
        const current = this.#planeEpoch(plane);
        if (decoded.epochId === current) {
          server.send(encodeCrdtUpToDate(decoded.planeId, current), context);
          return;
        }
        // A freshly materialized plane is always stale: the client fetches
        // the baseline (empty for a new plane, or whatever ops already
        // arrived).
        const bytes = new TextEncoder().encode(plane.model.canonicalString());
        // Ephemeral planes have no resource provider: the client built
        // them from ops, so the full state travels as ops. Reply stale
        // with a synthetic hash.
        server.send(
          encodeCrdtStaleEpoch(
            decoded.planeId,
            current,
            bytes.length > 0 ? "ephemeral" : "empty",
          ),
          context,
        );
        return;
      }
      this.#learnClocks(decoded.clientClocks);
      const current = await this.epoch();
      if (decoded.epochId === current) {
        server.send(encodeCrdtUpToDate(null, current), context);
        return;
      }
      if (!this.resourceProvider) {
        unsupported(server, "resourceProvider", decoded, context);
        return;
      }
      const bytes = new TextEncoder().encode(this.graph.canonicalString());
      const resourceHash = await this.resourceProvider(bytes);
      server.send(encodeCrdtStaleEpoch(null, current, resourceHash), context);
    });

    server.registerHandler(CMD_CRDT_UPDATE, (decoded, context) => {
      if (decoded.planeId !== null) {
        // Materialize and apply on the ephemeral plane. The `sg/` prefix
        // rejection surfaces as 0x17 like any other refused operation.
        let plane;
        try {
          plane = this.#plane(decoded.planeId);
        } catch (error) {
          server.send(
            encodeOpRejected({
              rejectedCmd: CMD_CRDT_UPDATE,
              planeId: decoded.planeId,
              detail: {
                reason: error instanceof Error ? error.message : String(error),
              },
            }),
            context,
          );
          return;
        }
        let applied;
        try {
          applied = this.#applyToPlane(plane, decoded);
        } catch (error) {
          server.send(
            encodeOpRejected({
              rejectedCmd: CMD_CRDT_UPDATE,
              planeId: decoded.planeId,
              detail: {
                clientId: decoded.clientId,
                logicalClock: decoded.logicalClock,
                entityId: decoded.entityId,
                reason: error instanceof Error ? error.message : String(error),
              },
            }),
            context,
          );
          return;
        }
        if (applied) {
          server.broadcast(
            encodeCrdtUpdate({
              planeId: decoded.planeId,
              clientId: decoded.clientId,
              logicalClock: decoded.logicalClock,
              opType: decoded.opType,
              entityId: decoded.entityId,
              payload: decoded.payload,
            }),
            context,
          );
        }
        // else: converged no-op — silent is correct (update #34: "a no-op
        // that still counts as converged" must NOT be rejected).
        return;
      }
      this.#learnClocks({ [decoded.clientId]: decoded.logicalClock });
      let applied;
      try {
        applied =
          /** @type {boolean} */
          (this.#withSuppression(() => this.applyOp(decoded)));
      } catch (error) {
        // Actual rejection: the model refused the op. The client must
        // revert its mirror (work document #4 update #34).
        server.send(
          encodeOpRejected({
            rejectedCmd: CMD_CRDT_UPDATE,
            planeId: null,
            detail: {
              clientId: decoded.clientId,
              logicalClock: decoded.logicalClock,
              entityId: decoded.entityId,
              reason: error instanceof Error ? error.message : String(error),
            },
          }),
          context,
        );
        return;
      }
      if (!applied) {
        // Converged no-op (metadata on unknown entity) — silent is correct.
        return;
      }
      server.broadcast(
        encodeCrdtUpdate({
          planeId: null,
          clientId: decoded.clientId,
          logicalClock: decoded.logicalClock,
          opType: decoded.opType,
          entityId: decoded.entityId,
          payload: decoded.payload,
        }),
        context,
      );
    });

    server.registerHandler(CMD_PLANE_LIST, (_decoded, context) => {
      const entries = [
        {
          planeId: null,
          kind: "main",
          parentPlane: null,
          nodeId: null,
          componentName: null,
          name: this.graph.name ?? "main",
        },
      ];
      for (const [planeId, plane] of this.#planes) {
        entries.push({
          planeId,
          kind: plane.kind,
          parentPlane: plane.parentPlane ?? null,
          nodeId: plane.nodeId ?? null,
          componentName: plane.componentName ?? null,
          name:
            plane.kind === "subgraph"
              ? (plane.componentName ?? String(planeId))
              : String(planeId),
        });
      }
      server.send(encodePlaneListRes(entries), context);
    });

    server.registerHandler(CMD_PLANE_DROP, (decoded, context) => {
      const plane = this.#planes.get(decoded.planeId);
      if (plane?.kind === "subgraph") {
        // Subgraph planes follow their component's presence in the graph
        // (work document #4 update #28 lifecycle matrix): they are never
        // dropped via a lifecycle command.
        server.send(
          encodeOpRejected({
            rejectedCmd: CMD_PLANE_DROP,
            planeId: decoded.planeId,
            detail: {
              reason:
                "subgraph planes follow their component's presence in the graph",
            },
          }),
          context,
        );
        return;
      }
      if (plane) {
        // Dropping an ephemeral plane cascades to its subgraph
        // descendants — their anchor left the tree with the host.
        this.#planes.delete(decoded.planeId);
        this.#dropSubgraphPlanesUnder(decoded.planeId);
      }
      // Acknowledge the drop to the requesting context — silence never
      // carries semantics. Other clients on the plane learn through the
      // plane's telemetry channel.
      server.send(encodePlaneDrop(decoded.planeId), context);
      // Notify the execution protocol so it can stop the plane's network
      // (cross-protocol wiring: the plane registry owns the graph state,
      // the execution protocol owns the running network).
      server.dispatchEvent(
        new globalThis.CustomEvent("planedrop", {
          detail: { planeId: decoded.planeId },
        }),
      );
    });

    this.#subscribeModel();
  }

  /**
   * Get or materialize an ephemeral plane by its client-minted id.
   * Public accessor for the execution protocol's multi-plane support.
   * Subgraph planes are returned when registered; their reserved `sg/`
   * ids never materialize.
   *
   * @param {string|number} planeId
   * @returns {{ model: import("@noflo/graph").GraphModel|null }|null}
   */
  getPlane(planeId) {
    if (planeId === null || planeId === undefined) return null;
    const existing = this.#planes.get(planeId);
    if (existing) return existing;
    if (typeof planeId === "string" && planeId.startsWith("sg/")) return null;
    return this.#plane(planeId) ?? null;
  }

  /**
   * Apply one `0x14` operation to the graph model. Tombstones are
   * idempotent: tombstoning an unknown entity is a no-op that still counts
   * as applied (it confirms a removal the receiver already made). Metadata
   * ops for unknown entities are dropped — positional/UI metadata is the
   * droppable class by definition — and report as not applied.
   *
   * @param {{ opType: number, entityId: string|null, payload: any }} decoded
   * @param {import("@noflo/graph").GraphModel} [target] The model to apply
   *   to; defaults to the main graph (ephemeral planes pass their own).
   * @returns {boolean} Whether the operation was applied (and should
   *   converge to other clients) rather than dropped.
   * @throws {ProtocolError} On an unknown op_type or a payload the model
   *   rejects as structurally invalid.
   */
  applyOp(decoded, target) {
    const graph = target ?? this.graph;
    const { opType, entityId, payload } = decoded;
    // The wire entity_id names the entity; a payload-supplied override
    // must not rename it behind the protocol's back.
    const definition =
      entityId === null || entityId === undefined
        ? { ...payload }
        : { ...payload, entity_id: entityId };
    try {
      switch (opType) {
        case OP_TYPE.INSERT_NODE:
          graph.addNode(definition);
          break;
        case OP_TYPE.INSERT_EDGE:
          graph.addEdge(definition);
          break;
        case OP_TYPE.INSERT_IIP:
          graph.addIIP(definition);
          break;
        case OP_TYPE.INSERT_EXPORT:
          graph.addExport(definition);
          break;
        case OP_TYPE.INSERT_GROUP:
          graph.addGroup(definition);
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
  /**
   * One registered graph plane, other than the main plane.
   *
   * @typedef {object} Plane
   * @property {"ephemeral"|"subgraph"} kind Ephemera are client-minted
   *   and dropped by lifecycle command; subgraph planes follow their
   *   component's presence in the built network (work document #4
   *   updates #28/#33/#42).
   * @property {import("@noflo/graph").GraphModel|null} model The plane's
   *   graph model; the subgraph's live model when reachable.
   * @property {Map<string, number>|null} [clocks] Client logical clocks
   *   learned on the plane (ephemeral planes only).
   * @property {boolean} [epochDirty] Ephemeral planes: the cached epoch
   *   is stale.
   * @property {string|number|null} [parentPlane] Subgraph anchor: the
   *   containing plane (nil = main).
   * @property {string|null} [nodeId] Subgraph anchor: the node id in the
   *   containing graph.
   * @property {string|null} [componentName] Subgraph: the component the
   *   node instantiates.
   */

  /**
   * The plane registry: ephemeral graph planes materialized on first op
   * (work document #4 updates #28–#33) and subgraph planes registered at
   * network build (update #42). Keyed by plane id — client-minted for
   * ephemera, deterministic `sg/…` ids for subgraphs; the main graph (nil)
   * lives in `this.graph` and is not here.
   *
   * @type {Map<string|number, Plane>}
   */
  #planes = new Map();

  /**
   * The deterministic plane id of a subgraph instance: `sg/` is the
   * runtime-reserved prefix, the parent chain disambiguates same-named
   * nodes across planes, and `main` stands in for the nil parent.
   *
   * @param {string|number|null} parentPlaneId
   * @param {string} nodeId
   * @returns {string}
   */
  #subgraphPlaneId(parentPlaneId, nodeId) {
    return `sg/${parentPlaneId ?? "main"}/${nodeId}`;
  }

  /**
   * Get or materialize an ephemeral plane by its client-minted id. The
   * `sg/` prefix is reserved for runtime-registered subgraph planes: a
   * client minting one is rejected, so the namespaces cannot collide.
   *
   * @param {string|number} planeId
   * @returns {Plane}
   */
  #plane(planeId) {
    if (typeof planeId === "string" && planeId.startsWith("sg/")) {
      throw new ProtocolError(
        "the sg/ plane id prefix is reserved for subgraph planes",
        CMD_CRDT_UPDATE,
      );
    }
    let plane = this.#planes.get(planeId);
    if (!plane) {
      const model = new /** @type {any} */ (this.graph).constructor({
        name: String(planeId),
      });
      plane = {
        kind: "ephemeral",
        model,
        clocks: new Map(),
        epochDirty: true,
        parentPlane: null,
        nodeId: null,
        componentName: null,
      };
      this.#planes.set(planeId, plane);
    }
    return plane;
  }

  /**
   * Register the subgraph planes of a built network (work document #4
   * update #42): walk the instantiated components, register a plane for
   * every subgraph instance anchored to its node id in the containing
   * graph, and recurse into nested networks. Registration reconciles per
   * build — subgraph planes under this host that the walk no longer
   * sees are removed, so the plane tree follows the component's presence
   * in the built graph.
   *
   * @param {string|number|null} hostPlaneId The plane the network belongs
   *   to (nil = main).
   * @param {any} network A built NoFlo network (duck-typed: `processes` →
   *   instantiated components, each possibly wrapping a nested network).
   * @returns {void}
   */
  registerSubgraphPlanes(hostPlaneId, network) {
    /** @type {Set<string>} */
    const seen = new Set();
    /**
     * @param {string|number|null} parentPlaneId
     * @param {any} net
     */
    const walk = (parentPlaneId, net) => {
      for (const [nodeId, proc] of Object.entries(net?.processes ?? {})) {
        const component = proc?.component;
        if (!component?.isSubgraph?.() || !component.network) continue;
        const planeId = this.#subgraphPlaneId(parentPlaneId, nodeId);
        seen.add(planeId);
        const existing = this.#planes.get(planeId);
        if (existing?.kind !== "subgraph") {
          this.#planes.set(planeId, {
            kind: "subgraph",
            model: component.network.graph ?? null,
            parentPlane: parentPlaneId,
            nodeId,
            componentName: proc.componentName ?? null,
          });
        }
        walk(planeId, component.network);
      }
    };
    walk(hostPlaneId, network);
    // Reconcile: drop subgraph planes under this host that the walk no
    // longer sees (their component left the built graph).
    for (const [planeId, plane] of [...this.#planes]) {
      if (
        plane.kind !== "subgraph" ||
        seen.has(/** @type {string} */ (planeId))
      ) {
        continue;
      }
      if (this.#planeRootHost(plane) === (hostPlaneId ?? null)) {
        this.#planes.delete(planeId);
      }
    }
  }

  /**
   * The host plane a registered subgraph plane hangs off: walk the parent
   * chain until it leaves the subgraph registry — an ephemeral plane id,
   * or nil for the main plane.
   *
   * @param {Plane} plane
   * @returns {string|number|null}
   */
  #planeRootHost(plane) {
    let parent = plane.parentPlane ?? null;
    while (parent !== null) {
      const parentPlane = this.#planes.get(parent);
      if (parentPlane?.kind !== "subgraph") {
        return parent;
      }
      parent = parentPlane.parentPlane ?? null;
    }
    return null;
  }

  /**
   * Resolve a subgraph plane by its anchor: the plane registered for the
   * `nodeId` node inside the `parentPlaneId` plane. The telemetry
   * protocol's effective-plane resolution walks event paths through this
   * (update #42).
   *
   * @param {string|number|null} parentPlaneId
   * @param {string} nodeId
   * @returns {string|null} The subgraph plane id, or null when unregistered.
   */
  subgraphPlane(parentPlaneId, nodeId) {
    const planeId = this.#subgraphPlaneId(parentPlaneId, nodeId);
    const plane = this.#planes.get(planeId);
    return plane?.kind === "subgraph" ? planeId : null;
  }

  /**
   * Remove every subgraph plane anchored under the given (dropped)
   * plane, cascading through the parent chain (update #42).
   *
   * @param {string|number} parentPlaneId
   * @returns {void}
   */
  #dropSubgraphPlanesUnder(parentPlaneId) {
    for (const [planeId, plane] of [...this.#planes]) {
      if (
        plane.kind === "subgraph" &&
        this.#planeRootHost(plane) === parentPlaneId
      ) {
        this.#planes.delete(planeId);
      }
    }
  }

  /**
   * The current epoch of a plane: derived from the model's content so
   * unmodified re-syncs match (external review point 6 — wall-clock
   * epochs always looked stale).
   *
   * @param {{ model: import("@noflo/graph").GraphModel }} plane
   * @returns {number}
   */
  #planeEpoch(plane) {
    const str = plane.model.canonicalString();
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) || 1;
  }

  /**
   * Apply one decoded op to a plane's model.
   *
   * @param {{ model: import("@noflo/graph").GraphModel }} plane
   * @param {{ clientId: string, logicalClock: number, opType: number, entityId: string|null, payload: any }} decoded
   * @returns {boolean}
   */
  #applyToPlane(plane, decoded) {
    // Throws for actual rejections; returns true/false for applied/converged no-op.
    return this.applyOp(decoded, plane.model);
  }

  #learnClocks(clocks) {
    for (const [clientId, clock] of Object.entries(clocks ?? {})) {
      if (!this.knownClocks.has(clientId)) {
        // A new client at the budget: evict the oldest-learned one — the
        // clock map is attacker-populated, so it must stay bounded.
        if (this.knownClocks.size >= this.maxKnownClocks) {
          const oldest = this.knownClocks.keys().next().value;
          this.knownClocks.delete(oldest);
        }
      }
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
        planeId: null,
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
  const digest = await crypto.subtle.digest(
    "SHA-256",
    /** @type {BufferSource} */ (bytes),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
