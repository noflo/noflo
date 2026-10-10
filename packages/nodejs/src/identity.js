//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     NoFlo may be freely distributed under the MIT license

/**
 * @module identity
 * @description The host's Reticulum identity handling: the long-term
 *   identity a runtime announces and links with, generated on first run and
 *   persisted inside the Reticulum transport storage — the mesh equivalent
 *   of the legacy runtime's generated secret, but cryptographic and
 *   self-certifying: peers that cache the public key keep recognizing the
 *   runtime across restarts. A corrupt stored key surfaces loudly instead
 *   of being regenerated, which would silently change the node's address.
 */
/* @ts-self-types="./identity.d.ts" */

import { Identity } from "@reticulum/core";

/**
 * Load the host identity from the Reticulum transport storage, generating
 * and persisting a new one on first run.
 *
 * @param {import("@reticulum/core").Reticulum} rns A connected Reticulum
 *   instance whose storage adapter persists the key
 * @returns {Promise<import("@reticulum/core").Identity>}
 */
export async function loadOrCreateIdentity(rns) {
  return Identity.loadOrGenerate(rns.storage);
}
