//     @noflo/fbp-protocol - FBP Protocol 2.0 over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @module meta-schemas
 * @description The two pinned meta-schemas shipped from this package (work
 *   document #37 §3.2): the extension vocabulary declaring NoFlo's added
 *   keywords through JSON Schema 2020-12's `$vocabulary` mechanism, and the
 *   metadata catalog document format. The same documents ship as JSON
 *   artifacts in the package's `schemas/` directory — the JS bodies here
 *   and the shipped files are one source of truth, verified byte-equal by
 *   the test suite.
 *
 *   Meta-schemas are immutable: every body's digest covers its `$schema`
 *   URN, so any revision would re-digest every body in every closure.
 *   Evolution mints a new id (`noflo/meta-2`), and old revisions never
 *   leave the content store.
 */

/* @ts-self-types="./meta-schemas.d.ts" */

import { extensionVocabulary } from "./schemas/noflo-extension-vocabulary.js";
import { metaCatalog } from "./schemas/noflo-meta-catalog.js";

/**
 * The ids of the pinned meta-schemas.
 *
 * @typedef {("noflo/extension-vocabulary"|"noflo/meta-catalog")} MetaSchemaId
 */

/**
 * The pinned meta-schema bodies, keyed by id.
 *
 * @type {Record<MetaSchemaId, Record<string, any>>}
 */
export const META_SCHEMAS = {
  "noflo/extension-vocabulary": extensionVocabulary,
  "noflo/meta-catalog": metaCatalog,
};

/**
 * Look up a pinned meta-schema body by id.
 *
 * @param {MetaSchemaId} id
 * @returns {Record<string, any>}
 */
export function metaSchemaBody(id) {
  const body = META_SCHEMAS[id];
  if (!body) {
    throw new TypeError(`unknown meta-schema '${id}'`);
  }
  return body;
}

/**
 * Compute the content digest of a pinned meta-schema: SHA-256 hex over the
 * RFC 8785 canonicalization of its body. Async because WebCrypto is.
 *
 * @param {MetaSchemaId} id
 * @returns {Promise<string>}
 */
export async function metaSchemaDigest(id) {
  const { digestSchema } = await import("./schema-identity.js");
  return digestSchema(metaSchemaBody(id));
}
