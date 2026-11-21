/* @ts-self-types="./utils.d.ts" */

//     @noflo/loader-node - Node.js component discovery for NoFlo
//     (c) 2021-2026 Henri Bergius
//     (c) 2014-2020 Flowhub UG
//     SPDX-License-Identifier: EUPL-1.2

// Guess language from filename
/**
 * @param {string} filename
 * @returns {string}
 */
export function guessLanguageFromFilename(filename) {
  if (/.*\.ts$/.test(filename)) {
    return "typescript";
  }
  return "javascript";
}

/**
 * Whether a bare component name is safe to materialize as a file name
 * under the project's `components/` directory. Remote component writes
 * (`0x25 CMD_COMP_WRITE`) carry attacker-chosen names: a name reaching a
 * `path.resolve(baseDir, "components", …)` join must not carry path
 * separators, traversal segments, or hidden-file leading dots. The
 * library-namespaced prefix is split off before this check — namespaced
 * component names (`math/Add`) are the caller's business.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isSafeComponentName(name) {
  return typeof name === "string" && /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name);
}

/**
 * Assert that a bare component name is safe to use as a file name, with a
 * named error for the rejection.
 *
 * @param {string} name
 * @returns {void}
 * @throws {Error} When the name leaves the file-safe vocabulary.
 */
export function assertSafeComponentName(name) {
  if (!isSafeComponentName(name)) {
    throw new Error(
      `Component name '${name}' is not a safe file name: names must match [A-Za-z0-9_][A-Za-z0-9_.-]* without path separators or traversal`,
    );
  }
}
