//     @noflo/runtime - FBP Protocol 2.0 runtime over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @module schema-protocol
 * @description The runtime's schema table and the `0x28`/`0x29`/`0x2a`
 *   handlers (work document #37 phase 2). The table is a grow-only
 *   content-addressed store with two provenance sections: package-loaded
 *   at startup from installed packages' `noflo.json` schemas tables (the
 *   WD #24 manifest ladder — data consumed as JSON, never as a package
 *   dependency), and project-authored via `0x2a` (live programming).
 *   Persistence of both is runtime policy, not protocol.
 *
 *   Tier A rules hold throughout: serving bodies is introspection, the
 *   runtime never validates packets against schema bodies, and a runtime
 *   without any schema table answers all-nil rather than staying silent.
 */

/* @ts-self-types="./schema-protocol.d.ts" */

import fs from "node:fs";
import path from "node:path";
import {
  CMD_SCHEMA_REQ,
  CMD_SCHEMA_WRITE,
  collectSchemaRefs,
  digestSchema,
  encodeSchemaRes,
  parseSchemaRef,
  SCHEMA_BUNDLE_MAX_ENTRIES,
} from "@noflo/fbp-protocol";

/**
 * A resolved schema entry: an inline body or a resource-backed reference.
 *
 * @typedef {object} SchemaEntry
 * @property {Record<string, any>} [body] The inline body, when held.
 * @property {string} [ref] The RNS resource hash, for bodies not held inline.
 */

/**
 * The grow-only schema store. Bodies and resource references are keyed by
 * the hex SHA-256 digest of the body's canonical form; a digest is
 * immutable, so concurrent writes of the same body converge trivially and
 * two clients writing different schemas both succeed.
 */
export class SchemaTable {
  /** @type {Map<string, SchemaEntry>} */
  #packageLoaded = new Map();

  /** @type {Map<string, SchemaEntry>} */
  #project = new Map();

  /** @type {Map<string, string>} */
  #idIndex = new Map();

  /**
   * Load one installed package's schema set from its manifest: every
   * `schemas` entry's body is read from the package's own `schemas/`
   * directory and verified against the manifest's digest pin before it
   * enters the table — a mismatch is a corrupt closure and fails loudly.
   *
   * @param {string} pkgDir Installed package directory.
   * @returns {Promise<number>} The number of bodies loaded.
   */
  async loadPackage(pkgDir) {
    const manifestPath = path.join(pkgDir, "noflo.json");
    if (!fs.existsSync(manifestPath)) {
      return 0;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    let loaded = 0;
    for (const [id, entry] of Object.entries(manifest.schemas ?? {})) {
      const tableEntry = /** @type {{ digest: string, path?: string }} */ (
        entry
      );
      if (!tableEntry.path) continue;
      const bodyPath = path.join(pkgDir, tableEntry.path);
      if (!fs.existsSync(bodyPath)) continue;
      const body = JSON.parse(fs.readFileSync(bodyPath, "utf8"));
      const computed = await digestSchema(body);
      if (computed !== tableEntry.digest) {
        throw new Error(
          `Digest mismatch loading the schema closure: ${id} is pinned at ${tableEntry.digest} by the package manifest but its body digests to ${computed}`,
        );
      }
      this.#packageLoaded.set(tableEntry.digest, { body });
      this.#idIndex.set(id, tableEntry.digest);
      loaded += 1;
    }
    return loaded;
  }

  /**
   * @param {string} digest Hex digest.
   * @returns {boolean}
   */
  has(digest) {
    return this.#packageLoaded.has(digest) || this.#project.has(digest);
  }

  /**
   * @param {string} digest Hex digest.
   * @returns {SchemaEntry|null} Null when the table holds nothing for the digest.
   */
  entry(digest) {
    return this.#packageLoaded.get(digest) ?? this.#project.get(digest) ?? null;
  }

  /**
   * Answer a `0x28` request: the requested digests, optionally bundled with
   * the transitive `$ref` closure of the served bodies. Bundling is capped
   * responder-side at the protocol-stated maximum; a client treats a
   * fetched closure as usable only when every referenced digest is present,
   * so undersized bundles are degraded service, never wrong service.
   *
   * @param {string[]} digests Hex digests requested.
   * @param {boolean} bundle Whether closure bundling was requested.
   * @returns {Map<string, SchemaEntry|null>} Entries keyed by hex digest; null for not held.
   */
  request(digests, bundle) {
    /** @type {Map<string, SchemaEntry|null>} */
    const answer = new Map();
    for (const digest of digests) {
      answer.set(digest, this.entry(digest));
    }
    if (!bundle) {
      return answer;
    }
    for (const digest of digests) {
      const entry = answer.get(digest);
      if (!entry?.body) continue;
      this.#bundleClosure(entry.body, answer);
      if (answer.size >= SCHEMA_BUNDLE_MAX_ENTRIES) break;
    }
    return answer;
  }

  /**
   * @param {Record<string, any>} body
   * @param {Map<string, SchemaEntry|null>} answer
   * @returns {void}
   */
  #bundleClosure(body, answer) {
    for (const ref of collectSchemaRefs(body)) {
      if (answer.size >= SCHEMA_BUNDLE_MAX_ENTRIES) return;
      const id = parseSchemaRef(ref).id;
      const digest = this.#idIndex.get(id);
      if (!digest || answer.has(digest)) continue;
      const entry = this.entry(digest);
      if (!entry) continue;
      answer.set(digest, entry);
      if (entry.body) this.#bundleClosure(entry.body, answer);
    }
  }

