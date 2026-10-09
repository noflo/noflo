/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module @noflo/runtime/dacar
 * @description The native DACAR capability policy (work document #28):
 *   resolves a verified peer's capability mask from a Dacar authorization
 *   engine — the decentralized, CRDT-synced access control plane built for
 *   exactly this use. DACAR's vocabulary maps directly onto the protocol's:
 *   the *object* is the resource a command addresses (the runtime, a graph,
 *   an entity), the *relation* is the capability it needs, the *grantee* is
 *   the peer's verified identity.
 *
 *   The default relations are capability-grained — one relation per
 *   capability-mask bit — so a Dacar grant of `graph.edit` on the runtime
 *   object admits every graph mutation, insert ops and tombstones alike.
 *   Applications wanting per-command granularity pass their own relation
 *   map (e.g. `graph.edit` → `graph.addIIP`), since relations are free-form
 *   authorization labels.
 *
 *   Most deployments grant coarsely, though: `allRelation` names a relation
 *   whose grant on the object confers the full capability mask (e.g.
 *   `access`), evaluated first and short-circuiting the per-capability
 *   checks. DACAR's own object wildcards (`*` suffixes) work as usual on
 *   top. The granular relations then matter only for restricted roles — the
 *   reason the machinery exists.
 *
 *   The Dacar engine is injected: the application constructs it (trust
 *   anchors, privacy salt, state) and keeps its delta sync flowing — the
 *   adapter only evaluates. Policy failures deny closed: the peer gets no
 *   capabilities until the plane answers again.
 */

/* @ts-self-types="./dacar.d.ts" */

import { CAPABILITY, ProtocolError } from "@noflo/fbp-protocol";

/**
 * Default relation per capability-mask bit: capability-grained labels on
 * the runtime's DACAR object.
 *
 * @type {Record<string, string>}
 */
export const CAPABILITY_RELATIONS = {
  GRAPH_READ: "graph.read",
  GRAPH_EDIT: "graph.edit",
  METADATA_SYNC: "metadata.sync",
  TELEMETRY_READ: "telemetry.read",
  COMPONENT_READ: "component.read",
  COMPONENT_WRITE: "component.write",
  LIFECYCLE_CTRL: "lifecycle.ctrl",
  ADMIN: "admin",
};

/**
 * @typedef {object} DacarPolicyOptions
 * @property {import("@reticulum/dacar").Engine} options.engine The Dacar
 *   authorization engine (config + CRDT state kept current by the
 *   application's delta sync).
 * @property {string | ((context: any) => string)} options.objectId The
 *   Dacar object the commands address — the runtime itself, or a graph. A
 *   function form lets a multi-resource runtime map the link context to the
 *   object in question.
 * @property {Record<string, string>} [options.relations] Capability name to
 *   Dacar relation; defaults to {@link CAPABILITY_RELATIONS}. Applications
 *   wanting per-command granularity supply finer labels.
 * @property {string} [options.allRelation] A relation whose grant on the
 *   object confers the full capability mask — the coarse-grant case,
 *   evaluated before the per-capability relations and short-circuiting
 *   them.
 */

/**
 * A {@link import("./runtime-server.js").RuntimeServer#capabilityPolicy}
 * backed by a Dacar engine.
 */
export class DacarCapabilityPolicy {
  /**
   * @param {DacarPolicyOptions} options
   */
  constructor(options) {
    this.engine = options.engine;
    this.objectId = options.objectId;
    this.relations = { ...CAPABILITY_RELATIONS, ...(options.relations ?? {}) };
    this.allRelation = options.allRelation ?? null;
  }

  /**
   * Resolve the peer's capability mask: one Dacar evaluation per
   * capability, with Dacar's own deny semantics deciding each.
   *
   * @param {string} identityHash Hex of the peer's 16-byte identity hash.
   * @param {any} context The link context.
   * @returns {Promise<number>}
   */
  async resolve(identityHash, context) {
    const grantee = hexToBytes(identityHash);
    const objectId =
      typeof this.objectId === "function"
        ? this.objectId(context)
        : this.objectId;
    if (this.allRelation) {
      if (await this.engine.evaluate(objectId, this.allRelation, grantee)) {
        // Coarse grant: everything, no per-capability checks.
        return Object.values(CAPABILITY).reduce((mask, bit) => mask | bit, 0);
      }
    }
    /** @type {number} */
    let mask = 0;
    for (const [name, relation] of Object.entries(this.relations)) {
      const bit = CAPABILITY[name];
      if (bit === undefined) {
        throw new ProtocolError(
          `unknown capability name in DACAR relation map: ${name}`,
        );
      }
      if (await this.engine.evaluate(objectId, relation, grantee)) {
        mask |= bit;
      }
    }
    return mask;
  }
}

/**
 * @param {string} hex
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
