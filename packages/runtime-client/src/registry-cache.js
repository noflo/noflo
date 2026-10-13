//     @noflo/runtime-client - FBP Protocol 2.0 client over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @file registry-cache module
 * @description The Two-Step Cache consumer (work document #29 phase 3).
 *   The client computes the registry hash locally from its known catalog
 *   (the algorithm is pinned in the codec package as `registryHash`),
 *   sends it in the `0x20` sync request, and the runtime answers with a
 *   manifest only when it differs. Component details (`0x23`/`0x24`) are
 *   requested per component name and cached per `sig_hash` — a detail is
 *   re-requested only when a manifest entry's signature hash changes.
 */

import {
  decodeCompDetailRes,
  decodeCompManifest,
  decodeCompUpToDate,
  encodeCompDetailReq,
  encodeCompSyncReq,
  registryHash,
} from "@noflo/fbp-protocol";

/**
 * A cached component signature: the manifest wire entry plus the full
 * detail once requested.
 *
 * @typedef {Object} CachedComponent
 * @property {string} sigHash - The signature hash from the manifest
 * @property {string} type - The declared component kind
 * @property {any} [signature] - The full signature from the detail response
 */
/**
 * @typedef {Object<string, CachedComponent>} RegistryCatalog
 */

/**
 * The Two-Step Cache client state over an established link.
 */
export class RegistryCache {
  /** @type {(payload: Uint8Array) => Promise<void>} */
  #send;

  /** @type {(payload: Uint8Array) => Promise<Uint8Array>} */
  #requestReply;

  /** @type {RegistryCatalog} */
  #catalog = {};

  /** @type {string|undefined} The runtime's registry hash from the latest sync */
  #registryHash = undefined;

  /**
   * @param {Object} deps
   * @param {(payload: Uint8Array) => Promise<void>} deps.send - Frame sender over the established link
   * @param {(payload: Uint8Array) => Promise<Uint8Array>} deps.requestReply - Send and await the next inbound frame
   */
  constructor({ send, requestReply }) {
    this.#send = send;
    this.#requestReply = requestReply;
  }

  /**
   * The catalog after the latest sync.
   *
   * @returns {RegistryCatalog}
   */
  catalog() {
    return this.#catalog;
  }

  /**
   * The runtime's registry hash from the latest manifest.
   *
   * @returns {string|undefined}
   */
  registryHashValue() {
    return this.#registryHash;
  }

  /**
   * Run the Two-Step Cache sync: send the locally computed registry hash
   * (or `"stale"` to force a manifest), merge the manifest into the
   * catalog, and request details for entries whose signature hash is new
   * or changed. Entries keep their previous details when their signature
   * hash is unchanged.
   *
   * @param {string} [localRegistryHash] - `"stale"` (default) forces a full manifest; otherwise the hash of the client's known catalog
   * @returns {Promise<RegistryCatalog>} The merged catalog
   */
  async sync(localRegistryHash = "stale") {
    const reply = await this.#requestReply(
      encodeCompSyncReq(localRegistryHash),
    );
    let manifest;
    try {
      manifest = decodeCompManifest(reply);
      console.log(
        `[dbg] sync: manifest (hash ${manifest.newRegistryHash}, ${Object.keys(manifest.entries ?? {}).length} entries)`,
      );
    } catch {
      console.log("[dbg] sync: up-to-date reply, catalog stands");
      return this.#catalog;
    }
    this.#registryHash = manifest.newRegistryHash;

    /** @type {RegistryCatalog} */
    const fresh = {};
    /** @type {string[]} */
    const needDetails = [];
    for (const [name, entry] of Object.entries(manifest.entries ?? {})) {
      const known = this.#catalog[name];
      const sigHash = entry.sigHash;
      fresh[name] = {
        sigHash,
        type: entry.type,
        ...(known && known.sigHash === sigHash && known.signature
          ? { signature: known.signature }
          : {}),
      };
      if (!known || known.sigHash !== sigHash) {
        needDetails.push(name);
      }
    }
    this.#catalog = fresh;
    console.log(
      `[dbg] sync merged: hash=${this.#registryHash} needDetails=${JSON.stringify(needDetails)} catalog=${JSON.stringify(this.#catalog)}`,
    );

    console.log(`[dbg] sync: detail fetch for ${JSON.stringify(needDetails)}`);
    if (needDetails.length > 0) {
      const reqBytes = encodeCompDetailReq(needDetails);
      console.log(
        `[dbg] detail req bytes: ${JSON.stringify(Array.from(reqBytes))}`,
      );
      const replyBytes = await this.#requestReply(reqBytes);
      console.log(
        `[dbg] detail reply bytes: ${JSON.stringify(Array.from(replyBytes))}`,
      );
      const details = decodeCompDetailRes(replyBytes);
      for (const [name, signature] of Object.entries(
        details.components ?? {},
      )) {
        if (this.#catalog[name]) {
          this.#catalog[name].signature = signature;
        }
      }
    }
    return this.#catalog;
  }

  /**
   * The locally computed registry hash for a catalog — the value to pass
   * as `localRegistryHash` on subsequent syncs (the codec pins the
   * algorithm).
   *
   * @param {RegistryCatalog} [catalog]
   * @returns {Promise<string>}
   */
  async computeLocalHash(catalog = this.#catalog) {
    /** @type {import("@noflo/fbp-protocol").ManifestEntries} */
    const entries = {};
    for (const [name, entry] of Object.entries(catalog)) {
      if (entry.sigHash !== undefined && entry.type !== undefined) {
        entries[name] = { sigHash: entry.sigHash, type: entry.type };
      }
    }
    return registryHash(entries);
  }

  /**
   * The cached full signature for a component, if its detail was fetched.
   *
   * @param {string} name - Library-namespaced component name
   * @returns {any|undefined}
   */
  signature(name) {
    return this.#catalog[name]?.signature;
  }
}