  /**
   * Write a body (live programming, `0x2a`): content-addressed and
   * idempotent. Inline bodies are verified against the digest before they
   * enter the store — a body failing its digest check is discarded;
   * resource-backed entries are verifiable when fetched. Writing a body
   * with dangling `$ref`s is accepted: the store cannot know, and the
   * client's closure-completeness check catches it at first use.
   *
   * @param {string} digest Hex digest the write claims.
   * @param {{ body: Record<string, any>|null, ref: string|null }} write
   * @returns {Promise<void>}
   * @throws {Error} When an inline body fails its digest verification.
   */
  async write(digest, { body, ref }) {
    if (body) {
      const computed = await digestSchema(body);
      if (computed !== digest) {
        throw new Error(
          `Schema write rejected: the body digests to ${computed}, not the claimed ${digest}`,
        );
      }
      if (this.has(digest)) {
        // Grow-only and idempotent: the same digest is the same body
        return;
      }
      const $id =
        typeof body.$id === "string" ? parseSchemaRef(body.$id).id : null;
      if ($id) {
        this.#idIndex.set($id, digest);
      }
      this.#project.set(digest, { body });
      return;
    }
    if (ref && !this.has(digest)) {
      this.#project.set(digest, { ref });
    }
  }

  /**
   * The number of bodies held across both sections (host-side visibility).
   *
   * @returns {number}
   */
  get size() {
    return this.#packageLoaded.size + this.#project.size;
  }
}

/**
 * The `0x28`/`0x29`/`0x2a` protocol handler, bound to a {@link RuntimeServer}.
 * Reads require `COMPONENT_READ`; writes require `COMPONENT_WRITE`
 * (enforced by the server core's capability map).
 */
export class SchemaProtocol {
  /**
   * @param {object} options
   * @param {SchemaTable} options.table
   */
  constructor(options) {
    this.table = options.table;
  }

  /**
   * Register the schema handlers on a runtime server.
   *
   * @param {import("./runtime-server.js").RuntimeServer} server
   * @returns {void}
   */
  register(server) {
    server.registerHandler(CMD_SCHEMA_REQ, (decoded, context) => {
      // Always answer: all-nil is the legitimate no-table answer, silence
      // never carries semantics
      const answer = this.table.request(
        decoded.digests.map((d) => bytesToHex(d)),
        decoded.bundle,
      );
      /** @type {Record<string, Record<string, any>|string|null>} */
      const bodies = {};
      for (const [digest, entry] of answer) {
        bodies[digest] = entry?.body ?? entry?.ref ?? null;
      }
      server.send(encodeSchemaRes(bodies), context);
    });
    server.registerHandler(CMD_SCHEMA_WRITE, async (decoded) => {
      await this.table.write(decoded.digest, {
        body: decoded.body,
        ref: decoded.ref,
      });
      // No reply: writes are content-addressed, idempotent, and confirmed
      // by the client's own digest verification on first use — the same
      // fire-and-forget shape as 0x25 COMP_WRITE
    });
  }
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
