/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/policy.js
 * @description Test helper: capability-policy stubs for specs. With the
 *   static permissions store gone, every RuntimeServer requires a
 *   `capabilityPolicy`; these stubs stand in for the Dacar plane where the
 *   tests exercise protocol mechanics instead of authorization.
 */
import { CAPABILITY } from "@noflo/fbp-protocol";

/** The full capability mask. */
export const ALL = Object.values(CAPABILITY).reduce(
  (mask, bit) => mask | bit,
  0,
);

/**
 * A callable policy stub with the old static store's mutability, for specs
 * that grant and revoke mid-test. Falls back to the full mask for unknown
 * identities unless configured otherwise.
 *
 * @param {Record<string, string[]|number>} [entries] Identity hash to
 *   granted capabilities.
 * @param {string[]|number} [fallback] Mask granted to identities without an
 *   entry; defaults to the full mask (protocol specs exercise handlers, not
 *   authorization).
 * @returns {((identityHash: string, context: any) => number) & {
 *   grant: (identityHash: string, capabilities: string[]|number) => void,
 *   revoke: (identityHash: string) => void,
 * }}
 */
export function staticPolicy(entries = {}, fallback = ALL) {
  /** @type {Map<string, number>} */
  const identities = new Map(
    Object.entries(entries).map(([hash, granted]) => [
      hash,
      typeof granted === "number" ? granted : maskOf(granted),
    ]),
  );
  /**
   * @param {string} identityHash
   * @returns {number}
   */
  const policy = (identityHash) =>
    identities.get(identityHash) ?? maskOf(fallback);
  policy.grant = (identityHash, capabilities) => {
    identities.set(
      identityHash,
      typeof capabilities === "number" ? capabilities : maskOf(capabilities),
    );
  };
  policy.revoke = (identityHash) => {
    identities.delete(identityHash);
  };
  return /** @type {any} */ (policy);
}

/**
 * @param {string[]|number} capabilities
 * @returns {number}
 */
function maskOf(capabilities) {
  return typeof capabilities === "number"
    ? capabilities
    : capabilities.reduce(
        /** @type {any} */ ((mask, name) => mask | CAPABILITY[name]),
        0,
      );
}
