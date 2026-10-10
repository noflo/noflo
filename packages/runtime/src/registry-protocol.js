/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module registry-protocol
 * @description The Two-Step Cache server side (work document #28 phase 2,
 *   wire per work document #4 §6): answers `0x20` registry syncs with
 *   either the `0x21` match reply or a `0x22` manifest, answers `0x23`
 *   detail requests from the signature cache, and maps `0x25` source writes
 *   and `0x27` package installs onto the catalog's hooks.
 *
 *   The runtime consumes an application-supplied *catalog* — the same
 *   philosophy as the engine's application-supplied component registry
 *   (work documents #6/#16): the catalog is ready and populated at handoff,
 *   and the runtime derives the wire state (`sig_hash` per signature via
 *   the canonical serialization, `registry_hash` over the manifest) from
 *   it. A signature is exactly the `0x24` detail shape: declared kind plus
 *   the full port field set, valid with no implementation behind it (stubs
 *   are state, not errors).
 */
/* @ts-self-types="./registry-protocol.d.ts" */

import {
  CMD_COMP_DETAIL_REQ,
  CMD_COMP_INSTALL_REQ,
  CMD_COMP_SYNC_REQ,
  CMD_COMP_WRITE,
  encodeCompDetailRes,
  encodeCompManifest,
  encodeCompUpToDate,
  registryHash,
  sigHash,
} from "@noflo/fbp-protocol";

/**
 * The component catalog the registry protocol serves. `signatures` returns
 * the current catalog snapshot — synchronously or as a promise — keyed by
 * library-namespaced component name. The optional hooks back the
 * `COMPONENT_WRITE` commands; when absent, the corresponding command is a
 * runtime-side gap and surfaces as an `unsupported` event on the server.
 *
 * @typedef {object} RuntimeCatalog
 * @property {() => Record<string, import("@noflo/fbp-protocol").ComponentDetail> | Promise<Record<string, import("@noflo/fbp-protocol").ComponentDetail>>} signatures
 *   Current catalog snapshot: component name to declared signature.
 * @property {(name: string, source: string) => Promise<void>} [writeSource]
 *   Store full component source (`0x25`). Source and signature are
 *   orthogonal: writing source to a stub-only entry implements it while the
 *   signature stays unchanged.
 * @property {(packageUri: string) => Promise<void>} [install]
 *   Install an ES module package (`0x27`), resolving through the ecosystem
 *   catalog's provenance fields (work document #26).
 */

/**
 * Registry state derived from the catalog: manifest entries with their
 * `sig_hash` values, the details cache backing `0x24`, and the
 * `registry_hash` over the manifest.
 *
 * @typedef {object} RegistryState
 * @property {Record<string, { sigHash: string, type: string }>} entries
 * @property {Record<string, import("@noflo/fbp-protocol").ComponentDetail>} details
 * @property {string} hash
 */

/**
 * The `0x20`–`0x27` protocol handler, bound to a {@link RuntimeServer} via
 * {@link RegistryProtocol#register}.
 */
export class RegistryProtocol {
  /**
   * @param {object} options
   * @param {RuntimeCatalog} options.catalog
   */
  constructor(options) {
    this.catalog = options.catalog;
    /** @type {RegistryState} */
    this.state = { entries: {}, details: {}, hash: "" };
  }

  /**
   * Rebuild the registry state from the catalog: hash every signature, then
   * hash the manifest. Call after the catalog changes (its `change` and
   * `invalidate` events, a source write, a package install).
   *
   * @returns {Promise<void>}
   */
  async refresh() {
    const signatures = await this.catalog.signatures();
    /** @type {RegistryState["entries"]} */
    const entries = {};
    /** @type {RegistryState["details"]} */
    const details = {};
    for (const [name, detail] of Object.entries(signatures)) {
      const signatureHash = await sigHash(detail);
      entries[name] = { sigHash: signatureHash, type: detail.type };
      details[name] = detail;
    }
    this.state = {
      entries,
      details,
      hash: await registryHash(entries),
    };
  }

  /**
   * Register the `0x20` block handlers on a runtime server. Requires the
   * server to have `COMPONENT_READ` advertised for reads and the catalog
   * hooks for writes; capability enforcement happens in the server core.
   *
   * @param {import("./runtime-server.js").RuntimeServer} server
   * @returns {void}
   */
  register(server) {
    server.registerHandler(CMD_COMP_SYNC_REQ, (decoded, context) => {
      // Always answer: the match reply keeps the request/response pairing
      // unambiguous (work document #4 update #18).
      if (decoded.localRegistryHash === this.state.hash) {
        server.send(encodeCompUpToDate(), context);
        return;
      }
      server.send(
        encodeCompManifest(this.state.hash, this.state.entries),
        context,
      );
    });

    server.registerHandler(CMD_COMP_DETAIL_REQ, (decoded, context) => {
      // Only the names the client does not know; unknown names are omitted
      // — an empty response is an answer, silence is not.
      /** @type {Record<string, import("@noflo/fbp-protocol").ComponentDetail>} */
      const components = {};
      for (const name of decoded.names) {
        const detail = this.state.details[name];
        if (detail) {
          components[name] = detail;
        }
      }
      server.send(encodeCompDetailRes(components), context);
    });

    server.registerHandler(CMD_COMP_WRITE, async (decoded, context) => {
      if (!this.catalog.writeSource) {
        unsupported(server, "writeSource", decoded, context);
        return;
      }
      await this.catalog.writeSource(decoded.componentName, decoded.source);
      // The signature is orthogonal to source, but a write can add a
      // component the catalog did not list before — re-derive state.
      await this.refresh();
    });

    server.registerHandler(CMD_COMP_INSTALL_REQ, async (decoded, context) => {
      if (!this.catalog.install) {
        unsupported(server, "install", decoded, context);
        return;
      }
      await this.catalog.install(decoded.packageUri);
      // An install changes the catalog as a whole; re-derive state.
      await this.refresh();
    });
  }
}

/**
 * @param {import("./runtime-server.js").RuntimeServer} server
 * @param {string} hook
 * @param {any} decoded
 * @param {any} context
 * @returns {void}
 */
function unsupported(server, hook, decoded, context) {
  server.dispatchEvent(
    new globalThis.CustomEvent("unsupported", {
      detail: { hook, decoded, context },
    }),
  );
}
