//     @noflo/fbp-protocol - FBP Protocol 2.0 over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @module catalogs
 * @description The default metadata catalogs published from this package
 *   (work document #37 §4): the `ui` positional canvas catalog, the
 *   `runtime` config catalog, and the `std` datatype catalog. Owned by
 *   whoever already owns the truth — core reserves these namespaces — and
 *   shipped CC0 like the SPEC. The same documents ship as JSON artifacts
 *   in the package's `schemas/` directory; the JS bodies here and the
 *   shipped files are one source of truth, verified identical by the test
 *   suite.
 *
 *   These are consumer-side dependencies: renderers and editors install
 *   them; component libraries reference none of them.
 */

/* @ts-self-types="./catalogs.d.ts" */

import { RuntimeCatalog } from "./schemas/catalog-runtime.js";
import { StdCatalog } from "./schemas/catalog-std.js";
import { UiCatalog } from "./schemas/catalog-ui.js";

/**
 * The namespace each default catalog declares.
 *
 * @typedef {("std"|"ui"|"runtime")} CatalogNamespace
 */

/**
 * The default catalog bodies, keyed by namespace.
 *
 * @type {Record<CatalogNamespace, Record<string, any>>}
 */
export const CATALOGS = {
  std: StdCatalog,
  ui: UiCatalog,
  runtime: RuntimeCatalog,
};

/**
 * Look up a default catalog body by namespace.
 *
 * @param {CatalogNamespace} namespace
 * @returns {Record<string, any>}
 */
export function catalogBody(namespace) {
  const body = CATALOGS[namespace];
  if (!body) {
    throw new TypeError(`unknown default catalog '${namespace}'`);
  }
  return body;
}

/**
 * Compute the content digest of a default catalog: SHA-256 hex over the
 * RFC 8785 canonicalization of its body. Async because WebCrypto is.
 *
 * @param {CatalogNamespace} namespace
 * @returns {Promise<string>}
 */
export async function catalogDigest(namespace) {
  const { digestSchema } = await import("./schema-identity.js");
  return digestSchema(catalogBody(namespace));
}
