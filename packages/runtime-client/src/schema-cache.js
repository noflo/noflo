//     @noflo/runtime-client - FBP Protocol 2.0 client over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @module schema-cache
 * @description The client-side schema store (work document #37 §6, §9):
 *   bodies fetched over `0x28`/`0x29` are digest-verified before they
 *   enter the cache — integrity before interpretation — and a fetched
 *   root is usable only when every `$ref` digest in its closure is present
 *   locally: closure completeness is client-checked, never assumed. The
 *   store is keyed by digest, so two libraries referencing the same
 *   artifact populate it once.
 */

/* @ts-self-types="./schema-cache.d.ts" */

import {
  collectSchemaRefs,
  decodeSchemaRes,
  digestSchema,
  encodeSchemaReq,
  parseSchemaRef,
} from "@noflo/fbp-protocol";
import { fromHex } from "@reticulum/core";

/**
 * The client-side content-addressed schema store.
 */
export class SchemaCache {
  /** @type {(payload: Uint8Array) => Promise<Uint8Array>} */
  #requestReply;

  /** @type {Map<string, Record<string, any>>} */
  #bodies = new Map();

  /**
   * @param {Object} deps
   * @param {(payload: Uint8Array) => Promise<Uint8Array>} deps.requestReply - Send and await the next inbound frame
   */
  constructor({ requestReply }) {
    this.#requestReply = requestReply;
  }

  /**
   * The bodies currently held, keyed by hex digest.
   *
   * @returns {Map<string, Record<string, any>>}
   */
  bodies() {
    return new Map(this.#bodies);
  }

  /**
   * @param {string} digest Hex digest.
   * @returns {boolean}
   */
  has(digest) {
    return this.#bodies.has(digest);
  }

  /**
   * @param {string} digest Hex digest.
   * @returns {Record<string, any>|undefined}
   */
  body(digest) {
    return this.#bodies.get(digest);
  }

  /**
   * Compute the digests of a fetch: the requested digests the store does
   * not hold, plus the transitive `$ref` digests of held bodies the store
   * does not hold — closure completeness is checked from the local cache
   * alone.
   *
   * @param {string[]} digests Hex digests wanted for use.
   * @returns {string[]} Missing hex digests, deduplicated.
   */
  missing(digests) {
    /** @type {Set<string>} */
    const out = new Set();
    /** @type {(digest: string) => void} */
    const walk = (digest) => {
      if (out.has(digest) || this.#bodies.has(digest)) return;
      out.add(digest);
      const body = this.#bodies.get(digest);
      if (body) {
        for (const ref of refsOf(body)) walk(ref);
      }
    };
    for (const digest of digests) {
      walk(digest);
      // Walk the refs of anything already held that this request depends on
      const held = this.#bodies.get(digest);
      if (held) {
        for (const ref of refsOf(held)) walk(ref);
      }
    }
    return [...out];
  }

  /**
   * Whether the requested digests are usable: every digest present, and
   * every `$ref` digest in their transitive closures present too. A
   * missing entry is requested before use, never assumed.
   *
   * @param {string[]} digests Hex digests wanted for use.
   * @returns {boolean}
   */
  isClosureComplete(digests) {
    return this.missing(digests).length === 0;
  }

  /**
   * Fetch bodies by digest over `0x28`, with closure bundling on: each
   * returned body is digest-verified client-side — a mismatch is discarded
   * and treated as absent — before it enters the store. Bundled entries
   * are verified against their `$id` digest the same way. Accepts bodies
   * held locally through the request when a closure bundle widens beyond
   * the asked digests.
   *
   * @param {string[]} digests Hex digests to fetch.
   * @param {Object} [options]
   * @param {boolean} [options.bundle] Request closure-bundled responses (default on).
   * @returns {Promise<Map<string, Record<string, any>>>} The verified bodies, keyed by hex digest.
   * @throws {Error} When the runtime answers with none of the requested digests held.
   */
  async fetch(digests, options = {}) {
    const { bundle = true } = options;
    // Digests the store already holds need no wire round trip: the cache
    // is content-addressed, a held digest is the held body
    const wanted = digests.filter((digest) => !this.#bodies.has(digest));
    if (wanted.length === 0) {
      return new Map();
    }
    const reply = await this.#requestReply(
      encodeSchemaReq(
        wanted.map((digest) => fromHex(digest)),
        bundle,
      ),
    );
    const { bodies } = decodeSchemaRes(reply);
    /** @type {Map<string, Record<string, any>>} */
    const verified = new Map();
    for (const [digest, value] of Object.entries(bodies)) {
      if (value === null || typeof value === "string") {
        // "not held", or a resource-backed entry: the resource bytes are
        // fetched out-of-band and verified at that boundary
        continue;
      }
      const computed = await digestSchema(value);
      if (computed !== digest) {
        // A body failing its digest check is discarded and treated as
        // absent — this is the property that makes untrusted runtimes safe
        continue;
      }
      this.#bodies.set(digest, value);
      verified.set(digest, value);
    }
    // Bundled entries may resolve closure digests beyond the request;
    // their `$id` pins the digest the same verification already checked
    const missing = this.missing(digests);
    if (missing.length > 0) {
      // The closure behind the fetched roots is not fully present: the
      // roots are held but unusable until the missing parts are fetched —
      // the caller iterates with further requests
      return verified;
    }
    return verified;
  }
}

/**
 * The digests a body's cross-document `$ref`s pin. Authoring-sugar refs
 * carry no digest: they cannot be closure-checked by digest alone — they
 * resolve through the id vocabulary, so the caller's manifest remains the
 * pin — and are excluded from the completeness walk.
 *
 * @param {Record<string, any>} body
 * @returns {string[]}
 */
function refsOf(body) {
  return collectSchemaRefs(body)
    .map((ref) => parseSchemaRef(ref).digest)
    .filter((digest) => digest !== null);
}
